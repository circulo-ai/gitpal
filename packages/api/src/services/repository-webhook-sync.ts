import {
  enqueueRepositoryWebhookSyncJob,
  type RepositoryWebhookSyncJobData,
  repositoryWebhookSyncJobSchema,
} from "@gitpal/jobs";
import { createLogger } from "@gitpal/logger";
import { syncRepositoryWebhooksForUser } from "./repository-webhooks";

const log = createLogger("repository-webhook-sync");

export type RepositoryWebhookSyncQueueResult = {
  queued: boolean;
  jobId: string | null;
  organizationId: string | null;
  repositoryId: string | null;
  reason: RepositoryWebhookSyncJobData["reason"] | null;
  error: string | null;
};

export async function processRepositoryWebhookSyncJob(
  input: RepositoryWebhookSyncJobData,
) {
  const data = repositoryWebhookSyncJobSchema.parse(input);

  log.info("Processing repository webhook sync job.", {
    userId: data.userId,
    organizationId: data.organizationId ?? null,
    repositoryId: data.repositoryId ?? null,
    reason: data.reason ?? null,
  });

  return syncRepositoryWebhooksForUser({
    userId: data.userId,
    // FIX Issue 4: be explicit — undefined means "all orgs", not null.
    // syncRepositoryWebhooksForUser ignores undefined organizationId (syncs all).
    organizationId: data.organizationId ?? undefined,
    repositoryId: data.repositoryId,
  });
}

export async function queueRepositoryWebhookSyncForUser(
  input: RepositoryWebhookSyncJobData,
): Promise<RepositoryWebhookSyncQueueResult> {
  const data = repositoryWebhookSyncJobSchema.parse(input);

  try {
    const job = await enqueueRepositoryWebhookSyncJob(data);
    return {
      queued: true,
      jobId: typeof job.id === "string" ? job.id : null,
      organizationId: data.organizationId ?? null,
      repositoryId: data.repositoryId ?? null,
      reason: data.reason ?? null,
      error: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "webhook_sync_queue_failed";

    log.warn(
      {
        err: error,
        organizationId: data.organizationId ?? null,
        reason: data.reason ?? null,
        repositoryId: data.repositoryId ?? null,
        userId: data.userId,
      },
      "Repository webhook sync could not be queued.",
    );

    return {
      queued: false,
      jobId: null,
      organizationId: data.organizationId ?? null,
      repositoryId: data.repositoryId ?? null,
      reason: data.reason ?? null,
      error: message,
    };
  }
}
