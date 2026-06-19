import { env } from "@gitpal/env/server";
import { eventType, NonRetriableError, staticSchema } from "inngest";
import { z } from "zod";
import { buildEventId } from "../../idempotency";
import { inngest } from "../client";

export const providerWebhookJobSchema = z.object({
	receiptId: z.string().min(1),
	providerId: z.string().min(1),
});

export type ProviderWebhookJobData = z.infer<typeof providerWebhookJobSchema>;

export const providerWebhookEvent = eventType("webhook/provider.process", {
	schema: staticSchema<ProviderWebhookJobData>(),
});

export type ProviderWebhookReceiptProcessor = (
	input: ProviderWebhookJobData,
) => Promise<unknown>;

function parseProviderWebhookJob(data: unknown) {
	const result = providerWebhookJobSchema.safeParse(data);
	if (result.success) {
		return result.data;
	}

	throw new NonRetriableError("Invalid webhook/provider.process payload.", {
		cause: result.error,
	});
}

export function createProcessProviderWebhookFunction(
	processProviderWebhookReceiptJob: ProviderWebhookReceiptProcessor,
) {
	return inngest.createFunction(
		{
			id: "process-provider-webhook",
			triggers: [providerWebhookEvent],
			concurrency: Number(env.GITPAL_PROVIDER_WEBHOOK_WORKER_CONCURRENCY ?? 5),
			throttle:
				(env.GITPAL_PROVIDER_WEBHOOK_QUEUE_RATE_LIMIT_MAX ?? 0) > 0
					? {
							limit: env.GITPAL_PROVIDER_WEBHOOK_QUEUE_RATE_LIMIT_MAX,
							period: `${Math.floor(env.GITPAL_PROVIDER_WEBHOOK_QUEUE_RATE_LIMIT_DURATION_MS / 1000)}s`,
						}
					: undefined,
		},
		async ({ event, step }) => {
			const data = parseProviderWebhookJob(event.data);

			await step.run("process-receipt", async () => {
				await processProviderWebhookReceiptJob(data);
			});
		},
	);
}

export async function enqueueProviderWebhookReceiptJob(
	input: ProviderWebhookJobData,
) {
	return inngest.send({
		name: "webhook/provider.process",
		data: input,
		id: buildEventId(["provider-webhook-receipt", input.receiptId]),
	});
}
