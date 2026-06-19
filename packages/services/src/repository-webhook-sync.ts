import {
	enqueueRepositoryWebhookSyncJob,
	type RepositoryWebhookSyncJobData,
	repositoryWebhookSyncJobSchema,
} from "@gitpal/jobs/inngest/functions/repository-webhook-sync";
import { createLogger } from "@gitpal/logger";
import { sendUserNotification } from "./notifications";
import { recordObservabilityEvent } from "./observability";
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

	const result = await syncRepositoryWebhooksForUser({
		userId: data.userId,
		// FIX Issue 4: be explicit — undefined means "all orgs", not null.
		// syncRepositoryWebhooksForUser ignores undefined organizationId (syncs all).
		organizationId: data.organizationId ?? undefined,
		repositoryId: data.repositoryId,
	});

	const failed = result.failed > 0 || result.errors.length > 0;

	await recordObservabilityEvent({
		userId: data.userId,
		organizationId: data.organizationId ?? null,
		repositoryId: data.repositoryId ?? null,
		kind: "job",
		action: "repository-webhook-sync",
		status: failed ? "processed_with_errors" : "completed",
		severity: failed ? "error" : "success",
		title: failed
			? "Repository webhook sync completed with errors"
			: "Repository webhook sync completed",
		body: result.errors.slice(0, 3).join("\n") || null,
		sourceType: "repository-webhook-sync",
		sourceId: data.repositoryId ?? data.organizationId ?? `user:${data.userId}`,
		dedupeKey: [
			"repository-webhook-sync",
			data.userId,
			data.organizationId ?? "all",
			data.repositoryId ?? "all",
			data.reason ?? "sync",
			failed ? "failed" : "completed",
		].join(":"),
		metadata: {
			reason: data.reason ?? null,
			created: result.created,
			existing: result.existing,
			skipped: result.skipped,
			failed: result.failed,
			errors: result.errors,
		},
	});

	if (failed) {
		await sendUserNotification({
			userId: data.userId,
			organizationId: data.organizationId ?? null,
			repositoryId: data.repositoryId ?? null,
			type: "repository_webhook_sync_failed",
			category: "webhook",
			severity: "error",
			title: "Webhook sync needs attention",
			body:
				result.errors[0] ??
				"One or more repository webhooks could not be synced.",
			actionHref: "/observability",
			sourceType: "repository-webhook-sync",
			sourceId: data.repositoryId ?? data.organizationId ?? data.userId,
			dedupeKey: [
				"repository-webhook-sync",
				data.userId,
				data.organizationId ?? "all",
				data.repositoryId ?? "all",
				"notification",
			].join(":"),
			metadata: {
				reason: data.reason ?? null,
				errors: result.errors,
			},
		});
	}

	return result;
}

export async function queueRepositoryWebhookSyncForUser(
	input: RepositoryWebhookSyncJobData,
): Promise<RepositoryWebhookSyncQueueResult> {
	const data = repositoryWebhookSyncJobSchema.parse(input);

	try {
		const job = await enqueueRepositoryWebhookSyncJob(data);
		return {
			queued: true,
			jobId: job.ids?.[0] ?? null,
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
