import {
	enqueueRepositoryWebhookSyncJob,
	type RepositoryWebhookSyncJobData,
	repositoryWebhookSyncJobSchema,
} from "@gitpal/jobs/inngest/functions/repository-webhook-sync";
import { createLogger } from "@gitpal/logger";
import {
	archiveNotificationByDedupeKeyForUser,
	sendUserNotification,
} from "./notifications";
import { recordObservabilityEvent } from "./observability";
import { getRepositoryWebhookSyncFailureNotificationKey } from "./repository-webhook-sync-notifications";
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
	const failureNotificationKey =
		getRepositoryWebhookSyncFailureNotificationKey(data);

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
			dedupeKey: failureNotificationKey,
			metadata: {
				reason: data.reason ?? null,
				errors: result.errors,
			},
		});
	} else {
		const resolved = await archiveNotificationByDedupeKeyForUser({
			userId: data.userId,
			dedupeKey: failureNotificationKey,
		});
		if (resolved.updated > 0) {
			await sendUserNotification({
				userId: data.userId,
				organizationId: data.organizationId ?? null,
				repositoryId: data.repositoryId ?? null,
				type: "repository_webhook_sync_recovered",
				category: "webhook",
				severity: "success",
				title: "Webhook sync recovered",
				body: "The repository webhook is configured and the previous sync error has been resolved.",
				actionHref: "/repositories",
				sourceType: "repository-webhook-sync",
				sourceId: data.repositoryId ?? data.organizationId ?? data.userId,
				dedupeKey: `${failureNotificationKey}:recovered`,
				metadata: {
					reason: data.reason ?? null,
					created: result.created,
					existing: result.existing,
				},
			});
		}
	}

	return result;
}

export async function queueRepositoryWebhookSyncForUser(
	input: RepositoryWebhookSyncJobData,
): Promise<RepositoryWebhookSyncQueueResult> {
	const data = repositoryWebhookSyncJobSchema.parse(input);

	try {
		const job = await enqueueRepositoryWebhookSyncJob({
			...data,
			requestId: data.requestId ?? randomUUID(),
		});
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

import { randomUUID } from "node:crypto";
