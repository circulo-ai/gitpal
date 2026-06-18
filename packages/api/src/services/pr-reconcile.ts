import { createDb } from "@gitpal/db";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import type { GitPullRequest } from "@gitpal/git";
import { enqueuePullRequestSyncJob } from "@gitpal/jobs";
import { createLogger } from "@gitpal/logger";
import { and, eq } from "drizzle-orm";
import { getAutomationActorForRepository } from "./git-provider-access";
import { projectPullRequestSnapshot } from "./pr-projection";

const db = createDb();
const log = createLogger("pull-request-reconcile");

/**
 * Reconcile a single repository's pull requests against the provider.
 *
 * Strategy (bounded API usage):
 *  1. List the provider's OPEN PRs and project each — discovers new PRs and
 *     refreshes still-open ones.
 *  2. For PRs we still hold as `open` locally but the provider no longer lists
 *     as open, fetch each individually — these merged/closed while a webhook
 *     was missed.
 *
 * This refreshes mergedAt / closedAt / state / draft / approval-independent
 * lifecycle fields. It does NOT touch firstHumanReviewAt / lastHumanReviewAt —
 * provider APIs do not expose historical review timestamps, so those are owned
 * by the real-time webhook path only.
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

  let openPullRequests: GitPullRequest[];
  try {
    openPullRequests = await automationActor.adapter.listPullRequests({
      repositoryPath: repository.repositoryPath,
      state: "open",
    });
  } catch (error) {
    log.warn(
      { err: error, repositoryId },
      "Reconcile failed — listPullRequests error.",
    );
    return { projected: 0 };
  }

  let projected = 0;
  const seenNumbers = new Set<number>();
  for (const pullRequest of openPullRequests) {
    await projectPullRequestSnapshot({
      repositoryId: repository.id,
      pullRequest,
    });
    seenNumbers.add(pullRequest.number);
    projected += 1;
  }

  // Heal PRs still marked `open` locally but absent from the provider's open
  // list — they merged/closed while a webhook was missed.
  const localOpen = await db
    .select({ number: dashboardSchema.pullRequest.number })
    .from(dashboardSchema.pullRequest)
    .where(
      and(
        eq(dashboardSchema.pullRequest.repositoryId, repository.id),
        eq(dashboardSchema.pullRequest.state, "open"),
      ),
    );
  for (const { number } of localOpen) {
    if (seenNumbers.has(number)) {
      continue;
    }
    try {
      const pullRequest = await automationActor.adapter.getPullRequest({
        repositoryPath: repository.repositoryPath,
        pullRequestNumber: number,
      });
      await projectPullRequestSnapshot({
        repositoryId: repository.id,
        pullRequest,
      });
      projected += 1;
    } catch (error) {
      log.warn(
        { err: error, repositoryId, pullRequestNumber: number },
        "Reconcile failed — getPullRequest error for stale open PR.",
      );
    }
  }

  log.info({ repositoryId, projected }, "Pull request reconcile complete.");
  return { projected };
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
  for (const { repositoryId } of rows) {
    await enqueuePullRequestSyncJob({ repositoryId, reason: "scheduled" });
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
