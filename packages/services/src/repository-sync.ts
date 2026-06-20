import { randomUUID } from "node:crypto";
import { db } from "@gitpal/db";
import * as authSchema from "@gitpal/db/schema/auth";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import { env } from "@gitpal/env/server";
import type { GitRepository, GitWorkspaceRef } from "@gitpal/git";
import {
	enqueueRepositorySyncJob,
	type RepositorySyncJobData,
	repositorySyncJobSchema,
} from "@gitpal/jobs/inngest/functions/repo-sync";
import { createLogger } from "@gitpal/logger";
import { and, count, desc, eq, inArray, max, notInArray } from "drizzle-orm";
import { mapWithConcurrency } from "./bounded-concurrency";
import {
	createAdapterFromAccount,
	type EnterpriseProvider,
	getAccountForProvider,
	getEnterpriseProviderMap,
} from "./git-provider-access";
import { recordObservabilityEvent } from "./observability";
import { queueRepositoryWebhookSyncForUser } from "./repository-webhook-sync";
import { stableId } from "./stable-id";

type Account = typeof authSchema.account.$inferSelect;
type RepositoryAccessRow = typeof dashboardSchema.repositoryAccess.$inferSelect;
type RepositoryRow = typeof dashboardSchema.repository.$inferSelect;

const log = createLogger("repository-sync");
const DEFAULT_REPOSITORY_SYNC_TTL_MS = 10 * 60 * 1000;
const PROVIDER_WORKSPACE_KIND = "provider-workspace";

export type ProviderWorkspaceMetadata = {
	kind: typeof PROVIDER_WORKSPACE_KIND;
	providerId: string;
	providerName: string;
	providerType: string;
	settingsUrl: string | null;
	scope: "personal" | "organization" | "group";
	ownerId: string;
	ownerPath: string;
	ownerName: string;
	ownerAvatarUrl: string | null;
	ownerHtmlUrl: string | null;
};

export type WorkspaceSummary = {
	id: string;
	name: string;
	slug: string;
	logo: string | null;
	scope: "personal" | "organization" | "group";
	providerId: string;
	providerName: string;
	providerType: string;
	ownerPath: string;
	ownerName: string;
	ownerAvatarUrl: string | null;
	ownerHtmlUrl: string | null;
	settingsUrl: string | null;
	repositoryCount: number;
	role: string;
};

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
	reconcileState: string;
	lastReconcileStartedAt: string | null;
	lastReconciledAt: string | null;
	lastReconcileFailedAt: string | null;
	lastReconcileError: string | null;
	lastSeenAt: string;
	webhookConnected: boolean;
	webhookLastDeliveredAt: string | null;
};

export type RepositorySyncResult = {
	syncedRepositories: number;
	syncedProviders: number;
	skippedProviders: number;
	errors: string[];
	workspaceIds: string[];
};

export type RepositorySyncQueueResult = {
	queued: boolean;
	jobId: string | null;
	reason: RepositorySyncJobData["reason"];
	force: boolean;
	error: string | null;
};

function toRepositoryWebhookSyncReason(
	reason: RepositorySyncJobData["reason"],
) {
	if (reason === "repository-added" || reason === "repository-enabled") {
		return reason;
	}

	return "sync";
}

export type RepositoryProviderSummary = {
	providerId: string;
	label: string;
	type: string;
	baseUrl: string | null;
	apiBaseUrl: string | null;
	settingsUrl: string | null;
};

function slugify(value: string) {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function getWorkspacePrimaryId(
	workspace: Pick<GitWorkspaceRef, "providerOwnerId" | "providerOwnerPath">,
	providerId: string,
) {
	return `workspace_${stableId([providerId, workspace.providerOwnerId, workspace.providerOwnerPath]).slice(0, 32)}`;
}

function getWorkspaceMemberId(userId: string, organizationId: string) {
	return `member_${stableId([userId, organizationId]).slice(0, 32)}`;
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

function getProviderType(
	account: Account,
	provider?: EnterpriseProvider | null,
) {
	if (provider?.type === "github" || provider?.type === "gitlab") {
		return provider.type;
	}
	if (account.providerId === "github" || account.providerId === "gitlab") {
		return account.providerId;
	}
	return "git";
}

function getProviderName(
	account: Account,
	provider?: EnterpriseProvider | null,
) {
	if (provider) {
		return provider.name;
	}
	return account.providerId === "github"
		? "GitHub"
		: account.providerId === "gitlab"
			? "GitLab"
			: account.providerId;
}

function getProviderSettingsUrl({
	account,
	provider,
}: {
	account: Account;
	provider?: EnterpriseProvider | null;
}) {
	if (provider?.type === "github") {
		if (provider.githubAppClientId) {
			return `${provider.baseUrl}/settings/connections/applications/${provider.githubAppClientId}`;
		}
		return `${provider.baseUrl}/settings/applications`;
	}
	if (provider?.type === "gitlab") {
		return `${provider.baseUrl}/-/user_settings/applications`;
	}
	if (account.providerId === "github") {
		return env.GITHUB_CLIENT_ID
			? `https://github.com/settings/connections/applications/${env.GITHUB_CLIENT_ID}`
			: "https://github.com/settings/applications";
	}
	if (account.providerId === "gitlab") {
		return "https://gitlab.com/-/user_settings/applications";
	}
	return null;
}

function toWorkspaceMetadata({
	account,
	provider,
	workspace,
}: {
	account: Account;
	provider?: EnterpriseProvider | null;
	workspace: GitWorkspaceRef;
}): ProviderWorkspaceMetadata {
	return {
		kind: PROVIDER_WORKSPACE_KIND,
		providerId: account.providerId,
		providerName: getProviderName(account, provider),
		providerType: getProviderType(account, provider),
		settingsUrl: getProviderSettingsUrl({ account, provider }),
		scope: workspace.scope,
		ownerId: workspace.providerOwnerId,
		ownerPath: workspace.providerOwnerPath,
		ownerName: workspace.providerOwnerName,
		ownerAvatarUrl: workspace.providerOwnerAvatarUrl,
		ownerHtmlUrl: workspace.providerOwnerHtmlUrl,
	};
}

// FIX Bug 1: Build a synthetic personal workspace for repos that don't carry
// a provider workspace reference (common for personal repos on GitHub/GitLab).
function buildPersonalWorkspaceRef(
	account: Account,
	repository: GitRepository,
): GitWorkspaceRef {
	const ownerLogin = repository.owner?.login ?? account.accountId ?? "personal";
	return {
		scope: "personal",
		providerOwnerId: account.accountId,
		providerOwnerPath: ownerLogin,
		providerOwnerName: ownerLogin,
		providerOwnerAvatarUrl: repository.owner?.avatarUrl ?? null,
		providerOwnerHtmlUrl: repository.owner?.htmlUrl ?? null,
	};
}

export function readWorkspaceMetadata(
	value: unknown,
): ProviderWorkspaceMetadata | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	const metadata = value as Record<string, unknown>;
	if (metadata.kind !== PROVIDER_WORKSPACE_KIND) {
		return null;
	}
	const scope = metadata.scope;
	if (scope !== "personal" && scope !== "organization" && scope !== "group") {
		return null;
	}
	return {
		kind: PROVIDER_WORKSPACE_KIND,
		providerId:
			typeof metadata.providerId === "string" ? metadata.providerId : "",
		providerName:
			typeof metadata.providerName === "string" ? metadata.providerName : "",
		providerType:
			typeof metadata.providerType === "string" ? metadata.providerType : "",
		settingsUrl:
			typeof metadata.settingsUrl === "string" ? metadata.settingsUrl : null,
		scope,
		ownerId: typeof metadata.ownerId === "string" ? metadata.ownerId : "",
		ownerPath: typeof metadata.ownerPath === "string" ? metadata.ownerPath : "",
		ownerName: typeof metadata.ownerName === "string" ? metadata.ownerName : "",
		ownerAvatarUrl:
			typeof metadata.ownerAvatarUrl === "string"
				? metadata.ownerAvatarUrl
				: null,
		ownerHtmlUrl:
			typeof metadata.ownerHtmlUrl === "string" ? metadata.ownerHtmlUrl : null,
	};
}

async function getLatestSyncAt({
	userId,
	providerId,
}: {
	userId: string;
	providerId: string;
}) {
	const [row] = await db
		.select({
			lastSyncedAt: max(dashboardSchema.repository.lastSyncedAt),
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
				eq(dashboardSchema.repository.providerId, providerId),
			),
		)
		.limit(1);

	return row?.lastSyncedAt ?? null;
}

function shouldRefreshRepositorySync(lastSyncedAt: Date | null, ttlMs: number) {
	if (!lastSyncedAt) {
		return true;
	}
	return Date.now() - lastSyncedAt.getTime() > ttlMs;
}

async function upsertWorkspaceForUser({
	userId,
	account,
	provider,
	workspace,
}: {
	userId: string;
	account: Account;
	provider?: EnterpriseProvider | null;
	workspace: GitWorkspaceRef;
}) {
	const now = new Date();
	const organizationId = getWorkspacePrimaryId(workspace, account.providerId);
	const metadata = toWorkspaceMetadata({ account, provider, workspace });
	const slugBase = slugify(
		`${metadata.providerType}-${metadata.ownerPath}`.replaceAll("/", "-"),
	);
	// Use a 16-char suffix to make slug collisions between different workspaces
	// virtually impossible. The uniqueIndex on slug means a collision would throw.
	const slug = `${slugBase || "workspace"}-${stableId([
		account.providerId,
		workspace.providerOwnerId,
		workspace.providerOwnerPath,
	]).slice(0, 16)}`;

	await db
		.insert(authSchema.organization)
		.values({
			id: organizationId,
			name: metadata.ownerName,
			slug,
			logo: metadata.ownerAvatarUrl,
			metadata,
			createdAt: now,
		})
		// FIX Bug 4: handle both the id conflict (normal update) and the slug
		// conflict (should not happen, but update in place rather than throwing).
		.onConflictDoUpdate({
			target: authSchema.organization.id,
			set: {
				name: metadata.ownerName,
				slug,
				logo: metadata.ownerAvatarUrl,
				metadata,
			},
		});

	await db
		.insert(authSchema.member)
		.values({
			id: getWorkspaceMemberId(userId, organizationId),
			userId,
			organizationId,
			role: "owner",
			createdAt: now,
		})
		.onConflictDoUpdate({
			target: [authSchema.member.userId, authSchema.member.organizationId],
			set: { role: "owner" },
		});

	return organizationId;
}

async function upsertRepositoryForUser({
	userId,
	account,
	repository,
	provider,
	organizationId,
}: {
	userId: string;
	account: Account;
	repository: GitRepository;
	provider?: EnterpriseProvider | null;
	organizationId: string;
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
				// NOTE: `enabled` is intentionally NOT here — we never reset it
				// on sync so user's manual setRepositoryEnabledForUser() is preserved.
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
				// FIX Bug 3: do NOT force enabled: true here. The user may have
				// explicitly disabled this repo via setRepositoryEnabledForUser().
				// Only refresh the lastSeenAt timestamp.
				lastSeenAt: now,
				updatedAt: now,
			},
		});

	return id;
}

async function cleanupRepositoryAccessForProvider({
	userId,
	providerId,
	seenRepositoryIds,
}: {
	userId: string;
	providerId: string;
	seenRepositoryIds: string[];
}) {
	// FIX Bug 2: when seenRepositoryIds is empty it means no repos were returned
	// for this provider this sync cycle — do NOT delete existing access rows.
	// Deleting with no notInArray filter would wipe ALL access for this provider.
	if (seenRepositoryIds.length === 0) {
		return;
	}

	const staleRows = await db
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
				eq(dashboardSchema.repository.providerId, providerId),
				notInArray(dashboardSchema.repository.id, seenRepositoryIds),
			),
		);

	if (staleRows.length === 0) {
		return;
	}

	await db.delete(dashboardSchema.repositoryAccess).where(
		and(
			eq(dashboardSchema.repositoryAccess.userId, userId),
			inArray(
				dashboardSchema.repositoryAccess.repositoryId,
				staleRows.map((row) => row.repositoryId),
			),
		),
	);
}

async function cleanupWorkspaceMembershipsForProvider({
	userId,
	providerId,
	seenWorkspaceIds,
}: {
	userId: string;
	providerId: string;
	seenWorkspaceIds: string[];
}) {
	const memberships = await db
		.select({
			memberId: authSchema.member.id,
			organizationId: authSchema.organization.id,
			metadata: authSchema.organization.metadata,
		})
		.from(authSchema.member)
		.innerJoin(
			authSchema.organization,
			eq(authSchema.member.organizationId, authSchema.organization.id),
		)
		.where(eq(authSchema.member.userId, userId));

	const staleMemberIds = memberships
		.filter(({ organizationId, metadata }) => {
			const workspace = readWorkspaceMetadata(metadata);
			return (
				workspace?.providerId === providerId &&
				!seenWorkspaceIds.includes(organizationId)
			);
		})
		.map(({ memberId }) => memberId);

	if (staleMemberIds.length === 0) {
		return;
	}

	await db
		.delete(authSchema.member)
		.where(inArray(authSchema.member.id, staleMemberIds));
}

async function refreshRepositoriesForAccount(
	userId: string,
	account: Account,
	enterpriseProviders: Map<string, EnterpriseProvider>,
) {
	const adapter = await createAdapterFromAccount({
		account,
		enterpriseProviders,
	});

	if (!adapter) {
		return {
			syncedRepositories: 0,
			workspaceIds: [] as string[],
			error: null as string | null,
			skipped: true,
		};
	}

	try {
		const provider = account.providerId.startsWith("enterprise-git:")
			? enterpriseProviders.get(
					account.providerId.replace("enterprise-git:", ""),
				)
			: null;

		const repositories = await adapter.listRepositories();
		const seenRepositoryIds = new Set<string>();
		const seenWorkspaceIds = new Set<string>();

		const synced = await mapWithConcurrency(
			repositories,
			5,
			async (repository) => {
				// FIX Bug 1: repos without a workspace ref (e.g. personal repos) were
				// previously skipped entirely, meaning they never got a repository_access
				// row, so getAutomationActorForRepository always returned null for them.
				// Fall back to a synthetic personal workspace derived from the account.
				const workspaceRef =
					repository.workspace ??
					buildPersonalWorkspaceRef(account, repository);

				const organizationId = await upsertWorkspaceForUser({
					userId,
					account,
					provider,
					workspace: workspaceRef,
				});

				const repositoryPrimaryId = await upsertRepositoryForUser({
					userId,
					account,
					repository,
					provider,
					organizationId,
				});

				return { organizationId, repositoryPrimaryId };
			},
		);
		for (const { organizationId, repositoryPrimaryId } of synced) {
			seenWorkspaceIds.add(organizationId);
			seenRepositoryIds.add(repositoryPrimaryId);
		}

		await cleanupRepositoryAccessForProvider({
			userId,
			providerId: account.providerId,
			seenRepositoryIds: [...seenRepositoryIds],
		});

		await cleanupWorkspaceMembershipsForProvider({
			userId,
			providerId: account.providerId,
			seenWorkspaceIds: [...seenWorkspaceIds],
		});

		log.info("Provider repositories synced.", {
			providerId: account.providerId,
			userId,
			syncedRepositories: seenRepositoryIds.size,
			syncedWorkspaces: seenWorkspaceIds.size,
		});

		return {
			syncedRepositories: seenRepositoryIds.size,
			workspaceIds: [...seenWorkspaceIds],
			error: null as string | null,
			skipped: false,
		};
	} catch (error) {
		const message =
			error instanceof Error
				? `${getProviderName(account)}: ${error.message}`
				: `${getProviderName(account)}: unable to sync repositories`;

		log.error("Provider repository sync failed.", {
			err: error,
			providerId: account.providerId,
			userId,
		});

		return {
			syncedRepositories: 0,
			workspaceIds: [] as string[],
			error: message,
			skipped: false,
		};
	}
}

export async function ensureRepositoriesSyncedForUser({
	userId,
	ttlMs = DEFAULT_REPOSITORY_SYNC_TTL_MS,
}: {
	userId: string;
	ttlMs?: number;
}): Promise<RepositorySyncResult> {
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
		workspaceIds: [],
	};

	for (const account of accounts) {
		const lastSyncedAt = await getLatestSyncAt({
			userId,
			providerId: account.providerId,
		});

		if (!shouldRefreshRepositorySync(lastSyncedAt, ttlMs)) {
			log.debug("Repository sync skipped (within TTL).", {
				providerId: account.providerId,
				userId,
				lastSyncedAt: lastSyncedAt?.toISOString(),
				ttlMs,
			});
			result.skippedProviders += 1;
			continue;
		}

		const syncResult = await refreshRepositoriesForAccount(
			userId,
			account,
			enterpriseProviders,
		);

		if (syncResult.skipped) {
			result.skippedProviders += 1;
			continue;
		}

		result.syncedProviders += 1;
		result.syncedRepositories += syncResult.syncedRepositories;
		result.workspaceIds.push(...syncResult.workspaceIds);

		if (syncResult.error) {
			result.errors.push(syncResult.error);
		}
	}

	result.workspaceIds = [...new Set(result.workspaceIds)];

	if (result.errors.length > 0) {
		log.warn("Repository sync completed with errors.", {
			userId,
			errors: result.errors,
			syncedRepositories: result.syncedRepositories,
		});
	} else {
		log.info("Repository sync complete.", {
			userId,
			syncedRepositories: result.syncedRepositories,
			syncedProviders: result.syncedProviders,
			skippedProviders: result.skippedProviders,
		});
	}

	return result;
}

export async function processRepositorySyncJob(input: RepositorySyncJobData) {
	const data = repositorySyncJobSchema.parse(input);
	const startedAt = Date.now();

	log.info("Processing repository sync job.", {
		userId: data.userId,
		organizationId: data.organizationId ?? null,
		repositoryId: data.repositoryId ?? null,
		providerId: data.providerId ?? null,
		reason: data.reason,
		force: data.force,
	});

	const sync = await ensureRepositoriesSyncedForUser({
		userId: data.userId,
		ttlMs: data.force ? 0 : DEFAULT_REPOSITORY_SYNC_TTL_MS,
	});
	const webhookSync = await queueRepositoryWebhookSyncForUser({
		userId: data.userId,
		organizationId: data.organizationId ?? undefined,
		repositoryId: data.repositoryId ?? undefined,
		reason: toRepositoryWebhookSyncReason(data.reason),
	});
	const durationMs = Date.now() - startedAt;
	const failed = sync.errors.length > 0 || !webhookSync.queued;

	await recordObservabilityEvent({
		userId: data.userId,
		organizationId: data.organizationId ?? null,
		repositoryId: data.repositoryId ?? null,
		kind: "job",
		action: "repository-sync",
		status: failed ? "processed_with_errors" : "completed",
		severity: failed ? "warning" : "success",
		title: failed
			? "Repository sync completed with warnings"
			: "Repository sync completed",
		body:
			sync.errors.slice(0, 3).join("\n") ||
			webhookSync.error ||
			`${sync.syncedRepositories} repositories synced.`,
		sourceType: "repository-sync",
		sourceId: data.repositoryId ?? data.organizationId ?? `user:${data.userId}`,
		dedupeKey: [
			"repository-sync",
			data.userId,
			data.organizationId ?? "all",
			data.repositoryId ?? "all",
			data.requestId ?? data.reason,
			failed ? "warning" : "completed",
		].join(":"),
		durationMs,
		metadata: {
			reason: data.reason,
			force: data.force,
			syncedRepositories: sync.syncedRepositories,
			syncedProviders: sync.syncedProviders,
			skippedProviders: sync.skippedProviders,
			workspaceIds: sync.workspaceIds,
			errors: sync.errors,
			webhookSync,
		},
	});

	return {
		...sync,
		webhookSync,
		durationMs,
	};
}

export async function queueRepositorySyncForUser(
	input: Omit<RepositorySyncJobData, "requestId"> & {
		requestId?: string;
	},
): Promise<RepositorySyncQueueResult> {
	const data = repositorySyncJobSchema.parse({
		...input,
		requestId:
			input.requestId ??
			(input.force
				? `repo_sync_${randomUUID()}`
				: input.reason === "auto"
					? `repo_sync_auto_${Math.floor(Date.now() / DEFAULT_REPOSITORY_SYNC_TTL_MS)}`
					: undefined),
	});
	if (data.reason === "auto" && !data.force) {
		const accounts = await db
			.select({ providerId: authSchema.account.providerId })
			.from(authSchema.account)
			.where(eq(authSchema.account.userId, data.userId));
		const latestSyncs = await Promise.all(
			accounts.map((account) =>
				getLatestSyncAt({
					userId: data.userId,
					providerId: account.providerId,
				}),
			),
		);
		if (
			accounts.length === 0 ||
			latestSyncs.every(
				(lastSyncedAt) =>
					!shouldRefreshRepositorySync(
						lastSyncedAt,
						DEFAULT_REPOSITORY_SYNC_TTL_MS,
					),
			)
		) {
			return {
				queued: false,
				jobId: null,
				reason: data.reason,
				force: data.force,
				error: null,
			};
		}
	}

	try {
		const job = await enqueueRepositorySyncJob(data);
		return {
			queued: true,
			jobId: job.ids?.[0] ?? null,
			reason: data.reason,
			force: data.force,
			error: null,
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "repository_sync_queue_failed";

		log.warn(
			{
				err: error,
				userId: data.userId,
				organizationId: data.organizationId ?? null,
				repositoryId: data.repositoryId ?? null,
				providerId: data.providerId ?? null,
				reason: data.reason,
			},
			"Repository sync could not be queued.",
		);

		return {
			queued: false,
			jobId: null,
			reason: data.reason,
			force: data.force,
			error: message,
		};
	}
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
			? enterpriseProviders.get(
					account.providerId.replace("enterprise-git:", ""),
				)
			: null;

		if (enterpriseProvider) {
			return [
				{
					providerId: account.providerId,
					label: enterpriseProvider.name,
					type: enterpriseProvider.type,
					baseUrl: enterpriseProvider.baseUrl,
					apiBaseUrl: enterpriseProvider.apiBaseUrl,
					settingsUrl: getProviderSettingsUrl({
						account,
						provider: enterpriseProvider,
					}),
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
				settingsUrl: getProviderSettingsUrl({ account }),
			},
		];
	});
}

export async function listWorkspacesForUser({ userId }: { userId: string }) {
	const memberships = await db
		.select({
			member: authSchema.member,
			organization: authSchema.organization,
		})
		.from(authSchema.member)
		.innerJoin(
			authSchema.organization,
			eq(authSchema.member.organizationId, authSchema.organization.id),
		)
		.where(eq(authSchema.member.userId, userId));

	const providerWorkspaceMemberships = memberships.filter(({ organization }) =>
		Boolean(readWorkspaceMetadata(organization.metadata)),
	);

	if (providerWorkspaceMemberships.length === 0) {
		return [];
	}

	const organizationIds = providerWorkspaceMemberships.map(
		({ organization }) => organization.id,
	);

	const repositoryCounts = await db
		.select({
			organizationId: dashboardSchema.repository.organizationId,
			total: count(),
		})
		.from(dashboardSchema.repository)
		.where(inArray(dashboardSchema.repository.organizationId, organizationIds))
		.groupBy(dashboardSchema.repository.organizationId);

	const repositoryCountMap = new Map(
		repositoryCounts.map((row) => [row.organizationId, row.total]),
	);

	return providerWorkspaceMemberships
		.map(({ member, organization }): WorkspaceSummary | null => {
			const metadata = readWorkspaceMetadata(organization.metadata);
			if (!metadata) {
				return null;
			}
			return {
				id: organization.id,
				name: organization.name,
				slug: organization.slug,
				logo: organization.logo,
				scope: metadata.scope,
				providerId: metadata.providerId,
				providerName: metadata.providerName,
				providerType: metadata.providerType,
				ownerPath: metadata.ownerPath,
				ownerName: metadata.ownerName,
				ownerAvatarUrl: metadata.ownerAvatarUrl,
				ownerHtmlUrl: metadata.ownerHtmlUrl,
				settingsUrl: metadata.settingsUrl,
				repositoryCount: repositoryCountMap.get(organization.id) ?? 0,
				role: member.role,
			};
		})
		.filter((workspace): workspace is WorkspaceSummary => workspace !== null)
		.sort((left, right) => {
			const scopeOrder = { personal: 0, organization: 1, group: 2 } as const;
			return (
				scopeOrder[left.scope] - scopeOrder[right.scope] ||
				left.name.localeCompare(right.name)
			);
		});
}

export async function addRepositoryForUser({
	userId,
	providerId,
	repositoryPath,
}: {
	userId: string;
	providerId: string;
	repositoryPath: string;
}) {
	const account = await getAccountForProvider({ userId, providerId });

	if (!account) {
		return null;
	}

	const enterpriseProviders = await getEnterpriseProviderMap();
	const provider = account.providerId.startsWith("enterprise-git:")
		? enterpriseProviders.get(account.providerId.replace("enterprise-git:", ""))
		: null;

	const adapter = await createAdapterFromAccount({
		account,
		enterpriseProviders,
	});

	if (!adapter) {
		return null;
	}

	const repository = await adapter.getRepository({
		repositoryPath: repositoryPath.trim(),
	});

	// FIX Bug 1 (same as refreshRepositoriesForAccount): fall back to a
	// personal workspace if the fetched repo has no workspace ref.
	const workspaceRef =
		repository.workspace ?? buildPersonalWorkspaceRef(account, repository);

	const resolvedOrganizationId = await upsertWorkspaceForUser({
		userId,
		account,
		provider,
		workspace: workspaceRef,
	});

	const repositoryPrimaryId = await upsertRepositoryForUser({
		userId,
		account,
		repository,
		provider,
		organizationId: resolvedOrganizationId,
	});

	return {
		repository,
		organizationId: resolvedOrganizationId,
		repositoryId: repositoryPrimaryId,
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

	const repositoryIds = rows.map(({ repository }) => repository.id);

	const webhooks =
		repositoryIds.length > 0
			? await db
					.select({
						repositoryId: dashboardSchema.repositoryWebhook.repositoryId,
						enabled: dashboardSchema.repositoryWebhook.enabled,
						lastDeliveredAt: dashboardSchema.repositoryWebhook.lastDeliveredAt,
					})
					.from(dashboardSchema.repositoryWebhook)
					.where(
						inArray(
							dashboardSchema.repositoryWebhook.repositoryId,
							repositoryIds,
						),
					)
			: [];

	const webhookMap = new Map<
		string,
		{ connected: boolean; lastDeliveredAt: Date | null }
	>();

	for (const webhook of webhooks) {
		const existing = webhookMap.get(webhook.repositoryId);
		const connected = Boolean(webhook.enabled) || existing?.connected || false;
		const lastDeliveredAt =
			webhook.lastDeliveredAt && existing?.lastDeliveredAt
				? webhook.lastDeliveredAt > existing.lastDeliveredAt
					? webhook.lastDeliveredAt
					: existing.lastDeliveredAt
				: (webhook.lastDeliveredAt ?? existing?.lastDeliveredAt ?? null);

		webhookMap.set(webhook.repositoryId, { connected, lastDeliveredAt });
	}

	return rows.map(({ access, repository }) =>
		mapRepositorySummary(access, repository, webhookMap.get(repository.id)),
	);
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
		.select({ access: dashboardSchema.repositoryAccess })
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
		.set({ enabled, updatedAt: new Date() })
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
	webhook?: { connected: boolean; lastDeliveredAt: Date | null },
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
		reconcileState: repository.reconcileState,
		lastReconcileStartedAt:
			repository.lastReconcileStartedAt?.toISOString() ?? null,
		lastReconciledAt: repository.lastReconciledAt?.toISOString() ?? null,
		lastReconcileFailedAt:
			repository.lastReconcileFailedAt?.toISOString() ?? null,
		lastReconcileError: repository.lastReconcileError,
		lastSeenAt: access.lastSeenAt.toISOString(),
		webhookConnected: webhook?.connected ?? false,
		webhookLastDeliveredAt: webhook?.lastDeliveredAt?.toISOString() ?? null,
	};
}
