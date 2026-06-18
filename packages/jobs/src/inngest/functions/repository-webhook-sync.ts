import { eventType, staticSchema } from "inngest";
import { z } from "zod";
import { inngest } from "../client";
import { processRepositoryWebhookSyncJob } from "@gitpal/api/services/repository-webhook-sync";
import { buildEventId } from "../../idempotency";

export const repositoryWebhookSyncJobSchema = z.object({
	userId: z.string().min(1),
	organizationId: z.string().min(1).optional().nullable(),
	repositoryId: z.string().min(1).optional(),
	reason: z
		.enum([
			"sync",
			"repository-added",
			"repository-enabled",
			"organization-settings-updated",
			"repository-settings-updated",
		])
		.optional(),
});

export type RepositoryWebhookSyncJobData = z.infer<
	typeof repositoryWebhookSyncJobSchema
>;

export const repoWebhookSyncEvent = eventType("repository/webhook-sync.run", {
	schema: staticSchema<RepositoryWebhookSyncJobData>(),
});

export const repositoryWebhookSyncFunction = inngest.createFunction(
	{
		id: "repository-webhook-sync",
		triggers: [repoWebhookSyncEvent],
		concurrency: 1,
	},
	async ({ event, step }) => {
		const data = repositoryWebhookSyncJobSchema.parse(event.data);

		await step.run("sync", async () => {
			await processRepositoryWebhookSyncJob(data);
		});
	},
);

export async function enqueueRepositoryWebhookSyncJob(
	input: RepositoryWebhookSyncJobData,
) {
	return inngest.send({
		name: "repository/webhook-sync.run",
		data: input,
		id: buildEventId([
			"repository-webhook-sync",
			input.userId,
			input.organizationId ?? null,
			input.repositoryId ?? null,
		]),
	});
}