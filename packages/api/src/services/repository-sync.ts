import { createHash } from "node:crypto";
import { createDb } from "@gitpal/db";
import * as authSchema from "@gitpal/db/schema/auth";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import {
	createGitHubAdapter,
	createGitLabAdapter,
	type GitProviderAdapter,
	type GitRepository,
} from "@gitpal/git";
import { and, desc, eq, max } from "drizzle-orm";

type Account = typeof authSchema.account.$inferSelect;
type EnterpriseProvider = typeof authSchema.enterpriseGitProvider.$inferSelect;

const db = createDb();
const DEFAULT_REPOSITORY_SYNC_TTL_MS = 15 * 60 * 1000;

type RepositoryAccessRow = typeof dashboardSchema.repositoryAccess.$inferSelect;
type RepositoryRow = typeof dashboardSchema.repository.$inferSelect;

export type RepositorySummary = {
	id: string;
	organizationId: string;
	providerId: string;
	providerType: string;
	providerName: string;
	repositoryId: string;
	repositoryPath: string;
	name: string;
	fullName: string;
	htmlUrl: string;
	defaultBranch: string;
	private: boolean;
	description: string | null;
	ownerLogin: string | null;
	ownerAvatarUrl: string | null;
	enabled: boolean;
	syncState: string;
	lastSyncedAt: string | null;
	lastSeenAt: string;
};

export type RepositorySyncResult = {
	syncedRepositories: number;
	syncedProviders: number;
	skippedProviders: number;
	errors: string[];
};

export type RepositoryProviderSummary = {
	providerId: string;
	label: string;
	type: string;
	baseUrl: string | null;
	apiBaseUrl: string | null;
};

function stableId(parts: Array<string | number | boolean | null | undefined>) {
	return createHash("sha256")
		.update(parts.map((part) => String(part ?? "")).join(":"))
		.digest("hex");
}

function getRepositoryPrimaryId(
	organizationId: string,
	providerId: string,
	repositoryId: string,
) {
	return `repo_${stableId([organizationId, providerId, repositoryId]).slice(0, 32)}`;
}

function getRepositoryAccessId(userId: string, repositoryId: string) {
	return `repo_access_${stableId([userId, repositoryId]).slice(0, 32)}`;
}

function getProviderType(account: Account, provider?: EnterpriseProvider | null) {
	if (provider?.type === "github" || provider?.type === "gitlab") {
		return provider.type;
	}

	if (account.providerId === "github" || account.providerId === "gitlab") {
		return account.providerId;
	}

	return "git";
}

function getProviderName(account: Account, provider?: EnterpriseProvider | null) {
	if (provider) {
		return provider.name;
	}

	return account.providerId === "github"
		? "GitHub"
		: account.providerId === "gitlab"
			? "GitLab"
			: account.providerId;
}

async function createAdapterForAccount(
	account: Account,
	enterpriseProviders: Map<string, EnterpriseProvider>,
): Promise<GitProviderAdapter | null> {
	if (!account.accessToken) {
		return null;
	}

	if (account.providerId === "github") {
		return createGitHubAdapter({
			providerId: "github",
			token: account.accessToken,
		});
	}

	if (account.providerId === "gitlab") {
		return createGitLabAdapter({
			providerId: "gitlab",
			baseUrl: "https://gitlab.com",
			apiBaseUrl: "https://gitlab.com/api/v4",
			token: account.accessToken,
		});
	}

	if (account.providerId.startsWith("enterprise-git:")) {
		const providerId = account.providerId.replace("enterprise-git:", "");
		const provider = enterpriseProviders.get(providerId);

		if (!provider) {
			return null;
		}

		return provider.type === "github"
			? createGitHubAdapter({
					providerId: account.providerId,
					label: provider.name,
					authBaseUrl: provider.baseUrl,
					apiBaseUrl: provider.apiBaseUrl,
					token: account.accessToken,
				})
			: createGitLabAdapter({
					providerId: account.providerId,
					label: provider.name,
					baseUrl: provider.baseUrl,
					apiBaseUrl: provider.apiBaseUrl,
					token: account.accessToken,
				});
	}

	return null;
}

async function upsertRepositoryForUser({
	userId,
	organizationId,
	account,
	repository,
	provider,
}: {
	userId: string;
	organizationId: string;
	account: Account;
	repository: GitRepository;
	provider?: EnterpriseProvider | null;
}) {
	const now = new Date();
	const id = getRepositoryPrimaryId(
		organizationId,
		account.providerId,
		repository.repositoryId,
	);
	const providerType = getProviderType(account, provider);
	const providerName = getProviderName(account, provider);

	await db
		.insert(dashboardSchema.repository)
		.values({
			id,
			organizationId,
			providerId: account.providerId,
			providerType,
			providerName,
			repositoryId: repository.repositoryId,
			repositoryPath: repository.repositoryPath,
			name: repository.name,
			fullName: repository.fullName,
			htmlUrl: repository.htmlUrl,
			defaultBranch: repository.defaultBranch,
			private: repository.private,
			description: repository.description,
			ownerLogin: repository.owner?.login,
			ownerAvatarUrl: repository.owner?.avatarUrl,
			enabled: true,
			syncState: "synced",
			lastSyncedAt: now,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [
				dashboardSchema.repository.organizationId,
				dashboardSchema.repository.providerId,
				dashboardSchema.repository.repositoryId,
			],
			set: {
				providerType,
				providerName,
				organizationId,
				repositoryPath: repository.repositoryPath,
				name: repository.name,
				fullName: repository.fullName,
				htmlUrl: repository.htmlUrl,
				defaultBranch: repository.defaultBranch,
				private: repository.private,
				description: repository.description,
				ownerLogin: repository.owner?.login,
				ownerAvatarUrl: repository.owner?.avatarUrl,
				syncState: "synced",
				lastSyncedAt: now,
				updatedAt: now,
			},
		});

	await db
		.insert(dashboardSchema.repositoryAccess)
		.values({
			id: getRepositoryAccessId(userId, id),
			userId,
			repositoryId: id,
			role: "member",
			enabled: true,
			lastSeenAt: now,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [
				dashboardSchema.repositoryAccess.userId,
				dashboardSchema.repositoryAccess.repositoryId,
			],
			set: {
				lastSeenAt: now,
				updatedAt: now,
			},
		});
}

async function getEnterpriseProviderMap() {
	const enterpriseProviders = await db
		.select()
		.from(authSchema.enterpriseGitProvider);

	return new Map(enterpriseProviders.map((provider) => [provider.id, provider]));
}

async function getAccountForProvider({
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

async function getLatestSyncAt({
	organizationId,
	providerId,
}: {
	organizationId: string;
	providerId: string;
}) {
	const [row] = await db
		.select({
			lastSyncedAt: max(dashboardSchema.repository.lastSyncedAt),
		})
		.from(dashboardSchema.repository)
		.where(
			and(
				eq(dashboardSchema.repository.organizationId, organizationId),
				eq(dashboardSchema.repository.providerId, providerId),
			),
		)
		.limit(1);

	return row?.lastSyncedAt ?? null;
}

function shouldRefreshRepositorySync(
	lastSyncedAt: Date | null,
	ttlMs: number,
) {
	if (!lastSyncedAt) {
		return true;
	}

	return Date.now() - lastSyncedAt.getTime() > ttlMs;
}

async function refreshRepositoriesForAccount(
	userId: string,
	organizationId: string,
	account: Account,
	enterpriseProviders: Map<string, EnterpriseProvider>,
) {
	const adapter = await createAdapterForAccount(account, enterpriseProviders);

	if (!adapter) {
		return {
			syncedRepositories: 0,
			error: null as string | null,
			skipped: true,
		};
	}

	try {
		const provider = account.providerId.startsWith("enterprise-git:")
			? enterpriseProviders.get(account.providerId.replace("enterprise-git:", ""))
			: null;
		const repositories = await adapter.listRepositories();

		for (const repository of repositories) {
			await upsertRepositoryForUser({
				userId,
				organizationId,
				account,
				repository,
				provider,
			});
		}

		return {
			syncedRepositories: repositories.length,
			error: null as string | null,
			skipped: false,
		};
	} catch (error) {
		return {
			syncedRepositories: 0,
			error:
				error instanceof Error
					? `${getProviderName(account)}: ${error.message}`
					: `${getProviderName(account)}: unable to sync repositories`,
			skipped: false,
		};
	}
}

export async function ensureRepositoriesSyncedForUser({
	userId,
	organizationId,
	ttlMs = DEFAULT_REPOSITORY_SYNC_TTL_MS,
}: {
	userId: string;
	organizationId: string | null;
	ttlMs?: number;
}): Promise<RepositorySyncResult> {
	if (!organizationId) {
		return {
			syncedRepositories: 0,
			syncedProviders: 0,
			skippedProviders: 0,
			errors: [],
		};
	}

	const accounts = await db
		.select()
		.from(authSchema.account)
		.where(eq(authSchema.account.userId, userId));
	const enterpriseProviders = await getEnterpriseProviderMap();

	const result: RepositorySyncResult = {
		syncedRepositories: 0,
		syncedProviders: 0,
		skippedProviders: 0,
		errors: [],
	};

	for (const account of accounts) {
		const lastSyncedAt = await getLatestSyncAt({
			organizationId,
			providerId: account.providerId,
		});

		if (!shouldRefreshRepositorySync(lastSyncedAt, ttlMs)) {
			result.skippedProviders += 1;
			continue;
		}

		const syncResult = await refreshRepositoriesForAccount(
			userId,
			organizationId,
			account,
			enterpriseProviders,
		);

		if (syncResult.skipped) {
			result.skippedProviders += 1;
			continue;
		}

		result.syncedProviders += 1;
		result.syncedRepositories += syncResult.syncedRepositories;

		if (syncResult.error) {
			result.errors.push(syncResult.error);
		}
	}

	return result;
}

export async function listRepositoryProvidersForUser({
	userId,
}: {
	userId: string;
}) {
	const accounts = await db
		.select()
		.from(authSchema.account)
		.where(eq(authSchema.account.userId, userId));
	const enterpriseProviders = await getEnterpriseProviderMap();
	const seen = new Set<string>();

	return accounts.flatMap<RepositoryProviderSummary>((account) => {
		if (seen.has(account.providerId)) {
			return [];
		}

		seen.add(account.providerId);
		const enterpriseProvider = account.providerId.startsWith("enterprise-git:")
			? enterpriseProviders.get(account.providerId.replace("enterprise-git:", ""))
			: null;

		if (enterpriseProvider) {
			return [
				{
					providerId: account.providerId,
					label: enterpriseProvider.name,
					type: enterpriseProvider.type,
					baseUrl: enterpriseProvider.baseUrl,
					apiBaseUrl: enterpriseProvider.apiBaseUrl,
				},
			];
		}

		return [
			{
				providerId: account.providerId,
				label: getProviderName(account),
				type: getProviderType(account),
				baseUrl: null,
				apiBaseUrl: null,
			},
		];
	});
}

export async function addRepositoryForUser({
	userId,
	organizationId,
	providerId,
	repositoryPath,
}: {
	userId: string;
	organizationId: string;
	providerId: string;
	repositoryPath: string;
}) {
	const account = await getAccountForProvider({
		userId,
		providerId,
	});

	if (!account) {
		return null;
	}

	const enterpriseProviders = await getEnterpriseProviderMap();
	const provider = account.providerId.startsWith("enterprise-git:")
		? enterpriseProviders.get(account.providerId.replace("enterprise-git:", ""))
		: null;
	const adapter = await createAdapterForAccount(account, enterpriseProviders);

	if (!adapter) {
		return null;
	}

	const repository = await adapter.getRepository({
		repositoryPath: repositoryPath.trim(),
	});

	await upsertRepositoryForUser({
		userId,
		organizationId,
		account,
		repository,
		provider,
	});

	return {
		repository,
	};
}

export async function listRepositoriesForUser({
	userId,
	organizationId,
}: {
	userId: string;
	organizationId: string | null;
}) {
	if (!organizationId) {
		return [];
	}

	const rows = await db
		.select({
			access: dashboardSchema.repositoryAccess,
			repository: dashboardSchema.repository,
		})
		.from(dashboardSchema.repositoryAccess)
		.innerJoin(
			dashboardSchema.repository,
			eq(
				dashboardSchema.repositoryAccess.repositoryId,
				dashboardSchema.repository.id,
			),
		)
		.where(
			and(
				eq(dashboardSchema.repositoryAccess.userId, userId),
				eq(dashboardSchema.repository.organizationId, organizationId),
			),
		)
		.orderBy(desc(dashboardSchema.repositoryAccess.lastSeenAt));

	return rows.map(({ access, repository }) => mapRepositorySummary(access, repository));
}

export async function setRepositoryEnabledForUser({
	userId,
	organizationId,
	repositoryId,
	enabled,
}: {
	userId: string;
	organizationId: string;
	repositoryId: string;
	enabled: boolean;
}) {
	const [access] = await db
		.select({
			access: dashboardSchema.repositoryAccess,
		})
		.from(dashboardSchema.repositoryAccess)
		.innerJoin(
			dashboardSchema.repository,
			eq(
				dashboardSchema.repositoryAccess.repositoryId,
				dashboardSchema.repository.id,
			),
		)
		.where(
			and(
				eq(dashboardSchema.repositoryAccess.userId, userId),
				eq(dashboardSchema.repositoryAccess.repositoryId, repositoryId),
				eq(dashboardSchema.repository.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!access) {
		return null;
	}

	const [updated] = await db
		.update(dashboardSchema.repositoryAccess)
		.set({
			enabled,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(dashboardSchema.repositoryAccess.userId, userId),
				eq(dashboardSchema.repositoryAccess.repositoryId, repositoryId),
			),
		)
		.returning();

	return updated ?? access.access;
}

export async function getEnabledRepositoryIdsForUser({
	userId,
	organizationId,
}: {
	userId: string;
	organizationId: string | null;
}) {
	if (!organizationId) {
		return new Set<string>();
	}

	const rows = await db
		.select({
			repositoryId: dashboardSchema.repositoryAccess.repositoryId,
		})
		.from(dashboardSchema.repositoryAccess)
		.innerJoin(
			dashboardSchema.repository,
			eq(
				dashboardSchema.repositoryAccess.repositoryId,
				dashboardSchema.repository.id,
			),
		)
		.where(
			and(
				eq(dashboardSchema.repositoryAccess.userId, userId),
				eq(dashboardSchema.repositoryAccess.enabled, true),
				eq(dashboardSchema.repository.organizationId, organizationId),
			),
		);

	return new Set(rows.map((row) => row.repositoryId));
}

function mapRepositorySummary(
	access: RepositoryAccessRow,
	repository: RepositoryRow,
): RepositorySummary {
	return {
		id: repository.id,
		organizationId: repository.organizationId,
		providerId: repository.providerId,
		providerType: repository.providerType,
		providerName: repository.providerName,
		repositoryId: repository.repositoryId,
		repositoryPath: repository.repositoryPath,
		name: repository.name,
		fullName: repository.fullName,
		htmlUrl: repository.htmlUrl,
		defaultBranch: repository.defaultBranch,
		private: repository.private,
		description: repository.description,
		ownerLogin: repository.ownerLogin,
		ownerAvatarUrl: repository.ownerAvatarUrl,
		enabled: access.enabled,
		syncState: repository.syncState,
		lastSyncedAt: repository.lastSyncedAt?.toISOString() ?? null,
		lastSeenAt: access.lastSeenAt.toISOString(),
	};
}
