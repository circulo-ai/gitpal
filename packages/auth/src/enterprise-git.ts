import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";
import { sso } from "@better-auth/sso";
import { createDb } from "@gitpal/db";
import * as schema from "@gitpal/db/schema/auth";
import { env } from "@gitpal/env/server";
import { getGitApiBaseUrl, normalizeGitHostUrl } from "@gitpal/git";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import {
	applyDefaultAccessTokenExpiry,
	createAuthorizationURL,
	generateState,
	handleOAuthUserInfo,
	type OAuth2Tokens,
	parseState,
	validateAuthorizationCode,
} from "better-auth/oauth2";
import {
	type GenericOAuthConfig,
	genericOAuth,
} from "better-auth/plugins/generic-oauth";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export { normalizeGitHostUrl } from "@gitpal/git";

export type EnterpriseGitProviderType = "github" | "gitlab";

export type GithubEmail = {
	email: string;
	primary?: boolean;
	verified?: boolean;
};

export type GithubProfile = {
	id: number;
	login: string;
	name?: string | null;
	email?: string | null;
	avatar_url?: string | null;
};

export type GitLabOidcProfile = {
	sub?: string;
	email?: string;
	email_verified?: boolean;
	name?: string;
	preferred_username?: string;
	picture?: string;
};

export type GitLabProfile = {
	id: number;
	username?: string;
	name?: string | null;
	email?: string | null;
	public_email?: string | null;
	avatar_url?: string | null;
};

type EnterpriseGitProviderRecord =
	typeof schema.enterpriseGitProvider.$inferSelect;

export type EnterpriseGitProviderSetupInput = {
	type: EnterpriseGitProviderType;
	baseUrl: string;
	name?: string;
	clientId: string;
	clientSecret: string;
	githubAppName?: string;
	githubAppClientId?: string;
	webhookSecret?: string;
};

export type PublicEnterpriseGitProvider = {
	id: string;
	type: EnterpriseGitProviderType;
	name: string;
	baseUrl: string;
	apiBaseUrl: string;
	githubAppName: string | null;
	githubAppClientId: string | null;
	createdAt: Date;
	updatedAt: Date;
};

export type EnterpriseGitProviderLookupResult = {
	configured: boolean;
	callbackUrl: string;
	provider: PublicEnterpriseGitProvider | null;
};

const enterpriseGitProviderTypeSchema = z.enum(["github", "gitlab"]);
const secretEnvelopeVersion = "v1";

export function normalizeBaseUrl(value: string) {
	return value.replace(/\/+$/, "");
}

export function getEnterpriseGitApiBaseUrl(
	type: EnterpriseGitProviderType,
	baseUrl: string,
) {
	return getGitApiBaseUrl(type, baseUrl);
}

export function getEnterpriseGitProviderLabel(type: EnterpriseGitProviderType) {
	return type === "github" ? "GitHub Enterprise Server" : "Self-managed GitLab";
}

export function getEnterpriseGitAccountProviderId(
	provider: Pick<EnterpriseGitProviderRecord, "id">,
) {
	return `enterprise-git:${provider.id}`;
}

export function getEnterpriseGitProviderId(
	type: EnterpriseGitProviderType,
	baseUrl: string,
) {
	const normalizedBaseUrl = normalizeGitHostUrl(baseUrl);
	const hostHash = createHash("sha256")
		.update(`${type}:${normalizedBaseUrl}`)
		.digest("hex")
		.slice(0, 24);

	return `enterprise-${type}-${hostHash}`;
}

export function getEnterpriseGitCallbackUrl({
	type,
	baseUrl,
}: {
	type: EnterpriseGitProviderType;
	baseUrl: string;
}) {
	const providerId = getEnterpriseGitProviderId(type, baseUrl);

	return `${normalizeBaseUrl(env.BETTER_AUTH_URL)}/enterprise-git-host/callback/${providerId}`;
}

export function encryptSecret(value: string) {
	const iv = randomBytes(12);
	const key = createHash("sha256").update(env.BETTER_AUTH_SECRET).digest();
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const ciphertext = Buffer.concat([
		cipher.update(value, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();

	return [
		secretEnvelopeVersion,
		iv.toString("base64url"),
		tag.toString("base64url"),
		ciphertext.toString("base64url"),
	].join(":");
}

export function decryptSecret(value: string) {
	const [version, iv, tag, ciphertext] = value.split(":");

	if (version !== secretEnvelopeVersion || !iv || !tag || !ciphertext) {
		return value;
	}

	const key = createHash("sha256").update(env.BETTER_AUTH_SECRET).digest();
	const decipher = createDecipheriv(
		"aes-256-gcm",
		key,
		Buffer.from(iv, "base64url"),
	);
	decipher.setAuthTag(Buffer.from(tag, "base64url"));

	return Buffer.concat([
		decipher.update(Buffer.from(ciphertext, "base64url")),
		decipher.final(),
	]).toString("utf8");
}

export function toPublicEnterpriseGitProvider(
	provider: EnterpriseGitProviderRecord,
): PublicEnterpriseGitProvider {
	return {
		id: provider.id,
		type: provider.type as EnterpriseGitProviderType,
		name: provider.name,
		baseUrl: provider.baseUrl,
		apiBaseUrl: provider.apiBaseUrl,
		githubAppName: provider.githubAppName,
		githubAppClientId: provider.githubAppClientId,
		createdAt: provider.createdAt,
		updatedAt: provider.updatedAt,
	};
}

export async function lookupEnterpriseGitProvider({
	type,
	baseUrl,
}: {
	type: EnterpriseGitProviderType;
	baseUrl: string;
}): Promise<EnterpriseGitProviderLookupResult> {
	const provider = await findEnterpriseGitProvider(type, baseUrl);

	return {
		configured: Boolean(provider),
		callbackUrl: getEnterpriseGitCallbackUrl({ type, baseUrl }),
		provider: provider ? toPublicEnterpriseGitProvider(provider) : null,
	};
}

export async function registerEnterpriseGitProvider({
	type,
	baseUrl,
	name,
	clientId,
	clientSecret,
	githubAppName,
	githubAppClientId,
	webhookSecret,
}: EnterpriseGitProviderSetupInput) {
	const db = createDb();
	const normalizedBaseUrl = normalizeGitHostUrl(baseUrl);
	const existing = await findEnterpriseGitProvider(type, normalizedBaseUrl);

	if (existing) {
		return {
			provider: toPublicEnterpriseGitProvider(existing),
			created: false,
		};
	}

	const now = new Date();
	const [provider] = await db
		.insert(schema.enterpriseGitProvider)
		.values({
			id: getEnterpriseGitProviderId(type, normalizedBaseUrl),
			type,
			name: name?.trim() || getEnterpriseGitProviderLabel(type),
			baseUrl: normalizedBaseUrl,
			apiBaseUrl: getEnterpriseGitApiBaseUrl(type, normalizedBaseUrl),
			clientId: clientId.trim(),
			encryptedClientSecret: encryptSecret(clientSecret),
			githubAppName: githubAppName?.trim() || null,
			githubAppClientId: githubAppClientId?.trim() || null,
			webhookSecret: webhookSecret?.trim() || null,
			createdAt: now,
			updatedAt: now,
		})
		.returning();

	if (!provider) {
		throw new Error("Unable to create enterprise Git provider.");
	}

	return {
		provider: toPublicEnterpriseGitProvider(provider),
		created: true,
	};
}

export async function fetchJson<T>(url: string, init?: RequestInit) {
	try {
		const response = await fetch(url, {
			...init,
			headers: {
				Accept: "application/json",
				...(init?.headers ?? {}),
			},
		});

		if (!response.ok) {
			return null;
		}

		return (await response.json()) as T;
	} catch {
		return null;
	}
}

export async function getGithubUserInfo(
	apiBaseUrl: string,
	accessToken?: string | null,
) {
	if (!accessToken) {
		return null;
	}

	const profile = await fetchJson<GithubProfile>(`${apiBaseUrl}/user`, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"X-GitHub-Api-Version": "2022-11-28",
		},
	});

	if (!profile) {
		return null;
	}

	const emails = await fetchJson<GithubEmail[]>(`${apiBaseUrl}/user/emails`, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"X-GitHub-Api-Version": "2022-11-28",
		},
	});

	const email =
		emails?.find((entry) => entry.primary && entry.verified)?.email ??
		emails?.find((entry) => entry.verified)?.email ??
		emails?.[0]?.email ??
		profile.email ??
		null;

	if (!email) {
		return null;
	}

	return {
		id: String(profile.id),
		email,
		emailVerified: Boolean(emails?.some((entry) => entry.verified)),
		...(profile.avatar_url ? { image: profile.avatar_url } : {}),
		name: profile.name ?? profile.login,
	};
}

export async function getGitLabUserInfo(
	apiBaseUrl: string,
	accessToken?: string | null,
) {
	if (!accessToken) {
		return null;
	}

	const oidcProfile = await fetchJson<GitLabOidcProfile>(
		`${apiBaseUrl.replace(/\/api\/v4$/, "")}/oauth/userinfo`,
		{
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		},
	);

	if (oidcProfile?.email && oidcProfile.sub) {
		return {
			id: String(oidcProfile.sub),
			email: oidcProfile.email,
			emailVerified: oidcProfile.email_verified ?? true,
			...(oidcProfile.picture ? { image: oidcProfile.picture } : {}),
			name:
				oidcProfile.name ?? oidcProfile.preferred_username ?? oidcProfile.email,
		};
	}

	const profile = await fetchJson<GitLabProfile>(`${apiBaseUrl}/user`, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!profile) {
		return null;
	}

	const email = profile.email ?? profile.public_email ?? null;

	if (!email) {
		return null;
	}

	return {
		id: String(profile.id),
		email,
		emailVerified: Boolean(profile.email),
		...(profile.avatar_url ? { image: profile.avatar_url } : {}),
		name: profile.name ?? profile.username ?? email,
	};
}

export function createGithubProvider({
	providerId,
	authBaseUrl,
	apiBaseUrl,
	clientId,
	clientSecret,
}: {
	providerId: string;
	authBaseUrl: string;
	apiBaseUrl: string;
	clientId: string;
	clientSecret: string;
}): GenericOAuthConfig {
	return {
		providerId,
		authorizationUrl: `${normalizeBaseUrl(authBaseUrl)}/login/oauth/authorize`,
		tokenUrl: `${normalizeBaseUrl(authBaseUrl)}/login/oauth/access_token`,
		clientId,
		clientSecret,
		scopes: ["read:user", "user:email", "read:org"],
		getUserInfo: async (tokens) => {
			return getGithubUserInfo(apiBaseUrl, tokens.accessToken);
		},
	};
}

export function createGitLabProvider({
	providerId,
	authBaseUrl,
	apiBaseUrl,
	clientId,
	clientSecret,
}: {
	providerId: string;
	authBaseUrl: string;
	apiBaseUrl: string;
	clientId: string;
	clientSecret: string;
}): GenericOAuthConfig {
	return {
		providerId,
		authorizationUrl: `${normalizeBaseUrl(authBaseUrl)}/oauth/authorize`,
		tokenUrl: `${normalizeBaseUrl(authBaseUrl)}/oauth/token`,
		clientId,
		clientSecret,
		scopes: ["api", "read_user", "email", "openid"],
		getUserInfo: async (tokens) => {
			return getGitLabUserInfo(apiBaseUrl, tokens.accessToken);
		},
	};
}

export function createCloudOAuthPlugin() {
	const providers: Array<GenericOAuthConfig | null> = [
		env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
			? createGithubProvider({
					providerId: "github",
					authBaseUrl: "https://github.com",
					apiBaseUrl: "https://api.github.com",
					clientId: env.GITHUB_CLIENT_ID,
					clientSecret: env.GITHUB_CLIENT_SECRET,
				})
			: null,
		env.GITLAB_CLIENT_ID && env.GITLAB_CLIENT_SECRET
			? createGitLabProvider({
					providerId: "gitlab",
					authBaseUrl: "https://gitlab.com",
					apiBaseUrl: "https://gitlab.com/api/v4",
					clientId: env.GITLAB_CLIENT_ID,
					clientSecret: env.GITLAB_CLIENT_SECRET,
				})
			: null,
	];

	return genericOAuth({
		config: providers.filter(
			(provider): provider is GenericOAuthConfig => provider !== null,
		),
	});
}

export function createSsoPlugin() {
	return sso({
		domainVerification: {
			enabled: true,
			tokenPrefix: "gitpal-sso",
		},
		saml: {
			enableInResponseToValidation: true,
			allowIdpInitiated: true,
			clockSkew: env.NODE_ENV === "production" ? 60 * 1000 : 5 * 60 * 1000,
			requireTimestamps: env.NODE_ENV === "production",
		},
	});
}

const enterpriseGitHostSignInBodySchema = z.object({
	type: enterpriseGitProviderTypeSchema,
	baseUrl: z.string().min(1),
	callbackURL: z.string().default("/dashboard"),
	errorCallbackURL: z.string().optional(),
	newUserCallbackURL: z.string().optional(),
	disableRedirect: z.boolean().optional(),
	requestSignUp: z.boolean().optional(),
	scopes: z.array(z.string()).optional(),
});

const enterpriseGitHostCallbackQuerySchema = z.object({
	code: z.string().optional(),
	error: z.string().optional(),
	error_description: z.string().optional(),
	state: z.string().optional(),
});

async function findEnterpriseGitProvider(
	type: EnterpriseGitProviderType,
	baseUrl: string,
) {
	const db = createDb();
	const normalizedBaseUrl = normalizeGitHostUrl(baseUrl);

	const [provider] = await db
		.select()
		.from(schema.enterpriseGitProvider)
		.where(
			and(
				eq(schema.enterpriseGitProvider.type, type),
				eq(schema.enterpriseGitProvider.baseUrl, normalizedBaseUrl),
			),
		)
		.limit(1);

	return provider ?? null;
}

async function findEnterpriseGitProviderById(id: string) {
	const db = createDb();
	const [provider] = await db
		.select()
		.from(schema.enterpriseGitProvider)
		.where(eq(schema.enterpriseGitProvider.id, id))
		.limit(1);

	return provider ?? null;
}

function createEnterpriseGitOAuthConfig(provider: EnterpriseGitProviderRecord) {
	const clientSecret = decryptSecret(provider.encryptedClientSecret);

	return provider.type === "github"
		? createGithubProvider({
				providerId: getEnterpriseGitAccountProviderId(provider),
				authBaseUrl: provider.baseUrl,
				apiBaseUrl: provider.apiBaseUrl,
				clientId: provider.clientId,
				clientSecret,
			})
		: createGitLabProvider({
				providerId: getEnterpriseGitAccountProviderId(provider),
				authBaseUrl: provider.baseUrl,
				apiBaseUrl: provider.apiBaseUrl,
				clientId: provider.clientId,
				clientSecret,
			});
}

function createRedirectUrl(baseURL: string, target: string, error?: string) {
	const url = new URL(target || "/", baseURL);

	if (error) {
		url.searchParams.set("error", error);
	}

	return url.toString();
}

function getFrontendBaseURL() {
	// In this stack CORS_ORIGIN is the frontend app origin, so redirects land on the web app.
	return env.CORS_ORIGIN;
}

export function createEnterpriseGitAuthPlugin() {
	return {
		id: "enterprise-git-host",
		version: "0.1.0",
		endpoints: {
			signInEnterpriseGitHost: createAuthEndpoint(
				"/sign-in/enterprise-git-host",
				{
					method: "POST",
					body: enterpriseGitHostSignInBodySchema,
					metadata: {
						openapi: {
							operationId: "signInEnterpriseGitHost",
							description:
								"Sign in with a database-backed GitHub Enterprise Server or self-managed GitLab OAuth app.",
							responses: {
								"200": {
									description: "Enterprise Git host OAuth URL",
								},
							},
						},
					},
				},
				async (ctx) => {
					let provider: EnterpriseGitProviderRecord | null = null;

					try {
						provider = await findEnterpriseGitProvider(
							ctx.body.type,
							ctx.body.baseUrl,
						);
					} catch (error) {
						throw new APIError("BAD_REQUEST", {
							message:
								error instanceof Error
									? error.message
									: "Invalid enterprise host URL.",
						});
					}

					if (!provider) {
						throw new APIError("NOT_FOUND", {
							message: `${getEnterpriseGitProviderLabel(ctx.body.type)} is not onboarded yet.`,
						});
					}

					const config = createEnterpriseGitOAuthConfig(provider);
					const { state, codeVerifier } = await generateState(ctx, undefined, {
						enterpriseGitProviderId: provider.id,
					});
					const redirectURI = `${ctx.context.baseURL}/enterprise-git-host/callback/${provider.id}`;
					const authUrl = await createAuthorizationURL({
						id: config.providerId,
						options: {
							clientId: config.clientId,
							clientSecret: config.clientSecret,
							redirectURI: config.redirectURI,
						},
						authorizationEndpoint: config.authorizationUrl ?? "",
						state,
						codeVerifier: config.pkce ? codeVerifier : undefined,
						scopes: ctx.body.scopes
							? [...ctx.body.scopes, ...(config.scopes ?? [])]
							: (config.scopes ?? []),
						redirectURI,
					});

					return ctx.json({
						url: authUrl.toString(),
						redirect: !ctx.body.disableRedirect,
					});
				},
			),
			enterpriseGitHostCallback: createAuthEndpoint(
				"/enterprise-git-host/callback/:providerId",
				{
					method: "GET",
					query: enterpriseGitHostCallbackQuerySchema,
					metadata: {
						openapi: {
							operationId: "enterpriseGitHostCallback",
							description: "Enterprise Git host OAuth callback",
							responses: {
								"302": {
									description: "Redirects to the requested callback URL",
								},
							},
						},
					},
				},
				async (ctx) => {
					const state = await parseState(ctx);
					const callbackURL = state.callbackURL || "/dashboard";
					const errorURL = state.errorURL || callbackURL;

					if (ctx.query.error || !ctx.query.code) {
						throw ctx.redirect(
							createRedirectUrl(
								getFrontendBaseURL(),
								errorURL,
								ctx.query.error ?? "oauth_code_missing",
							),
						);
					}

					const providerId = ctx.params?.providerId;
					const expectedProviderId = state.enterpriseGitProviderId;

					if (
						!providerId ||
						typeof expectedProviderId !== "string" ||
						providerId !== expectedProviderId
					) {
						throw ctx.redirect(
							createRedirectUrl(
								getFrontendBaseURL(),
								errorURL,
								"state_mismatch",
							),
						);
					}

					const provider = await findEnterpriseGitProviderById(providerId);

					if (!provider) {
						throw ctx.redirect(
							createRedirectUrl(
								getFrontendBaseURL(),
								errorURL,
								"provider_not_found",
							),
						);
					}

					const config = createEnterpriseGitOAuthConfig(provider);
					const redirectURI = `${ctx.context.baseURL}/enterprise-git-host/callback/${provider.id}`;
					let tokens: OAuth2Tokens | null = null;

					try {
						tokens = applyDefaultAccessTokenExpiry(
							await validateAuthorizationCode({
								code: ctx.query.code,
								codeVerifier: config.pkce ? state.codeVerifier : undefined,
								redirectURI,
								options: {
									clientId: config.clientId,
									clientSecret: config.clientSecret,
									redirectURI: config.redirectURI,
								},
								tokenEndpoint: config.tokenUrl ?? "",
								authentication: config.authentication,
							}),
							config.accessTokenExpiresIn,
						);
					} catch (error) {
						ctx.context.logger.error("Enterprise Git OAuth failed", error);
						throw ctx.redirect(
							createRedirectUrl(
								getFrontendBaseURL(),
								errorURL,
								"oauth_code_verification_failed",
							),
						);
					}

					const userInfo = await config.getUserInfo?.(tokens);

					if (!userInfo?.email || !userInfo.id || !userInfo.name) {
						throw ctx.redirect(
							createRedirectUrl(
								getFrontendBaseURL(),
								errorURL,
								"user_info_missing",
							),
						);
					}

					const result = await handleOAuthUserInfo(ctx, {
						userInfo: {
							...userInfo,
							id: String(userInfo.id),
							email: userInfo.email.toLowerCase(),
							emailVerified: userInfo.emailVerified ?? false,
							name: userInfo.name,
						},
						account: {
							providerId: config.providerId,
							accountId: String(userInfo.id),
							...tokens,
							scope: tokens.scopes?.join(","),
						},
						callbackURL,
						disableSignUp: false,
						overrideUserInfo: config.overrideUserInfo,
					});

					if (result.error || !result.data) {
						throw ctx.redirect(
							createRedirectUrl(
								getFrontendBaseURL(),
								errorURL,
								result.error?.replaceAll(" ", "_") ?? "oauth_link_error",
							),
						);
					}

					await setSessionCookie(ctx, result.data);
					ctx.context.newSession = result.data;

					throw ctx.redirect(
						createRedirectUrl(
							getFrontendBaseURL(),
							result.isRegister ? state.newUserURL || callbackURL : callbackURL,
						),
					);
				},
			),
		},
	};
}
