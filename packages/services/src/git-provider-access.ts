import { auth } from "@gitpal/auth";
import { db } from "@gitpal/db";
import * as authSchema from "@gitpal/db/schema/auth";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import { env } from "@gitpal/env/server";
import {
	createGitHubAdapter,
	createGitHubAppInstallationAdapter,
	createGitLabAdapter,
	type GitProviderAdapter,
} from "@gitpal/git";
import { createLogger } from "@gitpal/logger";
import { and, desc, eq, sql } from "drizzle-orm";

const log = createLogger("git-provider-access");

export type GitAccount = typeof authSchema.account.$inferSelect;
export type EnterpriseProvider =
	typeof authSchema.enterpriseGitProvider.$inferSelect;
type RepositoryRow = typeof dashboardSchema.repository.$inferSelect;

function normalizePemSecret(value: string) {
	const trimmed = value.trim().replace(/\\n/g, "\n");
	if (trimmed.includes("-----BEGIN")) {
		return trimmed;
	}

	try {
		const decoded = Buffer.from(trimmed, "base64").toString("utf8");
		return decoded.includes("-----BEGIN") ? decoded : trimmed;
	} catch {
		return trimmed;
	}
}

function getCloudGitHubAppConfig() {
	if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) {
		return null;
	}

	return {
		appId: env.GITHUB_APP_ID,
		privateKey: normalizePemSecret(env.GITHUB_APP_PRIVATE_KEY),
	};
}

async function getValidAccessTokenForAccount(account: GitAccount) {
	try {
		const tokens = await auth.api.getAccessToken({
			body: {
				providerId: account.providerId,
				userId: account.userId,
				accountId: account.accountId,
			},
		});

		return tokens.accessToken;
	} catch (error) {
		const accessTokenExpiresAt = account.accessTokenExpiresAt
			? new Date(account.accessTokenExpiresAt)
			: null;

		if (
			account.accessToken &&
			(!accessTokenExpiresAt || accessTokenExpiresAt.getTime() > Date.now())
		) {
			return account.accessToken;
		}

		throw error;
	}
}

export async function getEnterpriseProviderMap() {
	const enterpriseProviders = await db
		.select()
		.from(authSchema.enterpriseGitProvider);

	return new Map(
		enterpriseProviders.map((provider) => [provider.id, provider]),
	);
}

export async function getAccountForProvider({
	userId,
	providerId,
}: {
	userId: string;
	providerId: string;
}) {
	const [account] = await db
		.select()
		.from(authSchema.account)
		.where(
			and(
				eq(authSchema.account.userId, userId),
				eq(authSchema.account.providerId, providerId),
			),
		)
		.limit(1);

	return account ?? null;
}

export async function createAdapterFromAccount({
	account,
	enterpriseProviders,
	webhookSecrets = [],
	webhookSigningSecrets = [],
}: {
	account: GitAccount;
	enterpriseProviders: Map<string, EnterpriseProvider>;
	webhookSecrets?: string[];
	webhookSigningSecrets?: string[];
}): Promise<GitProviderAdapter | null> {
	const accessToken = await getValidAccessTokenForAccount(account);
	if (!accessToken) {
		return null;
	}

	if (account.providerId === "github") {
		return createGitHubAdapter({
			providerId: "github",
			auth: {
				type: "token",
				token: accessToken,
			},
			webhookSecrets,
		});
	}

	if (account.providerId === "gitlab") {
		return createGitLabAdapter({
			providerId: "gitlab",
			baseUrl: "https://gitlab.com",
			apiBaseUrl: "https://gitlab.com/api/v4",
			auth: {
				type: "token",
				token: accessToken,
			},
			webhookSecrets,
			webhookSigningSecrets,
		});
	}

	if (!account.providerId.startsWith("enterprise-git:")) {
		return null;
	}

	const providerId = account.providerId.replace("enterprise-git:", "");
	const provider = enterpriseProviders.get(providerId);

	if (!provider) {
		return null;
	}

	if (provider.type === "github") {
		return createGitHubAdapter({
			providerId: account.providerId,
			label: provider.name,
			authBaseUrl: provider.baseUrl,
			apiBaseUrl: provider.apiBaseUrl,
			auth: {
				type: "token",
				token: accessToken,
			},
			webhookSecrets,
		});
	}

	return createGitLabAdapter({
		providerId: account.providerId,
		label: provider.name,
		baseUrl: provider.baseUrl,
		apiBaseUrl: provider.apiBaseUrl,
		auth: {
			type: "token",
			token: accessToken,
		},
		webhookSecrets,
		webhookSigningSecrets,
	});
}

export async function createAppAdapterForRepository({
	repository,
	webhookSecrets = [],
}: {
	repository: RepositoryRow;
	webhookSecrets?: string[];
}): Promise<GitProviderAdapter | null> {
	if (repository.providerId !== "github") {
		return null;
	}

	const config = getCloudGitHubAppConfig();
	if (!config) {
		return null;
	}

	return createGitHubAppInstallationAdapter({
		providerId: "github",
		appId: config.appId,
		privateKey: config.privateKey,
		repositoryPath: repository.repositoryPath,
		webhookSecrets,
	});
}

export async function createAdapterForUserProvider({
	userId,
	providerId,
	webhookSecrets = [],
	webhookSigningSecrets = [],
}: {
	userId: string;
	providerId: string;
	webhookSecrets?: string[];
	webhookSigningSecrets?: string[];
}) {
	const [enterpriseProviders, account] = await Promise.all([
		getEnterpriseProviderMap(),
		getAccountForProvider({ userId, providerId }),
	]);

	if (!account) {
		return null;
	}

	return createAdapterFromAccount({
		account,
		enterpriseProviders,
		webhookSecrets,
		webhookSigningSecrets,
	});
}

export async function getAutomationActorForRepository({
	repositoryId,
	providerId,
}: {
	repositoryId: string;
	providerId: string;
}) {
	const candidates = await db
		.select({
			userId: dashboardSchema.repositoryAccess.userId,
			account: authSchema.account,
			repository: dashboardSchema.repository,
			organizationRole: authSchema.member.role,
			lastSeenAt: dashboardSchema.repositoryAccess.lastSeenAt,
			roleRank: sql<number>`
				case
					when ${authSchema.member.role} = 'owner' then 0
					when ${authSchema.member.role} = 'admin' then 1
					else 2
				end
			`.as("role_rank"),
		})
		.from(dashboardSchema.repositoryAccess)
		.innerJoin(
			dashboardSchema.repository,
			eq(
				dashboardSchema.repositoryAccess.repositoryId,
				dashboardSchema.repository.id,
			),
		)
		.innerJoin(
			authSchema.account,
			and(
				eq(authSchema.account.userId, dashboardSchema.repositoryAccess.userId),
				eq(authSchema.account.providerId, providerId),
			),
		)
		.innerJoin(
			authSchema.member,
			and(
				eq(authSchema.member.userId, dashboardSchema.repositoryAccess.userId),
				eq(
					authSchema.member.organizationId,
					dashboardSchema.repository.organizationId,
				),
			),
		)
		.where(
			and(
				eq(dashboardSchema.repositoryAccess.repositoryId, repositoryId),
				eq(dashboardSchema.repository.providerId, providerId),
				eq(dashboardSchema.repositoryAccess.enabled, true),
			),
		)
		.orderBy(sql`role_rank`, desc(dashboardSchema.repositoryAccess.lastSeenAt))
		.limit(10);

	if (candidates.length === 0) {
		return null;
	}

	const enterpriseProviders = await getEnterpriseProviderMap();
	const primaryCandidate = candidates[0];
	if (primaryCandidate) {
		try {
			const appAdapter = await createAppAdapterForRepository({
				repository: primaryCandidate.repository,
			});
			if (appAdapter) {
				return {
					userId: primaryCandidate.userId,
					account: primaryCandidate.account,
					organizationRole: primaryCandidate.organizationRole,
					adapter: appAdapter,
					credentialSource: "app" as const,
				};
			}
		} catch (error) {
			log.warn(
				{
					err: error,
					repositoryId,
					providerId,
					repositoryPath: primaryCandidate.repository.repositoryPath,
				},
				"App-backed provider adapter could not be created; falling back to user credentials.",
			);
		}
	}

	for (const candidate of candidates) {
		try {
			const adapter = await createAdapterFromAccount({
				account: candidate.account,
				enterpriseProviders,
			});

			if (!adapter) {
				continue;
			}

			return {
				userId: candidate.userId,
				account: candidate.account,
				organizationRole: candidate.organizationRole,
				adapter,
				credentialSource: "user" as const,
			};
		} catch (error) {
			log.warn(
				{
					err: error,
					repositoryId,
					providerId,
					userId: candidate.userId,
				},
				"Provider account could not create an automation adapter; trying next candidate.",
			);
		}
	}

	return null;
}
