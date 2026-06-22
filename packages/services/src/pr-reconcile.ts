import { randomUUID } from "node:crypto";
import { db } from "@gitpal/db";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import {
	type GitProviderAdapter,
	type GitProviderRateLimitError,
	type GitPullRequest,
	toGitProviderRateLimitError,
} from "@gitpal/git";
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
import { getIncrementalReconcileWindow } from "./reconcile-strategy";
import { sanitizeDiagnosticText } from "./safe-diagnostics";

const log = createLogger("pull-request-reconcile");
const SCHEDULED_RECONCILE_INTERVAL_MS = 15 * 60 * 1_000;

function getErrorMessage(error: unknown) {
	return error instanceof Error
		? error.message
		: "Provider reconciliation failed.";
}

async function markReconcileFailed(
	repositoryId: string,
	error: string,
	rateLimit?: GitProviderRateLimitError | null,
) {
	const now = new Date();
	await db
		.update(dashboardSchema.repository)
		.set({
			reconcileState: "failed",
			lastReconcileFailedAt: now,
			lastReconcileError: sanitizeDiagnosticText(error).slice(0, 2_000),
			nextRetryAt: rateLimit
				? new Date(now.getTime() + rateLimit.retryAfterSeconds * 1000)
				: null,
			retryHint: rateLimit
				? `The ${rateLimit.providerId ?? "provider"} asked GitPal to pause. Automatic retry is scheduled.`
				: "Retry the sync after checking provider credentials and repository access.",
		})
		.where(eq(dashboardSchema.repository.id, repositoryId));
}

export async function markPullRequestReconcileFailed({
	repositoryId,
	errorMessage,
}: {
	repositoryId: string;
	errorMessage: string;
}) {
	await markReconcileFailed(repositoryId, errorMessage);
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
}): Promise<{ projected: number; issuesProjected: number }> {
	const [repository] = await db
		.select()
		.from(dashboardSchema.repository)
		.where(eq(dashboardSchema.repository.id, repositoryId))
		.limit(1);
	if (!repository) {
		return { projected: 0, issuesProjected: 0 };
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
		return { projected: 0, issuesProjected: 0 };
	}

	const reconcileWindow = getIncrementalReconcileWindow(
		repository,
		reconcileStartedAt,
	);
	let issueResult: Awaited<ReturnType<typeof reconcileIssueSnapshots>>;
	try {
		issueResult = await reconcileIssueSnapshots({
			adapter: automationActor.adapter,
			repositoryId: repository.id,
			repositoryPath: repository.repositoryPath,
			updatedAfter: reconcileWindow.updatedAfter,
		});
	} catch (error) {
		const rateLimit = toGitProviderRateLimitError(error, repository.providerId);
		await markReconcileFailed(
			repository.id,
			getErrorMessage(rateLimit ?? error),
			rateLimit,
		);
		if (rateLimit) throw rateLimit;
		return { projected: 0, issuesProjected: 0 };
	}

	let pullRequests: GitPullRequest[];
	try {
		pullRequests = await automationActor.adapter.listPullRequests({
			repositoryPath: repository.repositoryPath,
			state: "all",
			updatedAfter: reconcileWindow.updatedAfter,
		});
	} catch (error) {
		const rateLimit = toGitProviderRateLimitError(error, repository.providerId);
		log.warn(
			{ err: error, repositoryId },
			"Reconcile failed — listPullRequests error.",
		);
		await markReconcileFailed(
			repository.id,
			getErrorMessage(rateLimit ?? error),
			rateLimit,
		);
		if (rateLimit) throw rateLimit;
		return { projected: 0, issuesProjected: issueResult.projected };
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
	const issueFailed = issueResult.total - issueResult.projected;
	const reconcileErrors = [
		issueResult.error,
		failed > 0
			? `${failed} of ${pullRequests.length} pull requests could not be reconciled.`
			: null,
		issueFailed > 0
			? `${issueFailed} of ${issueResult.total} issues could not be reconciled.`
			: null,
	].filter((error): error is string => Boolean(error));
	if (reconcileErrors.length > 0) {
		await markReconcileFailed(repository.id, reconcileErrors.join(" "));
	} else {
		await db
			.update(dashboardSchema.repository)
			.set({
				reconcileState: "healthy",
				lastReconciledAt: new Date(),
				incrementalSyncCursor: reconcileStartedAt,
				lastFullReconciledAt: reconcileWindow.full
					? reconcileStartedAt
					: repository.lastFullReconciledAt,
				lastReconcileError: null,
				nextRetryAt: null,
				retryHint: null,
			})
			.where(eq(dashboardSchema.repository.id, repository.id));
	}
	log.info(
		{
			repositoryId,
			projected,
			issueProjected: issueResult.projected,
			issueTotal: issueResult.total,
			total: pullRequests.length,
		},
		"Pull request reconcile complete.",
	);
	return { projected, issuesProjected: issueResult.projected };
}

async function reconcileIssueSnapshots({
	adapter,
	repositoryId,
	repositoryPath,
	updatedAfter,
}: {
	adapter: GitProviderAdapter;
	repositoryId: string;
	repositoryPath: string;
	updatedAfter?: string;
}) {
	let issues: Awaited<ReturnType<GitProviderAdapter["listIssues"]>>;
	try {
		issues = await adapter.listIssues({
			repositoryPath,
			state: "all",
			updatedAfter,
		});
	} catch (error) {
		const rateLimit = toGitProviderRateLimitError(error, adapter.providerId);
		if (rateLimit) throw rateLimit;
		log.warn(
			{ err: error, repositoryId },
			"Reconcile failed - listIssues error.",
		);
		return { projected: 0, total: 0, error: getErrorMessage(error) };
	}
	const results = await mapWithConcurrency(issues, 3, async (issue) => {
		try {
			await projectIssueSnapshot({ repositoryId, issue });
			return 1;
		} catch (error) {
			log.warn(
				{ err: error, repositoryId, issueNumber: issue.number },
				"Reconcile skipped - issue projection failed.",
			);
			return 0;
		}
	});
	return {
		projected: results.reduce<number>((total, value) => total + value, 0),
		total: issues.length,
		error: null,
	};
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
	const scheduleWindow = Math.floor(
		Date.now() / SCHEDULED_RECONCILE_INTERVAL_MS,
	);
	const results = await mapWithConcurrency(
		rows,
		10,
		async ({ repositoryId }) => {
			try {
				const value = await enqueuePullRequestSyncJob({
					repositoryId,
					reason: "scheduled",
					requestId: `scheduled_${scheduleWindow}`,
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
