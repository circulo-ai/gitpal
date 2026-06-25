import {
	issue,
	knowledgeBaseLearning,
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
	webhookEventReceipt,
} from "@gitpal/db/schema";
import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { BaseRepository, type PageRequest } from "./shared/base.repository";
import { conflictUpdateAllExcept } from "./shared/sql";
import type { Executor } from "./shared/types";

const ACTIVE_REVIEW_STATUSES = ["queued", "running"] as const;

type RepositoryInsert = typeof repository.$inferInsert;
type RepositoryAccessInsert = typeof repositoryAccess.$inferInsert;
type ProviderWorkspaceMemberInsert = typeof providerWorkspaceMember.$inferInsert;
type PullRequestInsert = typeof pullRequest.$inferInsert;
type IssueInsert = typeof issue.$inferInsert;
type OrganizationSettingsInsert = typeof organizationSettings.$inferInsert;
type RepositorySettingsInsert = typeof repositorySettings.$inferInsert;
type RepositoryWebhookInsert = typeof repositoryWebhook.$inferInsert;
type WebhookEventReceiptInsert = typeof webhookEventReceipt.$inferInsert;

/** Connected source-control repositories. */
export class RepositoryRepository extends BaseRepository<typeof repository> {
	constructor(executor: Executor) {
		super(executor, repository);
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
			)
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
				]),
			})
			.returning();
		return row;
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
			)
		);
	}

	listByUser(userId: string, { enabledOnly = true }: { enabledOnly?: boolean } = {}) {
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

	listByRepository(repositoryId: string) {
		return this.findMany({
			where: eq(repositoryAccess.repositoryId, repositoryId),
		});
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
			)
		);
	}

	listByOrganization(organizationId: string) {
		return this.findMany({
			where: eq(providerWorkspaceMember.organizationId, organizationId),
			orderBy: providerWorkspaceMember.login,
		});
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
			)
		);
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
}

/** Issues, unique per (repository, number). */
export class IssueRepository extends BaseRepository<typeof issue> {
	constructor(executor: Executor) {
		super(executor, issue);
	}

	findByNumber(repositoryId: string, number: number) {
		return this.findOne(
			and(eq(issue.repositoryId, repositoryId), eq(issue.number, number))
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
			)
		);
	}

	listByPullRequest(pullRequestId: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(reviewRun.pullRequestId, pullRequestId),
			orderBy: desc(reviewRun.createdAt),
			...page,
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
			)
		);
	}

	findActiveForIssue(issueId: string, reviewKind: string) {
		return this.findOne(
			and(
				eq(reviewRun.issueId, issueId),
				eq(reviewRun.reviewKind, reviewKind),
				inArray(reviewRun.status, [...ACTIVE_REVIEW_STATUSES]),
			)
		);
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

	findByStepKey(reviewRunId: string, stepKey: string, attempt: number) {
		return this.findOne(
			and(
				eq(reviewRunStep.reviewRunId, reviewRunId),
				eq(reviewRunStep.stepKey, stepKey),
				eq(reviewRunStep.attempt, attempt),
			)
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
			)
		);
	}

	listByRepository(repositoryId: string) {
		return this.findMany({
			where: eq(repositoryWebhook.repositoryId, repositoryId),
		});
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
			)
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
				target: [webhookEventReceipt.providerId, webhookEventReceipt.deliveryId],
			})
			.returning();
		return rows[0] ?? null;
	}
}
