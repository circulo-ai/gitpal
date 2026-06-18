import { eventType, staticSchema } from "inngest";
import { z } from "zod";
import { inngest } from "../client";
import { buildEventId } from "../../idempotency";
import {
  dispatchPullRequestReconcile,
  reconcilePullRequestsForRepository,
} from "@gitpal/api/services/pr-reconcile";

const PULL_REQUEST_SYNC_CONCURRENCY = 3;

export const pullRequestSyncJobSchema = z.object({
  repositoryId: z.string().min(1).optional(),
  reason: z
    .enum(["scheduled", "on-demand", "repository-enabled", "webhook-gap"])
    .optional(),
});

export type PullRequestSyncJobData = z.infer<typeof pullRequestSyncJobSchema>;

export const prSyncDispatchEvent = eventType("pull-request/sync.dispatch", {
  schema: staticSchema<PullRequestSyncJobData>(),
});

export const pullRequestSyncFunction = inngest.createFunction(
  {
    id: "pull-request-sync",
    triggers: [
      { cron: "*/15 * * * *" }, // Replaces scheduled sweep
      prSyncDispatchEvent,
    ],
    concurrency: PULL_REQUEST_SYNC_CONCURRENCY,
  },
  async ({ event, step }) => {
    const data = event.data ?? { reason: "scheduled" };

    if ("repositoryId" in data && data.repositoryId) {
      await step.run("reconcile-repository", async () => {
        if (data.repositoryId) {
          await reconcilePullRequestsForRepository({
            repositoryId: data.repositoryId,
          });
        }
      });
    } else {
      await step.run("dispatch-all", async () => {
        // This function iterates the DB and calls enqueuePullRequestSyncJob
        // automatically distributing the individual repository jobs into Inngest.
        await dispatchPullRequestReconcile();
      });
    }
  },
);

export async function enqueuePullRequestSyncJob(input: PullRequestSyncJobData) {
  return inngest.send({
    name: "pull-request/sync.dispatch",
    data: input,
    id: buildEventId([
      "pull-request-sync",
      input.repositoryId ?? "all",
      input.reason ?? "scheduled",
    ]),
  });
}
