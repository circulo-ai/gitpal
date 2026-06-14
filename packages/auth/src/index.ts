import { createDb } from "@gitpal/db";
import * as schema from "@gitpal/db/schema/auth";
import { env } from "@gitpal/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
	type GenericOAuthConfig,
	genericOAuth,
} from "better-auth/plugins/generic-oauth";

type GithubEmail = {
	email: string;
	primary?: boolean;
	verified?: boolean;
};

type GithubProfile = {
	id: number;
	login: string;
	name?: string | null;
	email?: string | null;
	avatar_url?: string | null;
};

type GitLabOidcProfile = {
	sub?: string;
	email?: string;
	email_verified?: boolean;
	name?: string;
	preferred_username?: string;
	picture?: string;
};

type GitLabProfile = {
	id: number;
	username?: string;
	name?: string | null;
	email?: string | null;
	public_email?: string | null;
	avatar_url?: string | null;
};

function normalizeBaseUrl(value: string) {
	return value.replace(/\/+$/, "");
}

async function fetchJson<T>(url: string, init?: RequestInit) {
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

async function getGithubUserInfo(
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

async function getGitLabUserInfo(
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

function createGithubProvider({
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

function createGitLabProvider({
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

function createOAuthProviders() {
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
		env.GITHUB_ENTERPRISE_URL &&
		env.GITHUB_ENTERPRISE_CLIENT_ID &&
		env.GITHUB_ENTERPRISE_CLIENT_SECRET
			? createGithubProvider({
					providerId: "github-enterprise",
					authBaseUrl: env.GITHUB_ENTERPRISE_URL,
					apiBaseUrl: `${normalizeBaseUrl(env.GITHUB_ENTERPRISE_URL)}/api/v3`,
					clientId: env.GITHUB_ENTERPRISE_CLIENT_ID,
					clientSecret: env.GITHUB_ENTERPRISE_CLIENT_SECRET,
				})
			: null,
		env.GITLAB_ENTERPRISE_URL &&
		env.GITLAB_ENTERPRISE_CLIENT_ID &&
		env.GITLAB_ENTERPRISE_CLIENT_SECRET
			? createGitLabProvider({
					providerId: "gitlab-enterprise",
					authBaseUrl: env.GITLAB_ENTERPRISE_URL,
					apiBaseUrl: `${normalizeBaseUrl(env.GITLAB_ENTERPRISE_URL)}/api/v4`,
					clientId: env.GITLAB_ENTERPRISE_CLIENT_ID,
					clientSecret: env.GITLAB_ENTERPRISE_CLIENT_SECRET,
				})
			: null,
	];

	return providers.filter(
		(provider): provider is GenericOAuthConfig => provider !== null,
	);
}

export function createAuth() {
	const db = createDb();

	return betterAuth({
		appName: "GitPal",
		database: drizzleAdapter(db, {
			provider: "pg",
			schema,
		}),
		trustedOrigins: [env.CORS_ORIGIN],
		emailAndPassword: {
			enabled: false,
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		plugins: [
			genericOAuth({
				config: createOAuthProviders(),
			}),
		],
		advanced: {
			defaultCookieAttributes: {
				sameSite: "none",
				secure: true,
				httpOnly: true,
			},
		},
	});
}

export const auth = createAuth();
