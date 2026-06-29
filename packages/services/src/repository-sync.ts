import { randomUUID } from "node:crypto";
import { env } from "@gitpal/env/server";
import type { GitRepository, GitWorkspaceRef } from "@gitpal/git";
import {
	enqueueRepositorySyncJob,
	type RepositorySyncJobData,
	repositorySyncJobSchema,
} from "@gitpal/jobs/inngest/functions/repo-sync";
import { createLogger } from "@gitpal/logger";
import {
	type Account,
	type Repository,
	type RepositoryAccess,
	repositories,
} from "@gitpal/repositories";
import { mapWithConcurrency } from "./bounded-concurrency";
import {
	createProviderAdapterForAccount,
	type EnterpriseProvider,
	getAccountForProvider,
	getEnterpriseProviderMap,
	listAppRepositoriesForAccount,
} from "./git-provider-access";
import { recordObservabilityEvent } from "./observability";
import { queueRepositoryWebhookSyncForUser } from "./repository-webhook-sync";
import { stableId } from "./stable-id";

type RepositoryAccessRow = RepositoryAccess;
type RepositoryRow = Repository;

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
	nextRetryAt: string | null;
	retryHint: string | null;
	webhookGapDetectedAt: string | null;
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
	return repositories.repositoryAccess.getLatestSyncAt(userId, providerId);
}

async function resolveTargetProviderIds({
	userId,
	organizationId,
	repositoryId,
	providerId,
}: {
	userId: string;
	organizationId?: string | null;
	repositoryId?: string | null;
	providerId?: string | null;
}) {
	if (providerId) {
		return [providerId];
	}

	if (repositoryId) {
		const repository = await repositories.repository.findById(repositoryId);
		return repository ? [repository.providerId] : [];
	}

	if (organizationId) {
		const organization =
			await repositories.organization.findById(organizationId);
		const workspace = organization
			? readWorkspaceMetadata(organization.metadata)
			: null;
		if (workspace?.providerId) {
			return [workspace.providerId];
		}

		return repositories.repositoryAccess.findDistinctProviderIds(
			userId,
			organizationId,
		);
	}

	return null;
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

	await repositories.organization.upsert({
		id: organizationId,
		name: metadata.ownerName,
		slug,
		logo: metadata.ownerAvatarUrl,
		metadata,
		createdAt: now,
	});

	await repositories.member.upsert({
		id: getWorkspaceMemberId(userId, organizationId),
		userId,
		organizationId,
		role: "owner",
		createdAt: now,
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

	await repositories.repository.upsertFromProvider({
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
	});

	await repositories.repositoryAccess.upsertAccessForUser({
		id: getRepositoryAccessId(userId, id),
		userId,
		repositoryId: id,
		role: "member",
		enabled: true,
		lastSeenAt: now,
		createdAt: now,
		updatedAt: now,
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

	await repositories.repositoryAccess.deleteStaleAccess(
		userId,
		providerId,
		seenRepositoryIds,
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
	const memberships =
		await repositories.member.findMembershipsForUserWithOrganization(userId);

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

	await repositories.member.deleteManyByIds(staleMemberIds);
}

async function refreshRepositoriesForAccount(
	userId: string,
	account: Account,
	enterpriseProviders: Map<string, EnterpriseProvider>,
) {
	// Cloud GitHub repository discovery remains App-installation-only. GitLab
	// and enterprise providers use their own OAuth-backed provider adapters so
	// they can sync the repositories the connected account can actually reach.
	if (account.providerId === "github") {
		try {
			// Cloud GitHub repositories have no enterprise provider record; provider
			// naming falls back to the GitHub defaults.
			const provider = null;

			const repositories = await listAppRepositoriesForAccount(account);
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

	const enterpriseProvider = account.providerId.startsWith("enterprise-git:")
		? enterpriseProviders.get(account.providerId.replace("enterprise-git:", ""))
		: null;

	const adapter = await createProviderAdapterForAccount({
		account,
		provider: enterpriseProvider,
	});

	if (!adapter) {
		log.info(
			"Repository discovery skipped (provider credentials are unavailable for this account).",
			{ providerId: account.providerId, userId },
		);
		return {
			syncedRepositories: 0,
			workspaceIds: [] as string[],
			error: null as string | null,
			skipped: true,
		};
	}

	try {
		const provider = enterpriseProvider;
		const repositories = await adapter.listRepositories();
		const seenRepositoryIds = new Set<string>();
		const seenWorkspaceIds = new Set<string>();

		const synced = await mapWithConcurrency(
			repositories,
			5,
			async (repository) => {
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
	organizationId = null,
	repositoryId = null,
	providerId = null,
	ttlMs = DEFAULT_REPOSITORY_SYNC_TTL_MS,
}: {
	userId: string;
	organizationId?: string | null;
	repositoryId?: string | null;
	providerId?: string | null;
	ttlMs?: number;
}): Promise<RepositorySyncResult> {
	const accounts = await repositories.account.listByUserId(userId);

	const enterpriseProviders = await getEnterpriseProviderMap();
	const targetProviderIds = await resolveTargetProviderIds({
		userId,
		organizationId,
		repositoryId,
		providerId,
	});
	const accountsToSync = targetProviderIds
		? accounts.filter((account) =>
				targetProviderIds.includes(account.providerId),
			)
		: accounts;

	const result: RepositorySyncResult = {
		syncedRepositories: 0,
		syncedProviders: 0,
		skippedProviders: 0,
		errors: [],
		workspaceIds: [],
	};

	for (const account of accountsToSync) {
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
			targetProviderIds,
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
		organizationId: data.organizationId ?? null,
		repositoryId: data.repositoryId ?? null,
		providerId: data.providerId ?? null,
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
		const accounts = (await repositories.account.listByUserId(data.userId)).map(
			(account) => ({ providerId: account.providerId }),
		);
		const targetProviderIds = await resolveTargetProviderIds({
			userId: data.userId,
			organizationId: data.organizationId ?? null,
			repositoryId: data.repositoryId ?? null,
			providerId: data.providerId ?? null,
		});
		const accountsToConsider = targetProviderIds
			? accounts.filter((account) =>
					targetProviderIds.includes(account.providerId),
				)
			: accounts;
		const latestSyncs = await Promise.all(
			accountsToConsider.map((account) =>
				getLatestSyncAt({
					userId: data.userId,
					providerId: account.providerId,
				}),
			),
		);
		if (
			accountsToConsider.length === 0 ||
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
	const accounts = await repositories.account.listByUserId(userId);

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
	const memberships = await repositories.member.findWorkspacesForUser(userId);

	const providerWorkspaceMemberships = memberships.filter(({ organization }) =>
		Boolean(readWorkspaceMetadata(organization.metadata)),
	);

	if (providerWorkspaceMemberships.length === 0) {
		return [];
	}

	const organizationIds = providerWorkspaceMemberships.map(
		({ organization }) => organization.id,
	);

	const repositoryCounts =
		await repositories.repository.countByOrganizationIds(organizationIds);

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

	const adapter = await createProviderAdapterForAccount({
		account,
		provider,
		repositoryPath,
	});

	if (!adapter) {
		log.info(
			"Repository could not be added (provider access is unavailable for this account).",
			{ providerId: account.providerId, userId, repositoryPath },
		);
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

	const rows = await repositories.repositoryAccess.findRepositoriesForUserInOrg(
		userId,
		organizationId,
	);

	const repositoryIds = rows.map(({ repository }) => repository.id);

	const webhooks =
		repositoryIds.length > 0
			? await repositories.repositoryWebhook.listWebhooksForRepositories(
					repositoryIds,
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
	const accessRow = await repositories.repositoryAccess.findAccessForUserInOrg(
		userId,
		repositoryId,
		organizationId,
	);

	if (!accessRow) {
		return null;
	}

	const updated = await repositories.repositoryAccess.updateById(
		accessRow.access.id,
		{
			enabled,
			updatedAt: new Date(),
		},
	);

	return updated ?? accessRow.access;
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

	const repositoryIds =
		await repositories.repositoryAccess.findEnabledRepositoryIdsForUser(
			userId,
			organizationId,
		);

	return new Set(repositoryIds);
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
		nextRetryAt: repository.nextRetryAt?.toISOString() ?? null,
		retryHint: repository.retryHint,
		webhookGapDetectedAt:
			repository.webhookGapDetectedAt?.toISOString() ?? null,
		lastSeenAt: access.lastSeenAt.toISOString(),
		webhookConnected: webhook?.connected ?? false,
		webhookLastDeliveredAt: webhook?.lastDeliveredAt?.toISOString() ?? null,
	};
}
