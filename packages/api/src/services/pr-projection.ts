import { randomUUID } from "node:crypto";
import { createDb } from "@gitpal/db";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import type { GitPullRequest } from "@gitpal/git";
import { createLogger } from "@gitpal/logger";
import { and, eq } from "drizzle-orm";

const db = createDb();
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
 * NOTE: provider APIs do not expose historical per-review timestamps, so these
 * review-timing columns can only be captured here, in real time. The reconcile
 * worker intentionally does not touch them.
 */
export async function recordHumanReviewSignal({
  repositoryId,
  pullRequestNumber,
  reviewedAt,
  isApproval = false,
  approvalState = null,
}: HumanReviewSignal): Promise<ProjectedPullRequestRow | null> {
  const [existing] = await db
    .select()
    .from(dashboardSchema.pullRequest)
    .where(
      and(
        eq(dashboardSchema.pullRequest.repositoryId, repositoryId),
        eq(dashboardSchema.pullRequest.number, pullRequestNumber),
      ),
    )
    .limit(1);
  if (!existing) {
    log.warn(
      { repositoryId, pullRequestNumber },
      "Human review signal skipped — pull request snapshot not found.",
    );
    return null;
  }
  const firstHumanReviewAt = existing.firstHumanReviewAt ?? reviewedAt;
  const lastHumanReviewAt =
    existing.lastHumanReviewAt && existing.lastHumanReviewAt > reviewedAt
      ? existing.lastHumanReviewAt
      : reviewedAt;
  const [row] = await db
    .update(dashboardSchema.pullRequest)
    .set({
      firstHumanReviewAt,
      lastHumanReviewAt,
      approvalState: approvalState ?? existing.approvalState ?? null,
      approvedAt: isApproval ? reviewedAt : (existing.approvedAt ?? null),
    })
    .where(eq(dashboardSchema.pullRequest.id, existing.id))
    .returning();
  return row ?? null;
}
