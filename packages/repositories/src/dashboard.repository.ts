import {
	account,
	issue,
	knowledgeBaseLearning,
	member,
	organizationSettings,
	preMergeCheckRun,
	providerWorkspaceMember,
	pullRequest,
	reportDelivery,
	repository,
	repositoryAccess,
	repositorySettings,
	repositoryWebhook,
	reviewComment,
	reviewRun,
	reviewRunStep,
	toolFinding,
	user,
	webhookEventReceipt,
} from "@gitpal/db/schema";
import {
	and,
	asc,
	count,
	desc,
	eq,
	ilike,
	inArray,
	lt,
	lte,
	max,
	notInArray,
	or,
	sql,
} from "drizzle-orm";
import { BaseRepository, type PageRequest } from "./shared/base.repository";
import { conflictUpdateAllExcept } from "./shared/sql";
import type { Executor } from "./shared/types";

const ACTIVE_REVIEW_STATUSES = ["queued", "running"] as const;

type RepositoryInsert = typeof repository.$inferInsert;
export type ProviderWorkspaceMember =
	typeof providerWorkspaceMember.$inferSelect;
type ProviderWorkspaceMemberInsert =
	typeof providerWorkspaceMember.$inferInsert;
export type PullRequest = typeof pullRequest.$inferSelect;
export type PullRequestInsert = typeof pullRequest.$inferInsert;
export type Repository = typeof repository.$inferSelect;
export type RepositoryAccess = typeof repositoryAccess.$inferSelect;
export type RepositoryAccessInsert = typeof repositoryAccess.$inferInsert;
export type RepositorySettings = typeof repositorySettings.$inferSelect;
export type RepositorySettingsInsert = typeof repositorySettings.$inferInsert;
export type OrganizationSettings = typeof organizationSettings.$inferSelect;
export type OrganizationSettingsInsert =
	typeof organizationSettings.$inferInsert;
type IssueInsert = typeof issue.$inferInsert;
type RepositoryWebhookInsert = typeof repositoryWebhook.$inferInsert;
type WebhookEventReceiptInsert = typeof webhookEventReceipt.$inferInsert;

/** Connected source-control repositories. */
export class RepositoryRepository extends BaseRepository<typeof repository> {
	constructor(executor: Executor) {
		super(executor, repository);
	}

	findByIdAndOrg(id: string, organizationId: string) {
		return this.findOne(
			and(eq(repository.id, id), eq(repository.organizationId, organizationId)),
		);
	}

	async getOrganizationRepositoryCount(organizationId: string) {
		const [row] = await this.executor
			.select({ total: count() })
			.from(repository)
			.where(eq(repository.organizationId, organizationId))
			.limit(1);
		return Number(row?.total ?? 0);
	}

	async listOrganizationRepositoryIds(organizationId: string) {
		const rows = await this.executor
			.select({ id: repository.id })
			.from(repository)
			.where(eq(repository.organizationId, organizationId));
		return rows.map((row) => row.id);
	}

	listByProviderAndPath(providerId: string, repositoryPath: string) {
		return this.findMany({
			where: and(
				eq(repository.providerId, providerId),
				eq(repository.repositoryPath, repositoryPath),
			),
		});
	}

	async listWebhookSyncRepositories({
		userId,
		organizationId,
		repositoryId,
	}: {
		userId: string;
		organizationId?: string | null;
		repositoryId?: string;
	}) {
		const conditions = [
			eq(repositoryAccess.userId, userId),
			eq(repositoryAccess.enabled, true),
		];
		if (organizationId) {
			conditions.push(eq(repository.organizationId, organizationId));
		}
		if (repositoryId) {
			conditions.push(eq(repository.id, repositoryId));
		}
		const rows = await this.executor
			.select({ repository: repository })
			.from(repositoryAccess)
			.innerJoin(repository, eq(repositoryAccess.repositoryId, repository.id))
			.where(and(...conditions));
		return rows;
	}

	findByProviderRepository(
		organizationId: string,
		providerId: string,
		providerRepositoryId: string,
	) {
		return this.findOne(
			and(
				eq(repository.organizationId, organizationId),
				eq(repository.providerId, providerId),
				eq(repository.repositoryId, providerRepositoryId),
			),
		);
	}

	listByOrganization(
		organizationId: string,
		{ enabledOnly = false }: { enabledOnly?: boolean } = {},
	) {
		return this.findMany({
			where: enabledOnly
				? and(
						eq(repository.organizationId, organizationId),
						eq(repository.enabled, true),
					)
				: eq(repository.organizationId, organizationId),
			orderBy: repository.fullName,
		});
	}

	listByReconcileState(reconcileState: string) {
		return this.findMany({
			where: eq(repository.reconcileState, reconcileState),
			orderBy: repository.lastReconciledAt,
		});
	}

	/** Repositories whose scheduled retry time has elapsed. */
	listDueForRetry(now: Date = new Date()) {
		return this.findMany({
			where: lte(repository.nextRetryAt, now),
			orderBy: repository.nextRetryAt,
		});
	}

	async upsertFromProvider(values: RepositoryInsert) {
		const [row] = await this.executor
			.insert(repository)
			.values(values)
			.onConflictDoUpdate({
				target: [
					repository.organizationId,
					repository.providerId,
					repository.repositoryId,
				],
				set: conflictUpdateAllExcept(repository, [
					"id",
					"organizationId",
					"providerId",
					"repositoryId",
					"createdAt",
					"enabled",
				]),
			})
			.returning();
		return row;
	}

	async expireStaleReconciliations(now: Date, timeoutMs: number) {
		const threshold = new Date(now.getTime() - timeoutMs);
		return this.executor
			.update(repository)
			.set({
				reconcileState: "failed",
				lastReconcileFailedAt: now,
				lastReconcileError: "Repository reconciliation timed out.",
				updatedAt: now,
			})
			.where(
				and(
					eq(repository.reconcileState, "running"),
					lt(repository.lastReconcileStartedAt, threshold),
				),
			)
			.returning({ id: repository.id });
	}

	async countByOrganizationIds(organizationIds: string[]) {
		if (organizationIds.length === 0) return [];
		return this.executor
			.select({
				organizationId: repository.organizationId,
				total: count(),
			})
			.from(repository)
			.where(inArray(repository.organizationId, organizationIds))
			.groupBy(repository.organizationId);
	}
}

/** Per-user access grants to a repository. */
export class RepositoryAccessRepository extends BaseRepository<
	typeof repositoryAccess
> {
	constructor(executor: Executor) {
		super(executor, repositoryAccess);
	}

	findByUserAndRepository(userId: string, repositoryId: string) {
		return this.findOne(
			and(
				eq(repositoryAccess.userId, userId),
				eq(repositoryAccess.repositoryId, repositoryId),
			),
		);
	}

	listByUser(
		userId: string,
		{ enabledOnly = true }: { enabledOnly?: boolean } = {},
	) {
		return this.findMany({
			where: enabledOnly
				? and(
						eq(repositoryAccess.userId, userId),
						eq(repositoryAccess.enabled, true),
					)
				: eq(repositoryAccess.userId, userId),
			orderBy: desc(repositoryAccess.lastSeenAt),
		});
	}

	async getLatestSyncAt(
		userId: string,
		providerId: string,
	): Promise<Date | null> {
		const [row] = await this.executor
			.select({
				lastSyncedAt: sql<Date | null>`max(${repository.lastSyncedAt})`,
			})
			.from(repositoryAccess)
			.innerJoin(repository, eq(repositoryAccess.repositoryId, repository.id))
			.where(
				and(
					eq(repositoryAccess.userId, userId),
					eq(repository.providerId, providerId),
				),
			)
			.limit(1);
		return row?.lastSyncedAt ?? null;
	}

	listByRepository(repositoryId: string) {
		return this.findMany({
			where: eq(repositoryAccess.repositoryId, repositoryId),
		});
	}

	async getRepositoryAccessCounts({
		organizationId,
		userIds,
	}: {
		organizationId: string;
		userIds: string[];
	}) {
		if (userIds.length === 0) {
			return new Map<string, { enabled: number; total: number }>();
		}

		const rows = await this.executor
			.select({
				userId: repositoryAccess.userId,
				total: count(),
				enabled: sql<number>`count(*) filter (where ${repositoryAccess.enabled})`,
			})
			.from(repositoryAccess)
			.innerJoin(repository, eq(repository.id, repositoryAccess.repositoryId))
			.where(
				and(
					eq(repository.organizationId, organizationId),
					inArray(repositoryAccess.userId, userIds),
				),
			)
			.groupBy(repositoryAccess.userId);

		return new Map(
			rows.map((row) => [
				row.userId,
				{
					enabled: Number(row.enabled),
					total: Number(row.total),
				},
			]),
		);
	}

	async upsertAccessForUser(values: typeof repositoryAccess.$inferInsert) {
		const [row] = await this.executor
			.insert(repositoryAccess)
			.values(values)
			.onConflictDoUpdate({
				target: [repositoryAccess.userId, repositoryAccess.repositoryId],
				set: {
					lastSeenAt: values.lastSeenAt ?? new Date(),
					updatedAt: values.updatedAt ?? new Date(),
				},
			})
			.returning();
		return row;
	}

	async deleteByUserAndRepositories(userId: string, repositoryIds: string[]) {
		if (repositoryIds.length === 0) return 0;
		return this.deleteMany(
			and(
				eq(repositoryAccess.userId, userId),
				inArray(repositoryAccess.repositoryId, repositoryIds),
			)!,
		);
	}

	async bulkUpsertAccess(values: (typeof repositoryAccess.$inferInsert)[]) {
		if (values.length === 0) return;
		await this.executor
			.insert(repositoryAccess)
			.values(values)
			.onConflictDoUpdate({
				target: [repositoryAccess.userId, repositoryAccess.repositoryId],
				set: {
					enabled: true,
					lastSeenAt: new Date(),
					updatedAt: new Date(),
				},
			});
	}

	async disableAccessForUserAndRepositories(
		userId: string,
		repositoryIds: string[],
	) {
		if (repositoryIds.length === 0) return;
		await this.executor
			.update(repositoryAccess)
			.set({
				enabled: false,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(repositoryAccess.userId, userId),
					inArray(repositoryAccess.repositoryId, repositoryIds),
				),
			);
	}

	async listReviewerCandidates(repositoryId: string, limitNum = 10) {
		return this.executor
			.select({
				access: repositoryAccess,
				user: user,
				account: account,
			})
			.from(repositoryAccess)
			.innerJoin(repository, eq(repositoryAccess.repositoryId, repository.id))
			.innerJoin(user, eq(user.id, repositoryAccess.userId))
			.innerJoin(
				account,
				and(
					eq(account.userId, repositoryAccess.userId),
					eq(account.providerId, repository.providerId),
				),
			)
			.where(
				and(
					eq(repositoryAccess.repositoryId, repositoryId),
					eq(repositoryAccess.enabled, true),
				),
			)
			.orderBy(desc(repositoryAccess.lastSeenAt))
			.limit(limitNum);
	}

	findEnabledAccessWithOrganization(repositoryId: string) {
		return this.executor
			.select({
				userId: repositoryAccess.userId,
				organizationId: repository.organizationId,
			})
			.from(repositoryAccess)
			.innerJoin(repository, eq(repositoryAccess.repositoryId, repository.id))
			.where(
				and(
					eq(repositoryAccess.repositoryId, repositoryId),
					eq(repositoryAccess.enabled, true),
				),
			);
	}

	async listDistinctEnabledRepositoryIds() {
		const rows = await this.executor
			.selectDistinct({
				repositoryId: repositoryAccess.repositoryId,
			})
			.from(repositoryAccess)
			.where(eq(repositoryAccess.enabled, true));
		return rows;
	}

	async findDistinctProviderIds(
		userId: string,
		organizationId: string,
	): Promise<string[]> {
		const rows = await this.executor
			.selectDistinct({
				providerId: repository.providerId,
			})
			.from(repositoryAccess)
			.innerJoin(repository, eq(repositoryAccess.repositoryId, repository.id))
			.where(
				and(
					eq(repositoryAccess.userId, userId),
					eq(repositoryAccess.enabled, true),
					eq(repository.organizationId, organizationId),
				),
			);
		return rows.map((row) => row.providerId);
	}

	async deleteStaleAccess(
		userId: string,
		providerId: string,
		seenRepositoryIds: string[],
	) {
		const staleRows = await this.executor
			.select({
				repositoryId: repositoryAccess.repositoryId,
			})
			.from(repositoryAccess)
			.innerJoin(repository, eq(repositoryAccess.repositoryId, repository.id))
			.where(
				and(
					eq(repositoryAccess.userId, userId),
					eq(repository.providerId, providerId),
					seenRepositoryIds.length > 0
						? notInArray(repository.id, seenRepositoryIds)
						: undefined,
				),
			);
		if (staleRows.length === 0) return 0;
		const staleIds = staleRows.map((row) => row.repositoryId);
		return this.deleteMany(
			and(
				eq(repositoryAccess.userId, userId),
				inArray(repositoryAccess.repositoryId, staleIds),
			)!,
		);
	}

	async findEnabledRepositoryIdsForUser(
		userId: string,
		organizationId: string,
	): Promise<string[]> {
		const rows = await this.executor
			.select({
				repositoryId: repositoryAccess.repositoryId,
			})
			.from(repositoryAccess)
			.innerJoin(repository, eq(repositoryAccess.repositoryId, repository.id))
			.where(
				and(
					eq(repositoryAccess.userId, userId),
					eq(repositoryAccess.enabled, true),
					eq(repository.organizationId, organizationId),
				),
			);
		return rows.map((row) => row.repositoryId);
	}

	async findAccessForUserInOrg(
		userId: string,
		repositoryId: string,
		organizationId: string,
	) {
		const [row] = await this.executor
			.select({
				access: repositoryAccess,
			})
			.from(repositoryAccess)
			.innerJoin(repository, eq(repositoryAccess.repositoryId, repository.id))
			.where(
				and(
					eq(repositoryAccess.userId, userId),
					eq(repositoryAccess.repositoryId, repositoryId),
					eq(repository.organizationId, organizationId),
				),
			)
			.limit(1);
		return row ?? null;
	}

	async findRepositoriesForUserInOrg(userId: string, organizationId: string) {
		return this.executor
			.select({
				access: repositoryAccess,
				repository: repository,
			})
			.from(repositoryAccess)
			.innerJoin(repository, eq(repositoryAccess.repositoryId, repository.id))
			.where(
				and(
					eq(repositoryAccess.userId, userId),
					eq(repository.organizationId, organizationId),
				),
			)
			.orderBy(desc(repositoryAccess.lastSeenAt));
	}

	async findStaleAccessForUser(
		userId: string,
		providerId: string,
		seenRepositoryIds: string[],
	) {
		return this.executor
			.select({
				repositoryId: repositoryAccess.repositoryId,
			})
			.from(repositoryAccess)
			.innerJoin(repository, eq(repositoryAccess.repositoryId, repository.id))
			.where(
				and(
					eq(repositoryAccess.userId, userId),
					eq(repository.providerId, providerId),
					notInArray(repository.id, seenRepositoryIds),
				),
			);
	}

	async deleteAccessForUserForRepositories(
		userId: string,
		repositoryIds: string[],
	) {
		if (repositoryIds.length === 0) return 0;
		const deleted = await this.executor
			.delete(repositoryAccess)
			.where(
				and(
					eq(repositoryAccess.userId, userId),
					inArray(repositoryAccess.repositoryId, repositoryIds),
				),
			)
			.returning({ id: repositoryAccess.id });
		return deleted.length;
	}

	async findAutomationActorCandidates(
		repositoryId: string,
		providerId: string,
	) {
		return this.executor
			.select({
				userId: repositoryAccess.userId,
				account: account,
				repository: repository,
				organizationRole: member.role,
				lastSeenAt: repositoryAccess.lastSeenAt,
			})
			.from(repositoryAccess)
			.innerJoin(repository, eq(repositoryAccess.repositoryId, repository.id))
			.innerJoin(
				account,
				and(
					eq(account.userId, repositoryAccess.userId),
					eq(account.providerId, providerId),
				),
			)
			.innerJoin(
				member,
				and(
					eq(member.userId, repositoryAccess.userId),
					eq(member.organizationId, repository.organizationId),
				),
			)
			.where(
				and(
					eq(repositoryAccess.repositoryId, repositoryId),
					eq(repository.providerId, providerId),
					eq(repositoryAccess.enabled, true),
				),
			)
			.orderBy(
				sql`case
					when ${member.role} = 'owner' then 0
					when ${member.role} = 'admin' then 1
					else 2
				end`,
				desc(repositoryAccess.lastSeenAt),
			)
			.limit(10);
	}

	async findAccessWithRepository(
		userId: string,
		repositoryId: string,
		organizationId: string,
	) {
		const [row] = await this.executor
			.select({
				access: repositoryAccess,
				repository: repository,
			})
			.from(repositoryAccess)
			.innerJoin(repository, eq(repositoryAccess.repositoryId, repository.id))
			.where(
				and(
					eq(repositoryAccess.userId, userId),
					eq(repositoryAccess.repositoryId, repositoryId),
					eq(repository.organizationId, organizationId),
				),
			)
			.limit(1);
		return row ?? null;
	}

	async upsert(values: RepositoryAccessInsert) {
		const [row] = await this.executor
			.insert(repositoryAccess)
			.values(values)
			.onConflictDoUpdate({
				target: [repositoryAccess.userId, repositoryAccess.repositoryId],
				set: conflictUpdateAllExcept(repositoryAccess, [
					"id",
					"userId",
					"repositoryId",
					"createdAt",
				]),
			})
			.returning();
		return row;
	}
}

/** Cached members of a provider workspace/org. */
export class ProviderWorkspaceMemberRepository extends BaseRepository<
	typeof providerWorkspaceMember
> {
	constructor(executor: Executor) {
		super(executor, providerWorkspaceMember);
	}

	findByProviderMember(
		organizationId: string,
		providerId: string,
		providerMemberId: string,
	) {
		return this.findOne(
			and(
				eq(providerWorkspaceMember.organizationId, organizationId),
				eq(providerWorkspaceMember.providerId, providerId),
				eq(providerWorkspaceMember.providerMemberId, providerMemberId),
			),
		);
	}

	listByOrganization(organizationId: string) {
		return this.findMany({
			where: eq(providerWorkspaceMember.organizationId, organizationId),
			orderBy: providerWorkspaceMember.login,
		});
	}

	async listProviderMembersForOrgAndProvider(
		organizationId: string,
		providerId: string,
	) {
		return this.executor
			.select({
				providerMemberId: providerWorkspaceMember.providerMemberId,
				login: providerWorkspaceMember.login,
			})
			.from(providerWorkspaceMember)
			.where(
				and(
					eq(providerWorkspaceMember.organizationId, organizationId),
					eq(providerWorkspaceMember.providerId, providerId),
				),
			);
	}

	async getLatestSyncAt(organizationId: string): Promise<Date | null> {
		const [row] = await this.executor
			.select({
				lastSyncedAt: max(providerWorkspaceMember.lastSyncedAt),
			})
			.from(providerWorkspaceMember)
			.where(eq(providerWorkspaceMember.organizationId, organizationId))
			.limit(1);
		return row?.lastSyncedAt ?? null;
	}

	async listWorkspaceMembersWithUserInfo(organizationId: string) {
		return this.executor
			.select({
				providerMember: providerWorkspaceMember,
				accountUserId: account.userId,
				userId: user.id,
				userName: user.name,
				userEmail: user.email,
				userImage: user.image,
				appMemberId: member.id,
				appRole: member.role,
			})
			.from(providerWorkspaceMember)
			.leftJoin(
				account,
				and(
					eq(account.providerId, providerWorkspaceMember.providerId),
					eq(account.accountId, providerWorkspaceMember.providerMemberId),
				),
			)
			.leftJoin(user, eq(user.id, account.userId))
			.leftJoin(
				member,
				and(
					eq(member.userId, user.id),
					eq(member.organizationId, organizationId),
				),
			)
			.where(eq(providerWorkspaceMember.organizationId, organizationId))
			.orderBy(
				asc(providerWorkspaceMember.login),
				asc(providerWorkspaceMember.name),
			);
	}

	async getTargetProviderMember(organizationId: string, targetUserId: string) {
		const [row] = await this.executor
			.select({
				providerMember: providerWorkspaceMember,
				account: account,
				member: member,
			})
			.from(providerWorkspaceMember)
			.innerJoin(
				account,
				and(
					eq(account.providerId, providerWorkspaceMember.providerId),
					eq(account.accountId, providerWorkspaceMember.providerMemberId),
					eq(account.userId, targetUserId),
				),
			)
			.leftJoin(
				member,
				and(
					eq(member.userId, targetUserId),
					eq(member.organizationId, organizationId),
				),
			)
			.where(eq(providerWorkspaceMember.organizationId, organizationId))
			.limit(1);
		return row ?? null;
	}

	async acquireAdvisoryLock(organizationId: string) {
		await this.executor.execute(
			sql`select pg_advisory_xact_lock(hashtext(${`provider-members:${organizationId}`}))`,
		);
	}

	async deleteStale(
		organizationId: string,
		providerId: string,
		seenProviderMemberIds: string[],
	) {
		if (seenProviderMemberIds.length === 0) {
			return this.deleteMany(
				and(
					eq(providerWorkspaceMember.organizationId, organizationId),
					eq(providerWorkspaceMember.providerId, providerId),
				)!,
			);
		}
		return this.deleteMany(
			and(
				eq(providerWorkspaceMember.organizationId, organizationId),
				eq(providerWorkspaceMember.providerId, providerId),
				notInArray(
					providerWorkspaceMember.providerMemberId,
					seenProviderMemberIds,
				),
			)!,
		);
	}

	async upsert(values: ProviderWorkspaceMemberInsert) {
		const [row] = await this.executor
			.insert(providerWorkspaceMember)
			.values(values)
			.onConflictDoUpdate({
				target: [
					providerWorkspaceMember.organizationId,
					providerWorkspaceMember.providerId,
					providerWorkspaceMember.providerMemberId,
				],
				set: conflictUpdateAllExcept(providerWorkspaceMember, [
					"id",
					"organizationId",
					"providerId",
					"providerMemberId",
					"createdAt",
				]),
			})
			.returning();
		return row;
	}
}

/** Pull/merge requests, unique per (repository, number). */
export class PullRequestRepository extends BaseRepository<typeof pullRequest> {
	constructor(executor: Executor) {
		super(executor, pullRequest);
	}

	findByNumber(repositoryId: string, number: number) {
		return this.findOne(
			and(
				eq(pullRequest.repositoryId, repositoryId),
				eq(pullRequest.number, number),
			),
		);
	}

	async findByNumberForUpdate(repositoryId: string, number: number) {
		const [row] = await this.executor
			.select()
			.from(pullRequest)
			.where(
				and(
					eq(pullRequest.repositoryId, repositoryId),
					eq(pullRequest.number, number),
				),
			)
			.limit(1)
			.for("update");
		return row ?? null;
	}

	listByRepository(repositoryId: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(pullRequest.repositoryId, repositoryId),
			orderBy: desc(pullRequest.updatedAt),
			...page,
		});
	}

	listByRepositoryAndState(
		repositoryId: string,
		state: string,
		page: PageRequest = {},
	) {
		return this.findPage({
			where: and(
				eq(pullRequest.repositoryId, repositoryId),
				eq(pullRequest.state, state),
			),
			orderBy: desc(pullRequest.updatedAt),
			...page,
		});
	}

	async upsertFromProvider(values: PullRequestInsert) {
		const [row] = await this.executor
			.insert(pullRequest)
			.values(values)
			.onConflictDoUpdate({
				target: [pullRequest.repositoryId, pullRequest.number],
				set: conflictUpdateAllExcept(pullRequest, [
					"id",
					"repositoryId",
					"number",
					"createdAt",
				]),
			})
			.returning();
		return row;
	}

	async searchPullRequests({
		repositoryIds,
		state,
		query,
		limit,
		offset,
	}: {
		repositoryIds: string[];
		state?: string;
		query?: string;
		limit: number;
		offset: number;
	}) {
		const condition = and(
			inArray(pullRequest.repositoryId, repositoryIds),
			state ? eq(pullRequest.state, state) : undefined,
			query
				? or(
						ilike(pullRequest.title, `%${query}%`),
						ilike(pullRequest.authorLogin, `%${query}%`),
					)
				: undefined,
		);
		const [items, total] = await Promise.all([
			this.findMany({
				where: condition,
				orderBy: desc(pullRequest.updatedAt),
				limit,
				offset,
			}),
			this.count(condition),
		]);
		return { items, total };
	}
}

/** Issues, unique per (repository, number). */
export class IssueRepository extends BaseRepository<typeof issue> {
	constructor(executor: Executor) {
		super(executor, issue);
	}

	findByNumber(repositoryId: string, number: number) {
		return this.findOne(
			and(eq(issue.repositoryId, repositoryId), eq(issue.number, number)),
		);
	}

	listByRepositoryAndState(
		repositoryId: string,
		state: string,
		page: PageRequest = {},
	) {
		return this.findPage({
			where: and(eq(issue.repositoryId, repositoryId), eq(issue.state, state)),
			orderBy: desc(issue.updatedAt),
			...page,
		});
	}

	async upsertFromProvider(values: IssueInsert) {
		const [row] = await this.executor
			.insert(issue)
			.values(values)
			.onConflictDoUpdate({
				target: [issue.repositoryId, issue.number],
				set: conflictUpdateAllExcept(issue, [
					"id",
					"repositoryId",
					"number",
					"createdAt",
				]),
			})
			.returning();
		return row;
	}

	async searchIssues({
		repositoryIds,
		state,
		query,
		limit,
		offset,
	}: {
		repositoryIds: string[];
		state?: string;
		query?: string;
		limit: number;
		offset: number;
	}) {
		const condition = and(
			inArray(issue.repositoryId, repositoryIds),
			state ? eq(issue.state, state) : undefined,
			query
				? or(
						ilike(issue.title, `%${query}%`),
						ilike(issue.authorLogin, `%${query}%`),
					)
				: undefined,
		);
		const [items, total] = await Promise.all([
			this.findMany({
				where: condition,
				orderBy: desc(issue.updatedAt),
				limit,
				offset,
			}),
			this.count(condition),
		]);
		return { items, total };
	}
}

/** AI review runs against a pull request or issue. */
export class ReviewRunRepository extends BaseRepository<typeof reviewRun> {
	constructor(executor: Executor) {
		super(executor, reviewRun);
	}

	findByProviderDelivery(
		providerId: string,
		providerDeliveryId: string,
		reviewKind: string,
	) {
		return this.findOne(
			and(
				eq(reviewRun.providerId, providerId),
				eq(reviewRun.providerDeliveryId, providerDeliveryId),
				eq(reviewRun.reviewKind, reviewKind),
			),
		);
	}

	listByPullRequest(pullRequestId: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(reviewRun.pullRequestId, pullRequestId),
			orderBy: desc(reviewRun.createdAt),
			...page,
		});
	}

	listAllByPullRequest(pullRequestId: string) {
		return this.findMany({
			where: eq(reviewRun.pullRequestId, pullRequestId),
			orderBy: desc(reviewRun.createdAt),
		});
	}

	listAllByIssue(issueId: string) {
		return this.findMany({
			where: eq(reviewRun.issueId, issueId),
			orderBy: desc(reviewRun.createdAt),
		});
	}

	listByIssue(issueId: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(reviewRun.issueId, issueId),
			orderBy: desc(reviewRun.createdAt),
			...page,
		});
	}

	listByRepository(repositoryId: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(reviewRun.repositoryId, repositoryId),
			orderBy: desc(reviewRun.createdAt),
			...page,
		});
	}

	listByStatus(status: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(reviewRun.status, status),
			orderBy: desc(reviewRun.createdAt),
			...page,
		});
	}

	/** The in-flight (queued/running) run for a PR + kind, if any. */
	findActiveForPullRequest(pullRequestId: string, reviewKind: string) {
		return this.findOne(
			and(
				eq(reviewRun.pullRequestId, pullRequestId),
				eq(reviewRun.reviewKind, reviewKind),
				inArray(reviewRun.status, [...ACTIVE_REVIEW_STATUSES]),
			),
		);
	}

	findActiveForIssue(issueId: string, reviewKind: string) {
		return this.findOne(
			and(
				eq(reviewRun.issueId, issueId),
				eq(reviewRun.reviewKind, reviewKind),
				inArray(reviewRun.status, [...ACTIVE_REVIEW_STATUSES]),
			),
		);
	}

	async createQueuedRun(values: typeof reviewRun.$inferInsert) {
		const [row] = await this.executor
			.insert(reviewRun)
			.values(values)
			.onConflictDoNothing()
			.returning();
		return row ?? null;
	}

	async startQueuedRun(
		id: string,
		patch: { trigger: string; modelId: string; thinkingEnabled: boolean },
	) {
		const now = new Date();
		const [row] = await this.executor
			.update(reviewRun)
			.set({
				status: "running",
				trigger: patch.trigger,
				modelId: patch.modelId,
				thinkingEnabled: patch.thinkingEnabled,
				startedAt: now,
				updatedAt: now,
			})
			.where(and(eq(reviewRun.id, id), eq(reviewRun.status, "queued")))
			.returning();
		return row ?? null;
	}

	async finalizeUnstartedManualRun(
		id: string,
		status: "failed" | "ignored",
		reason: string,
	) {
		const now = new Date();
		await this.executor
			.update(reviewRun)
			.set({
				status,
				result: { reason },
				completedAt: now,
				updatedAt: now,
			})
			.where(and(eq(reviewRun.id, id), eq(reviewRun.status, "queued")));
	}

	async finalizeReviewRun(
		id: string,
		patch: Partial<typeof reviewRun.$inferInsert>,
	) {
		await this.executor
			.update(reviewRun)
			.set({
				...patch,
				completedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(reviewRun.id, id));
	}

	async failActiveRun(
		runId: string,
		now: Date,
		reason: string,
		safeError: string | null,
	) {
		const [row] = await this.executor
			.update(reviewRun)
			.set({
				status: "failed",
				result: { reason, ...(safeError ? { error: safeError } : {}) },
				completedAt: now,
				updatedAt: now,
			})
			.where(
				and(
					eq(reviewRun.id, runId),
					inArray(reviewRun.status, ["queued", "running"]),
				),
			)
			.returning({ id: reviewRun.id });
		return row ?? null;
	}

	async expireQueuedRuns(now: Date, threshold: Date) {
		return this.executor
			.update(reviewRun)
			.set({
				status: "failed",
				result: { reason: "worker_start_timeout" },
				completedAt: now,
				updatedAt: now,
			})
			.where(
				and(eq(reviewRun.status, "queued"), lt(reviewRun.createdAt, threshold)),
			)
			.returning({ id: reviewRun.id });
	}

	async expireRunningRuns(now: Date, threshold: Date) {
		return this.executor
			.update(reviewRun)
			.set({
				status: "failed",
				result: { reason: "worker_finish_timeout" },
				completedAt: now,
				updatedAt: now,
			})
			.where(
				and(
					eq(reviewRun.status, "running"),
					lt(reviewRun.startedAt, threshold),
				),
			)
			.returning({ id: reviewRun.id });
	}
}

/** Ordered steps within a review run. */
export class ReviewRunStepRepository extends BaseRepository<
	typeof reviewRunStep
> {
	constructor(executor: Executor) {
		super(executor, reviewRunStep);
	}

	listByReviewRun(reviewRunId: string) {
		return this.findMany({
			where: eq(reviewRunStep.reviewRunId, reviewRunId),
			orderBy: reviewRunStep.position,
		});
	}

	listByReviewRunIds(reviewRunIds: string[]) {
		if (reviewRunIds.length === 0) return Promise.resolve([]);
		return this.findMany({
			where: inArray(reviewRunStep.reviewRunId, reviewRunIds),
			orderBy: reviewRunStep.position,
		});
	}

	findByStepKey(reviewRunId: string, stepKey: string, attempt: number) {
		return this.findOne(
			and(
				eq(reviewRunStep.reviewRunId, reviewRunId),
				eq(reviewRunStep.stepKey, stepKey),
				eq(reviewRunStep.attempt, attempt),
			),
		);
	}

	async failRunningSteps(runIds: string[], now: Date, errorCode: string) {
		if (runIds.length === 0) return;
		await this.executor
			.update(reviewRunStep)
			.set({
				status: "failed",
				errorCode,
				completedAt: now,
				updatedAt: now,
			})
			.where(
				and(
					inArray(reviewRunStep.reviewRunId, runIds),
					eq(reviewRunStep.status, "running"),
				),
			);
	}
}

/** Individual AI/human review comments. */
export class ReviewCommentRepository extends BaseRepository<
	typeof reviewComment
> {
	constructor(executor: Executor) {
		super(executor, reviewComment);
	}

	listByReviewRun(reviewRunId: string) {
		return this.findMany({
			where: eq(reviewComment.reviewRunId, reviewRunId),
			orderBy: desc(reviewComment.createdAt),
		});
	}

	listByPullRequest(pullRequestId: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(reviewComment.pullRequestId, pullRequestId),
			orderBy: desc(reviewComment.createdAt),
			...page,
		});
	}

	listAllByPullRequest(pullRequestId: string) {
		return this.findMany({
			where: eq(reviewComment.pullRequestId, pullRequestId),
			orderBy: desc(reviewComment.createdAt),
		});
	}
}

/** Third-party tool findings (linters, scanners, ...). */
export class ToolFindingRepository extends BaseRepository<typeof toolFinding> {
	constructor(executor: Executor) {
		super(executor, toolFinding);
	}

	listByRepository(repositoryId: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(toolFinding.repositoryId, repositoryId),
			orderBy: desc(toolFinding.createdAt),
			...page,
		});
	}

	listByPullRequest(pullRequestId: string) {
		return this.findMany({
			where: eq(toolFinding.pullRequestId, pullRequestId),
			orderBy: desc(toolFinding.createdAt),
		});
	}

	listOpenByRepository(repositoryId: string) {
		return this.findMany({
			where: and(
				eq(toolFinding.repositoryId, repositoryId),
				eq(toolFinding.status, "open"),
			),
			orderBy: desc(toolFinding.createdAt),
		});
	}
}

/** Pre-merge gate check executions. */
export class PreMergeCheckRunRepository extends BaseRepository<
	typeof preMergeCheckRun
> {
	constructor(executor: Executor) {
		super(executor, preMergeCheckRun);
	}

	listByReviewRun(reviewRunId: string) {
		return this.findMany({
			where: eq(preMergeCheckRun.reviewRunId, reviewRunId),
			orderBy: preMergeCheckRun.startedAt,
		});
	}

	listByPullRequest(pullRequestId: string) {
		return this.findMany({
			where: eq(preMergeCheckRun.pullRequestId, pullRequestId),
			orderBy: desc(preMergeCheckRun.startedAt),
		});
	}
}

/** Knowledge-base learnings derived from reviews. */
export class KnowledgeBaseLearningRepository extends BaseRepository<
	typeof knowledgeBaseLearning
> {
	constructor(executor: Executor) {
		super(executor, knowledgeBaseLearning);
	}

	listByRepository(repositoryId: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(knowledgeBaseLearning.repositoryId, repositoryId),
			orderBy: desc(knowledgeBaseLearning.createdAt),
			...page,
		});
	}
}

/** Audit log of report deliveries. */
export class ReportDeliveryRepository extends BaseRepository<
	typeof reportDelivery
> {
	constructor(executor: Executor) {
		super(executor, reportDelivery);
	}

	listByUser(userId: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(reportDelivery.userId, userId),
			orderBy: desc(reportDelivery.deliveredAt),
			...page,
		});
	}

	listByRepository(repositoryId: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(reportDelivery.repositoryId, repositoryId),
			orderBy: desc(reportDelivery.deliveredAt),
			...page,
		});
	}
}

/** Organization-wide settings (one row per organization). */
export class OrganizationSettingsRepository extends BaseRepository<
	typeof organizationSettings
> {
	constructor(executor: Executor) {
		super(executor, organizationSettings);
	}

	findByOrganizationId(organizationId: string) {
		return this.findOne(
			eq(organizationSettings.organizationId, organizationId),
		);
	}

	async upsertForOrganization(values: OrganizationSettingsInsert) {
		const [row] = await this.executor
			.insert(organizationSettings)
			.values(values)
			.onConflictDoUpdate({
				target: organizationSettings.organizationId,
				set: conflictUpdateAllExcept(organizationSettings, [
					"id",
					"organizationId",
					"createdAt",
				]),
			})
			.returning();
		return row;
	}
}

/** Repository-level settings overrides, unique per (org, repository). */
export class RepositorySettingsRepository extends BaseRepository<
	typeof repositorySettings
> {
	constructor(executor: Executor) {
		super(executor, repositorySettings);
	}

	findByOrgAndRepository(organizationId: string, repositoryId: string) {
		return this.findOne(
			and(
				eq(repositorySettings.organizationId, organizationId),
				eq(repositorySettings.repositoryId, repositoryId),
			),
		);
	}

	findByRepository(repositoryId: string) {
		return this.findOne(eq(repositorySettings.repositoryId, repositoryId));
	}

	async upsert(values: RepositorySettingsInsert) {
		const [row] = await this.executor
			.insert(repositorySettings)
			.values(values)
			.onConflictDoUpdate({
				target: [
					repositorySettings.organizationId,
					repositorySettings.repositoryId,
				],
				set: conflictUpdateAllExcept(repositorySettings, [
					"id",
					"organizationId",
					"repositoryId",
					"createdAt",
				]),
			})
			.returning();
		return row;
	}
}

/** Provider webhooks registered for a repository. */
export class RepositoryWebhookRepository extends BaseRepository<
	typeof repositoryWebhook
> {
	constructor(executor: Executor) {
		super(executor, repositoryWebhook);
	}

	findByProviderWebhook(
		repositoryId: string,
		providerId: string,
		providerWebhookId: string,
	) {
		return this.findOne(
			and(
				eq(repositoryWebhook.repositoryId, repositoryId),
				eq(repositoryWebhook.providerId, providerId),
				eq(repositoryWebhook.providerWebhookId, providerWebhookId),
			),
		);
	}

	listByRepository(repositoryId: string) {
		return this.findMany({
			where: eq(repositoryWebhook.repositoryId, repositoryId),
		});
	}

	async listWebhooksForRepositories(repositoryIds: string[]) {
		if (repositoryIds.length === 0) return [];
		return this.executor
			.select({
				repositoryId: repositoryWebhook.repositoryId,
				enabled: repositoryWebhook.enabled,
				lastDeliveredAt: repositoryWebhook.lastDeliveredAt,
			})
			.from(repositoryWebhook)
			.where(inArray(repositoryWebhook.repositoryId, repositoryIds));
	}

	async upsert(values: RepositoryWebhookInsert) {
		const [row] = await this.executor
			.insert(repositoryWebhook)
			.values(values)
			.onConflictDoUpdate({
				target: [
					repositoryWebhook.repositoryId,
					repositoryWebhook.providerId,
					repositoryWebhook.providerWebhookId,
				],
				set: conflictUpdateAllExcept(repositoryWebhook, [
					"id",
					"repositoryId",
					"providerId",
					"providerWebhookId",
					"createdAt",
				]),
			})
			.returning();
		return row;
	}

	async listWebhookGapCandidates() {
		const lastProviderActivityAt = sql<Date | null>`greatest(
			(select max(${pullRequest.updatedAt}) from ${pullRequest} where ${pullRequest.repositoryId} = ${repository.id}),
			(select max(${issue.updatedAt}) from ${issue} where ${issue.repositoryId} = ${repository.id})
		)`;
		return this.executor
			.select({
				repositoryId: repository.id,
				webhookCreatedAt: repositoryWebhook.createdAt,
				lastDeliveredAt: repositoryWebhook.lastDeliveredAt,
				lastProviderActivityAt,
				lastReconciledAt: repository.lastReconciledAt,
				lastGapDetectedAt: repository.webhookGapDetectedAt,
			})
			.from(repositoryWebhook)
			.innerJoin(repository, eq(repositoryWebhook.repositoryId, repository.id))
			.where(eq(repositoryWebhook.enabled, true));
	}

	async updateHeartbeat(repositoryIds: string[]) {
		if (repositoryIds.length === 0) return;
		const now = new Date();
		await this.executor
			.update(repositoryWebhook)
			.set({
				verifiedAt: now,
				lastDeliveredAt: now,
				updatedAt: now,
			})
			.where(inArray(repositoryWebhook.repositoryId, repositoryIds));
	}

	async listMatchingWebhookSecretPreviews(
		repositoryId: string,
		providerId: string,
		providerWebhookIds: string[],
	) {
		if (providerWebhookIds.length === 0) return [];
		return this.executor
			.select({
				providerWebhookId: repositoryWebhook.providerWebhookId,
				secretPreview: repositoryWebhook.secretPreview,
			})
			.from(repositoryWebhook)
			.where(
				and(
					eq(repositoryWebhook.repositoryId, repositoryId),
					eq(repositoryWebhook.providerId, providerId),
					inArray(repositoryWebhook.providerWebhookId, providerWebhookIds),
				),
			);
	}

	deleteByRepositoryAndProvider(repositoryId: string, providerId: string) {
		return this.deleteMany(
			and(
				eq(repositoryWebhook.repositoryId, repositoryId),
				eq(repositoryWebhook.providerId, providerId),
			)!,
		);
	}
}

/** Idempotency receipts for inbound webhook deliveries. */
export class WebhookEventReceiptRepository extends BaseRepository<
	typeof webhookEventReceipt
> {
	constructor(executor: Executor) {
		super(executor, webhookEventReceipt);
	}

	findByProviderDelivery(providerId: string, deliveryId: string) {
		return this.findOne(
			and(
				eq(webhookEventReceipt.providerId, providerId),
				eq(webhookEventReceipt.deliveryId, deliveryId),
			),
		);
	}

	listByRepository(repositoryId: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(webhookEventReceipt.repositoryId, repositoryId),
			orderBy: desc(webhookEventReceipt.receivedAt),
			...page,
		});
	}

	/** Records a delivery once; returns null if it was already seen. */
	async recordOnce(values: WebhookEventReceiptInsert) {
		const rows = await this.executor
			.insert(webhookEventReceipt)
			.values(values)
			.onConflictDoNothing({
				target: [
					webhookEventReceipt.providerId,
					webhookEventReceipt.deliveryId,
				],
			})
			.returning();
		return rows[0] ?? null;
	}

	async expireStaleReceipts(now: Date, timeoutMs: number) {
		const threshold = new Date(now.getTime() - timeoutMs);
		return this.executor
			.update(webhookEventReceipt)
			.set({ status: "failed", processedAt: now, updatedAt: now })
			.where(
				and(
					inArray(webhookEventReceipt.status, ["received", "processing"]),
					lt(webhookEventReceipt.updatedAt, threshold),
				),
			)
			.returning({ id: webhookEventReceipt.id });
	}

	async createReceipt(values: typeof webhookEventReceipt.$inferInsert) {
		const inserted = await this.recordOnce(values);
		if (inserted) {
			return {
				receiptId: inserted.id,
				duplicate: false,
			};
		}
		if (values.deliveryId) {
			const existing = await this.findByProviderDelivery(
				values.providerId,
				values.deliveryId,
			);
			if (!existing) {
				throw new Error("Webhook receipt conflict could not be resolved.");
			}
			return {
				receiptId: existing.id,
				duplicate: true,
			};
		}
		throw new Error("Webhook receipt could not be created.");
	}

	async updateStatus(
		receiptId: string,
		status: typeof webhookEventReceipt.$inferSelect.status,
	) {
		const now = new Date();
		await this.executor
			.update(webhookEventReceipt)
			.set({
				status,
				processedAt:
					status === "processing" || status === "received" ? null : now,
				updatedAt: now,
			})
			.where(eq(webhookEventReceipt.id, receiptId));
	}
}
