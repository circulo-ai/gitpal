import { db } from "@gitpal/db";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import type { GitProviderAdapter, GitPullRequest } from "@gitpal/git";
import { enqueuePullRequestSyncJob } from "@gitpal/jobs/inngest/functions/pr-sync";
import { createLogger } from "@gitpal/logger";
import { eq } from "drizzle-orm";
import { getAutomationActorForRepository } from "./git-provider-access";
import {
	projectPullRequestSnapshot,
	recordHumanReviewSignal,
	recordPullRequestMetricEvents,
} from "./pr-projection";

const log = createLogger("pull-request-reconcile");

/**
 * Reconcile a single repository's pull requests against the provider.
 *
 * Strategy:
 *  1. List the provider's PRs with `state: "all"` so the sweep is complete,
 *     not just open-only.
 *  2. Project every PR snapshot and backfill human review timing in a bounded
 *     concurrent worker pool.
 *
 * This refreshes mergedAt / closedAt / state / draft / approval-independent
 * lifecycle fields for the full repository, not just the active subset. It
 * also backfills review timing (firstHumanReviewAt / lastHumanReviewAt /
 * approvedAt / approvalState) from adapter.listPullRequestReviews for each
 * projected PR, so a missed pull_request_review webhook self-heals on the next
 * reconcile. Only reviews that carry a real provider timestamp are folded in;
 * GitLab approvals without a system note (hence no timestamp) are skipped to
 * avoid polluting timing with the reconcile time.
 */
export async function reconcilePullRequestsForRepository({
	repositoryId,
}: {
	repositoryId: string;
}): Promise<{ projected: number }> {
	const [repository] = await db
		.select()
		.from(dashboardSchema.repository)
		.where(eq(dashboardSchema.repository.id, repositoryId))
		.limit(1);
	if (!repository) {
		return { projected: 0 };
	}

	const automationActor = await getAutomationActorForRepository({
		repositoryId: repository.id,
		providerId: repository.providerId,
	});
	if (!automationActor) {
		log.debug(
			{ repositoryId },
			"Reconcile skipped — no automation actor for repository.",
		);
		return { projected: 0 };
	}

	let pullRequests: GitPullRequest[];
	try {
		pullRequests = await automationActor.adapter.listPullRequests({
			repositoryPath: repository.repositoryPath,
			state: "all",
		});
	} catch (error) {
		log.warn(
			{ err: error, repositoryId },
			"Reconcile failed — listPullRequests error.",
		);
		return { projected: 0 };
	}

	const projectedRows = await runWithConcurrency(
		pullRequests,
		3,
		async (pullRequest) => {
			try {
				const projectedRow = await projectPullRequestSnapshot({
					repositoryId: repository.id,
					pullRequest,
				});
				const reviewedRow = await backfillHumanReviews({
					adapter: automationActor.adapter,
					repositoryId: repository.id,
					repositoryPath: repository.repositoryPath,
					pullRequestNumber: pullRequest.number,
				});
				await recordPullRequestMetricEvents({
					userId: automationActor.userId,
					repository,
					pullRequest: reviewedRow ?? projectedRow,
					source: { type: "reconcile" },
				});
				return 1;
			} catch (error) {
				log.warn(
					{ err: error, repositoryId, pullRequestNumber: pullRequest.number },
					"Reconcile skipped — pull request projection failed.",
				);
				return 0;
			}
		},
	);

	const projected = projectedRows.reduce<number>(
		(total, value) => total + value,
		0,
	);
	log.info(
		{
			repositoryId,
			projected,
			total: pullRequests.length,
		},
		"Pull request reconcile complete.",
	);
	return { projected };
}

/**
 * Backfill human-review timing for a single PR from the provider's reviews.
 *
 * Best-effort and bounded: a failure here never fails the reconcile. Bot
 * reviews and reviews without a real timestamp are skipped so that
 * firstHumanReviewAt / lastHumanReviewAt only ever reflect genuine human review
 * events (never the reconcile time).
 */
async function backfillHumanReviews({
	adapter,
	repositoryId,
	repositoryPath,
	pullRequestNumber,
}: {
	adapter: GitProviderAdapter;
	repositoryId: string;
	repositoryPath: string;
	pullRequestNumber: number;
}): Promise<typeof dashboardSchema.pullRequest.$inferSelect | null> {
	let reviews: Awaited<
		ReturnType<GitProviderAdapter["listPullRequestReviews"]>
	>;
	try {
		reviews = await adapter.listPullRequestReviews({
			repositoryPath,
			pullRequestNumber,
		});
	} catch (error) {
		log.debug(
			{ err: error, repositoryId, pullRequestNumber },
			"Review backfill skipped — listPullRequestReviews error.",
		);
		return null;
	}

	let latestRow: typeof dashboardSchema.pullRequest.$inferSelect | null = null;
	for (const review of reviews) {
		// Pending reviews have not been submitted; skip.
		if (review.state === "pending") {
			continue;
		}
		// Only fold in reviews with a real provider timestamp so we never set review
		// timing to the reconcile time (e.g. GitLab approvals without a note).
		if (!review.submittedAt) {
			continue;
		}
		const login = review.author?.login?.toLowerCase() ?? "";
		if (review.author?.kind === "bot" || login.endsWith("[bot]")) {
			continue;
		}
		latestRow =
			(await recordHumanReviewSignal({
				repositoryId,
				pullRequestNumber,
				reviewedAt: new Date(review.submittedAt),
				isApproval: review.state === "approved",
				approvalState: review.state,
			})) ?? latestRow;
	}

	return latestRow;
}

/**
 * Fan out a reconcile job for every repository that has at least one enabled
 * access row. Invoked by the scheduled `dispatch-all` job.
 */
export async function dispatchPullRequestReconcile(): Promise<{
	dispatched: number;
}> {
	const rows = await db
		.selectDistinct({
			repositoryId: dashboardSchema.repositoryAccess.repositoryId,
		})
		.from(dashboardSchema.repositoryAccess)
		.where(eq(dashboardSchema.repositoryAccess.enabled, true));
	const results = await Promise.allSettled(
		rows.map(({ repositoryId }) =>
			enqueuePullRequestSyncJob({ repositoryId, reason: "scheduled" }),
		),
	);
	for (const result of results) {
		if (result.status === "rejected") {
			log.warn(
				{ err: result.reason },
				"Pull request reconcile dispatch failed for one repository.",
			);
		}
	}
	log.info({ dispatched: rows.length }, "Pull request reconcile dispatched.");
	return { dispatched: rows.length };
}

/**
 * Worker entrypoint: maps a pull-request-sync job to its work. Wire this into
 * createPullRequestSyncWorker at bootstrap.
 */
export async function processPullRequestSyncJob(data: {
	repositoryId?: string;
	reason?: string;
}): Promise<void> {
	if (data.repositoryId) {
		await reconcilePullRequestsForRepository({
			repositoryId: data.repositoryId,
		});
		return;
	}
	await dispatchPullRequestReconcile();
}

async function runWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	mapper: (item: T) => Promise<R>,
) {
	if (items.length === 0) {
		return [] as R[];
	}

	const results = new Array<R>(items.length);
	let cursor = 0;
	const workerCount = Math.min(concurrency, items.length);

	await Promise.all(
		Array.from({ length: workerCount }, async () => {
			while (true) {
				const currentIndex = cursor;
				cursor += 1;

				if (currentIndex >= items.length) {
					return;
				}

				const item = items[currentIndex];
				if (item === undefined) {
					return;
				}

				results[currentIndex] = await mapper(item);
			}
		}),
	);

	return results;
}
