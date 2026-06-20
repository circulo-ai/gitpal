import { randomUUID } from "node:crypto";
import { db, runTransactionWithRetry } from "@gitpal/db";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import type { GitPullRequest } from "@gitpal/git";
import { createLogger } from "@gitpal/logger";
import { and, eq } from "drizzle-orm";
import { recordObservabilityEvent } from "./observability";
import type { HumanReviewSummary } from "./pull-request-reviews";

const log = createLogger("pull-request-projection");

export type ProjectedPullRequestRow =
	typeof dashboardSchema.pullRequest.$inferSelect;

function toDateOrNull(value: string | null | undefined) {
	if (!value) {
		return null;
	}
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function durationMsBetween(start: Date | null, end: Date | null) {
	if (!start || !end) {
		return null;
	}

	const durationMs = end.getTime() - start.getTime();
	return durationMs >= 0 ? durationMs : null;
}

/**
 * Upsert the durable lifecycle snapshot for a pull request (state, mergedAt,
 * closedAt, draft, branches, author, ...).
 *
 * This is the single shared projection used by:
 *  - the real-time webhook path (repository-webhooks.ts)
 *  - the scheduled reconcile worker (pull-request-reconcile.ts)
 *  - any future on-demand refresh
 *
 * Keyed on (repositoryId, number) and fully idempotent, so it is safe to call
 * from multiple paths for the same PR.
 */
export async function projectPullRequestSnapshot({
	repositoryId,
	pullRequest,
}: {
	repositoryId: string;
	pullRequest: GitPullRequest;
}): Promise<ProjectedPullRequestRow> {
	const updatedAt = toDateOrNull(pullRequest.updatedAt) ?? new Date();
	const createdAt = toDateOrNull(pullRequest.createdAt) ?? updatedAt;
	const mergedAt = toDateOrNull(pullRequest.mergedAt);
	const closedAt = toDateOrNull(pullRequest.closedAt);
	const reviewReadyAt = pullRequest.draft ? null : updatedAt;
	const [row] = await db
		.insert(dashboardSchema.pullRequest)
		.values({
			id: `pull_request_${randomUUID()}`,
			repositoryId,
			providerPullRequestId: pullRequest.id,
			number: pullRequest.number,
			title: pullRequest.title,
			state: pullRequest.state,
			draft: pullRequest.draft,
			htmlUrl: pullRequest.htmlUrl,
			sourceBranch: pullRequest.sourceBranch,
			targetBranch: pullRequest.targetBranch,
			authorLogin: pullRequest.author?.login,
			authorName: pullRequest.author?.name,
			authorAvatarUrl: pullRequest.author?.avatarUrl,
			createdAt,
			updatedAt,
			mergedAt,
			closedAt,
			lastCommitAt: updatedAt,
			reviewReadyAt,
			mergeCommitSha: pullRequest.mergeCommitSha,
		})
		.onConflictDoUpdate({
			target: [
				dashboardSchema.pullRequest.repositoryId,
				dashboardSchema.pullRequest.number,
			],
			set: {
				providerPullRequestId: pullRequest.id,
				title: pullRequest.title,
				state: pullRequest.state,
				draft: pullRequest.draft,
				htmlUrl: pullRequest.htmlUrl,
				sourceBranch: pullRequest.sourceBranch,
				targetBranch: pullRequest.targetBranch,
				authorLogin: pullRequest.author?.login,
				authorName: pullRequest.author?.name,
				authorAvatarUrl: pullRequest.author?.avatarUrl,
				updatedAt,
				mergedAt,
				closedAt,
				lastCommitAt: updatedAt,
				reviewReadyAt,
				mergeCommitSha: pullRequest.mergeCommitSha,
			},
		})
		.returning();
	if (!row) {
		throw new Error("Pull request snapshot could not be stored.");
	}
	return row;
}

export type HumanReviewSignal = {
	repositoryId: string;
	pullRequestNumber: number;
	reviewedAt: Date;
	isApproval?: boolean;
	approvalState?: string | null;
};

/**
 * Record human (non-bot) review activity against an existing PR snapshot:
 *  - firstHumanReviewAt — set once, on the earliest human review
 *  - lastHumanReviewAt  — advanced to the most recent human review
 *  - approvalState / approvedAt — latest review decision
 *
 * Returns null when the PR snapshot does not exist yet. On the webhook path the
 * lifecycle snapshot is always projected first, so this is an edge case (and
 * the next reconcile sweep will create the row).
 *
 * Provider reconciliation backfills exact historical bounds. This path keeps
 * webhook-time state monotonic until the next provider snapshot arrives.
 */
export async function recordHumanReviewSignal({
	repositoryId,
	pullRequestNumber,
	reviewedAt,
	isApproval = false,
	approvalState = null,
}: HumanReviewSignal): Promise<ProjectedPullRequestRow | null> {
	return runTransactionWithRetry(async (tx) => {
		const [existing] = await tx
			.select()
			.from(dashboardSchema.pullRequest)
			.where(
				and(
					eq(dashboardSchema.pullRequest.repositoryId, repositoryId),
					eq(dashboardSchema.pullRequest.number, pullRequestNumber),
				),
			)
			.limit(1)
			.for("update");
		if (!existing) {
			log.warn(
				{ repositoryId, pullRequestNumber },
				"Human review signal skipped — pull request snapshot not found.",
			);
			return null;
		}
		const firstHumanReviewAt =
			existing.firstHumanReviewAt && existing.firstHumanReviewAt < reviewedAt
				? existing.firstHumanReviewAt
				: reviewedAt;
		const isLatestSignal =
			!existing.lastHumanReviewAt || reviewedAt >= existing.lastHumanReviewAt;
		const isDecisiveNonApproval =
			approvalState === "changes_requested" || approvalState === "dismissed";
		const isDecisiveReview = isApproval || isDecisiveNonApproval;
		const approvedAt = isApproval
			? existing.approvedAt && existing.approvedAt < reviewedAt
				? existing.approvedAt
				: reviewedAt
			: isLatestSignal && isDecisiveNonApproval
				? null
				: (existing.approvedAt ?? null);
		const [row] = await tx
			.update(dashboardSchema.pullRequest)
			.set({
				firstHumanReviewAt,
				lastHumanReviewAt: isLatestSignal
					? reviewedAt
					: existing.lastHumanReviewAt,
				approvalState:
					isLatestSignal &&
					approvalState &&
					(isDecisiveReview || !existing.approvalState)
						? approvalState
						: (existing.approvalState ?? null),
				approvedAt,
				reviewStateUpdatedAt: new Date(),
			})
			.where(eq(dashboardSchema.pullRequest.id, existing.id))
			.returning();
		return row ?? null;
	});
}

export async function reconcileHumanReviewSummary({
	repositoryId,
	pullRequestNumber,
	summary,
	observedAt,
}: {
	repositoryId: string;
	pullRequestNumber: number;
	summary: HumanReviewSummary;
	observedAt: Date;
}): Promise<ProjectedPullRequestRow | null> {
	return runTransactionWithRetry(async (tx) => {
		const [existing] = await tx
			.select()
			.from(dashboardSchema.pullRequest)
			.where(
				and(
					eq(dashboardSchema.pullRequest.repositoryId, repositoryId),
					eq(dashboardSchema.pullRequest.number, pullRequestNumber),
				),
			)
			.limit(1)
			.for("update");
		if (!existing) return null;

		const firstHumanReviewAt =
			existing.firstHumanReviewAt && summary.firstHumanReviewAt
				? existing.firstHumanReviewAt < summary.firstHumanReviewAt
					? existing.firstHumanReviewAt
					: summary.firstHumanReviewAt
				: (existing.firstHumanReviewAt ?? summary.firstHumanReviewAt);
		const lastHumanReviewAt =
			existing.lastHumanReviewAt && summary.lastHumanReviewAt
				? existing.lastHumanReviewAt > summary.lastHumanReviewAt
					? existing.lastHumanReviewAt
					: summary.lastHumanReviewAt
				: (existing.lastHumanReviewAt ?? summary.lastHumanReviewAt);
		const canReplaceCurrentState =
			!existing.reviewStateUpdatedAt ||
			existing.reviewStateUpdatedAt <= observedAt;
		const approvedAt = canReplaceCurrentState
			? (summary.approvedAt ??
				(summary.approvalState === "approved" ? existing.approvedAt : null))
			: existing.approvedAt;
		const [row] = await tx
			.update(dashboardSchema.pullRequest)
			.set({
				firstHumanReviewAt,
				lastHumanReviewAt,
				approvalState: canReplaceCurrentState
					? summary.approvalState
					: existing.approvalState,
				approvedAt,
				reviewStateUpdatedAt: canReplaceCurrentState
					? new Date()
					: existing.reviewStateUpdatedAt,
			})
			.where(eq(dashboardSchema.pullRequest.id, existing.id))
			.returning();

		return row ?? null;
	});
}

export async function recordPullRequestMetricEvents({
	userId,
	repository,
	pullRequest,
	source,
}: {
	userId: string;
	repository: Pick<
		typeof dashboardSchema.repository.$inferSelect,
		"id" | "organizationId" | "fullName" | "providerId"
	>;
	pullRequest: ProjectedPullRequestRow;
	source: {
		type: "webhook" | "reconcile";
		event?: string | null;
		action?: string | null;
	};
}) {
	const mergeDurationMs = durationMsBetween(
		pullRequest.createdAt,
		pullRequest.mergedAt,
	);
	const approvalLatencyMs = durationMsBetween(
		pullRequest.reviewReadyAt ?? pullRequest.createdAt,
		pullRequest.approvedAt,
	);

	if (mergeDurationMs !== null && pullRequest.mergedAt) {
		await recordObservabilityEvent({
			userId,
			organizationId: repository.organizationId,
			repositoryId: repository.id,
			pullRequestId: pullRequest.id,
			kind: "review",
			action: "pull-request.merge-time",
			status: "completed",
			severity: "success",
			title: "Pull request merge time captured",
			body: `${repository.fullName}#${pullRequest.number}`,
			sourceType: "pull-request",
			sourceId: pullRequest.id,
			dedupeKey: `pull-request:${pullRequest.id}:merge-time:${pullRequest.mergedAt.getTime()}`,
			durationMs: mergeDurationMs,
			metadata: {
				metric: "pr_merge_time",
				providerId: repository.providerId,
				source,
				createdAt: pullRequest.createdAt.toISOString(),
				mergedAt: pullRequest.mergedAt.toISOString(),
			},
			occurredAt: pullRequest.mergedAt,
		});
	}

	if (approvalLatencyMs !== null && pullRequest.approvedAt) {
		await recordObservabilityEvent({
			userId,
			organizationId: repository.organizationId,
			repositoryId: repository.id,
			pullRequestId: pullRequest.id,
			kind: "review",
			action: "pull-request.approval-latency",
			status: "completed",
			severity: "success",
			title: "Pull request approval latency captured",
			body: `${repository.fullName}#${pullRequest.number}`,
			sourceType: "pull-request",
			sourceId: pullRequest.id,
			dedupeKey: `pull-request:${pullRequest.id}:approval-latency:${pullRequest.approvedAt.getTime()}`,
			durationMs: approvalLatencyMs,
			metadata: {
				metric: "approval_latency",
				providerId: repository.providerId,
				source,
				reviewReadyAt:
					pullRequest.reviewReadyAt?.toISOString() ??
					pullRequest.createdAt.toISOString(),
				approvedAt: pullRequest.approvedAt.toISOString(),
			},
			occurredAt: pullRequest.approvedAt,
		});
	}
}
