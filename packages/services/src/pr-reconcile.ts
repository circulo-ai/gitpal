import { randomUUID } from "node:crypto";
import { db } from "@gitpal/db";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import type { GitProviderAdapter, GitPullRequest } from "@gitpal/git";
import { enqueuePullRequestSyncJob } from "@gitpal/jobs/inngest/functions/pr-sync";
import { createLogger } from "@gitpal/logger";
import { and, eq } from "drizzle-orm";
import { mapWithConcurrency } from "./bounded-concurrency";
import { getAutomationActorForRepository } from "./git-provider-access";
import { projectIssueSnapshot } from "./issue-projection";
import {
	projectPullRequestSnapshot,
	reconcileHumanReviewSummary,
	recordPullRequestMetricEvents,
} from "./pr-projection";
import { summarizeHumanReviews } from "./pull-request-reviews";
import { sanitizeDiagnosticText } from "./safe-diagnostics";

const log = createLogger("pull-request-reconcile");

function getErrorMessage(error: unknown) {
	return error instanceof Error
		? error.message
		: "Provider reconciliation failed.";
}

async function markReconcileFailed(repositoryId: string, error: string) {
	await db
		.update(dashboardSchema.repository)
		.set({
			reconcileState: "failed",
			lastReconcileFailedAt: new Date(),
			lastReconcileError: sanitizeDiagnosticText(error).slice(0, 2_000),
		})
		.where(eq(dashboardSchema.repository.id, repositoryId));
}

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
 * reconcile. Provider timestamps drive timing metrics, while timestamp-less
 * current approvals (such as GitLab's approvals endpoint) still heal state.
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
	const reconcileStartedAt = new Date();
	await db
		.update(dashboardSchema.repository)
		.set({
			reconcileState: "running",
			lastReconcileStartedAt: reconcileStartedAt,
			lastReconcileError: null,
		})
		.where(eq(dashboardSchema.repository.id, repository.id));

	const automationActor = await getAutomationActorForRepository({
		repositoryId: repository.id,
		providerId: repository.providerId,
	});
	if (!automationActor) {
		log.debug(
			{ repositoryId },
			"Reconcile skipped — no automation actor for repository.",
		);
		await markReconcileFailed(
			repository.id,
			"No provider credentials are available for reconciliation.",
		);
		return { projected: 0 };
	}

	const issueProjected = await reconcileKnownIssueSnapshots({
		adapter: automationActor.adapter,
		repositoryId: repository.id,
		repositoryPath: repository.repositoryPath,
	});

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
		await markReconcileFailed(repository.id, getErrorMessage(error));
		return { projected: 0 };
	}

	const projectedRows = await mapWithConcurrency(
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
					observedAt: reconcileStartedAt,
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
	const failed = pullRequests.length - projected;
	if (failed > 0) {
		await markReconcileFailed(
			repository.id,
			`${failed} of ${pullRequests.length} pull requests could not be reconciled.`,
		);
	} else {
		await db
			.update(dashboardSchema.repository)
			.set({
				reconcileState: "healthy",
				lastReconciledAt: new Date(),
				lastReconcileError: null,
			})
			.where(eq(dashboardSchema.repository.id, repository.id));
	}
	log.info(
		{
			repositoryId,
			projected,
			issueProjected,
			total: pullRequests.length,
		},
		"Pull request reconcile complete.",
	);
	return { projected };
}

async function reconcileKnownIssueSnapshots({
	adapter,
	repositoryId,
	repositoryPath,
}: {
	adapter: GitProviderAdapter;
	repositoryId: string;
	repositoryPath: string;
}) {
	const knownIssues = await db
		.select({ number: dashboardSchema.issue.number })
		.from(dashboardSchema.issue)
		.where(eq(dashboardSchema.issue.repositoryId, repositoryId));
	const results = await mapWithConcurrency(
		knownIssues,
		3,
		async ({ number }) => {
			try {
				const issue = await adapter.getIssue({
					repositoryPath,
					issueNumber: number,
				});
				await projectIssueSnapshot({ repositoryId, issue });
				return 1;
			} catch (error) {
				log.warn(
					{ err: error, repositoryId, issueNumber: number },
					"Reconcile skipped - issue projection failed.",
				);
				return 0;
			}
		},
	);
	return results.reduce<number>((total, value) => total + value, 0);
}

/**
 * Backfill human-review timing for a single PR from the provider's reviews.
 *
 * Bot and pending reviews never affect the summary. Timestamp-less provider
 * approvals update current state without fabricating timing data.
 */
async function backfillHumanReviews({
	adapter,
	repositoryId,
	repositoryPath,
	pullRequestNumber,
	observedAt,
}: {
	adapter: GitProviderAdapter;
	repositoryId: string;
	repositoryPath: string;
	pullRequestNumber: number;
	observedAt: Date;
}): Promise<typeof dashboardSchema.pullRequest.$inferSelect | null> {
	const reviews = await adapter.listPullRequestReviews({
		repositoryPath,
		pullRequestNumber,
	});
	return reconcileHumanReviewSummary({
		repositoryId,
		pullRequestNumber,
		summary: summarizeHumanReviews(reviews),
		observedAt,
	});
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
	const results = await mapWithConcurrency(
		rows,
		10,
		async ({ repositoryId }) => {
			try {
				const value = await enqueuePullRequestSyncJob({
					repositoryId,
					reason: "scheduled",
				});
				return { status: "fulfilled" as const, value };
			} catch (reason) {
				return { status: "rejected" as const, reason };
			}
		},
	);
	for (const result of results) {
		if (result.status === "rejected") {
			log.warn(
				{ err: result.reason },
				"Pull request reconcile dispatch failed for one repository.",
			);
		}
	}
	const dispatched = results.filter(
		(result) => result.status === "fulfilled",
	).length;
	log.info(
		{ dispatched, requested: rows.length },
		"Pull request reconcile dispatched.",
	);
	return { dispatched };
}

export async function queuePullRequestReconcileForUser({
	userId,
	organizationId,
	repositoryId,
}: {
	userId: string;
	organizationId: string;
	repositoryId: string;
}) {
	const [access] = await db
		.select({ repositoryId: dashboardSchema.repository.id })
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
		return {
			queued: false,
			jobId: null,
			error: "Repository access was not found.",
		};
	}

	try {
		const job = await enqueuePullRequestSyncJob({
			repositoryId,
			reason: "on-demand",
			requestId: `pr_sync_${randomUUID()}`,
		});
		return { queued: true, jobId: job.ids?.[0] ?? null, error: null };
	} catch (error) {
		return {
			queued: false,
			jobId: null,
			error: getErrorMessage(error),
		};
	}
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
