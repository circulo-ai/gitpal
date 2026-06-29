import { apiKey } from "@better-auth/api-key";
import { db } from "@gitpal/db";
import * as schema from "@gitpal/db/schema/auth";
import { env } from "@gitpal/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
	decryptOAuthToken,
	refreshAccessToken as refreshOAuthAccessToken,
	setTokenUtil,
} from "better-auth/oauth2";
import { organization } from "better-auth/plugins/organization";
import { and, eq, isNotNull, lte, or } from "drizzle-orm";

import {
	createCloudOAuthPlugin,
	createEnterpriseGitAuthPlugin,
	createEnterpriseGitOAuthConfig,
	findEnterpriseGitProviderById,
} from "./enterprise-git";
import { workspaceAc, workspaceRoles } from "./organization-access";

export function createAuth() {
	return betterAuth({
		appName: "GitPal",
		database: drizzleAdapter(db, {
			provider: "pg",
			schema,
		}),
		account: {
			encryptOAuthTokens: true,
		},
		trustedOrigins: [env.CORS_ORIGIN],
		emailAndPassword: {
			enabled: false,
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		session: {
			expiresIn: 60 * 60 * 24 * 7,
			updateAge: 60 * 60 * 24,
			freshAge: 60 * 60 * 24,
			cookieCache: {
				enabled: true,
				maxAge: 5 * 60,
				strategy: "compact",
			},
		},
		rateLimit: {
			enabled: env.NODE_ENV === "production",
			window: 60,
			max: 120,
			storage: "database",
			customRules: {
				"/sign-in/*": { window: 60, max: 20 },
				"/sign-up/*": { window: 60, max: 10 },
				"/organization/*": { window: 60, max: 60 },
				"/enterprise-git-host/*": { window: 60, max: 30 },
			},
		},
		plugins: [
			createCloudOAuthPlugin(),
			createEnterpriseGitAuthPlugin(),
			apiKey({
				defaultPrefix: "gp_",
				requireName: true,
				enableMetadata: true,
				rateLimit: {
					enabled: true,
					timeWindow: 1000 * 60 * 60 * 24,
					maxRequests: 5_000,
				},
				schema: {
					apikey: {
						modelName: "apiKey",
					},
				},
			}),
			organization({
				allowUserToCreateOrganization: false,
				creatorRole: "owner",
				ac: workspaceAc,
				roles: workspaceRoles,
				teams: {
					enabled: true,
					defaultTeam: {
						enabled: true,
					},
				},
				dynamicAccessControl: {
					enabled: true,
				},
				schema: {
					session: {
						fields: {
							activeOrganizationId: "activeOrganizationId",
							activeTeamId: "activeTeamId",
						},
					},
					organizationRole: {
						modelName: "organization_role",
					},
					teamMember: {
						modelName: "team_member",
					},
				},
			}),
		],
		advanced: {
			defaultCookieAttributes:
				env.NODE_ENV === "production"
					? {
							sameSite: "lax",
							secure: env.NODE_ENV === "production",
							httpOnly: true,
							domain: env.BETTER_AUTH_COOKIE_DOMAIN ?? undefined,
						}
					: undefined,
		},
	});
}

export const auth = createAuth();

function isLikelyEncryptedProviderToken(token: string | null) {
	if (!token) return true;
	return (
		token.startsWith("$ba$") ||
		(token.length % 2 === 0 && /^[0-9a-f]+$/i.test(token))
	);
}

async function encryptLegacyProviderTokens() {
	const context = (await auth.$context) as unknown as Parameters<
		typeof decryptOAuthToken
	>[1];
	const accounts = await db
		.select()
		.from(schema.account)
		.where(
			or(
				isNotNull(schema.account.accessToken),
				isNotNull(schema.account.refreshToken),
			),
		);
	const legacyAccounts = accounts.filter(
		(account) =>
			!isLikelyEncryptedProviderToken(account.accessToken) ||
			!isLikelyEncryptedProviderToken(account.refreshToken),
	);
	await Promise.all(
		legacyAccounts.map(async (account) => {
			const accessToken = account.accessToken
				? await setTokenUtil(account.accessToken, context)
				: null;
			const refreshToken = account.refreshToken
				? await setTokenUtil(account.refreshToken, context)
				: null;
			await db
				.update(schema.account)
				.set({ accessToken, refreshToken, updatedAt: new Date() })
				.where(eq(schema.account.id, account.id));
		}),
	);
	return legacyAccounts.length;
}

async function refreshEnterpriseProviderAccount(
	account: typeof schema.account.$inferSelect,
) {
	const providerRecordId = account.providerId.replace("enterprise-git:", "");
	const provider = await findEnterpriseGitProviderById(providerRecordId);
	if (!provider || !account.refreshToken) return false;
	const config = createEnterpriseGitOAuthConfig(provider);
	const context = (await auth.$context) as unknown as Parameters<
		typeof decryptOAuthToken
	>[1];
	const refreshToken = await decryptOAuthToken(account.refreshToken, context);
	const tokens = await refreshOAuthAccessToken({
		refreshToken,
		tokenEndpoint: config.tokenUrl ?? "",
		authentication: config.authentication,
		options: {
			clientId: config.clientId,
			clientSecret: config.clientSecret,
		},
	});
	await db
		.update(schema.account)
		.set({
			accessToken: await setTokenUtil(tokens.accessToken, context),
			accessTokenExpiresAt: tokens.accessTokenExpiresAt ?? null,
			refreshToken: tokens.refreshToken
				? await setTokenUtil(tokens.refreshToken, context)
				: account.refreshToken,
			refreshTokenExpiresAt:
				tokens.refreshTokenExpiresAt ?? account.refreshTokenExpiresAt,
			updatedAt: new Date(),
		})
		.where(eq(schema.account.id, account.id));
	return true;
}

export async function refreshExpiringProviderAccounts() {
	const encrypted = await encryptLegacyProviderTokens();
	const refreshBefore = new Date(Date.now() + 24 * 60 * 60 * 1000);
	const accounts = await db
		.select()
		.from(schema.account)
		.where(
			and(
				isNotNull(schema.account.refreshToken),
				isNotNull(schema.account.accessTokenExpiresAt),
				lte(schema.account.accessTokenExpiresAt, refreshBefore),
			),
		);
	const results = await Promise.allSettled(
		accounts.map(async (account) => {
			if (account.providerId.startsWith("enterprise-git:")) {
				return refreshEnterpriseProviderAccount(account);
			}
			await auth.api.refreshToken({
				body: {
					providerId: account.providerId,
					userId: account.userId,
					accountId: account.accountId,
				},
			});
			return true;
		}),
	);
	return {
		encrypted,
		checked: accounts.length,
		failed: results.filter((result) => result.status === "rejected").length,
	};
}

export async function decryptStoredProviderToken(
	token: string | null | undefined,
) {
	if (!token) {
		return null;
	}

	const context = (await auth.$context) as unknown as Parameters<
		typeof decryptOAuthToken
	>[1];

	return decryptOAuthToken(token, context);
}

export {
	decryptSecret,
	type EnterpriseGitProviderType,
	encryptSecret,
	getEnterpriseGitApiBaseUrl,
	getEnterpriseGitProviderLabel,
	lookupEnterpriseGitProvider,
	normalizeGitHostUrl,
	registerEnterpriseGitProvider,
} from "./enterprise-git";
export {
	workspaceAc,
	workspacePermissionOptions,
	workspaceRoleLabels,
	workspaceRoles,
	workspaceStatements,
} from "./organization-access";
