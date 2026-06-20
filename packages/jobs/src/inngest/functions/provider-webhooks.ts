import { env } from "@gitpal/env/server";
import { eventType, NonRetriableError, staticSchema } from "inngest";
import { z } from "zod";
import { buildEventId } from "../../idempotency";
import { inngest } from "../client";
import { readIntegerConfig, secondsConfig } from "../config";

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
export type ProviderWebhookFailureProcessor = (
	input: ProviderWebhookJobData & { errorMessage: string },
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
	processProviderWebhookFailure: ProviderWebhookFailureProcessor,
) {
	return inngest.createFunction(
		{
			id: "process-provider-webhook",
			triggers: [providerWebhookEvent],
			retries: 3,
			concurrency: readIntegerConfig(
				env.GITPAL_PROVIDER_WEBHOOK_WORKER_CONCURRENCY,
				"GITPAL_PROVIDER_WEBHOOK_WORKER_CONCURRENCY",
			),
			throttle:
				readIntegerConfig(
					env.GITPAL_PROVIDER_WEBHOOK_QUEUE_RATE_LIMIT_MAX,
					"GITPAL_PROVIDER_WEBHOOK_QUEUE_RATE_LIMIT_MAX",
					0,
				) > 0
					? {
							limit: readIntegerConfig(
								env.GITPAL_PROVIDER_WEBHOOK_QUEUE_RATE_LIMIT_MAX,
								"GITPAL_PROVIDER_WEBHOOK_QUEUE_RATE_LIMIT_MAX",
							),
							period: secondsConfig(
								Math.floor(
									Number(
										env.GITPAL_PROVIDER_WEBHOOK_QUEUE_RATE_LIMIT_DURATION_MS,
									) / 1000,
								),
								"GITPAL_PROVIDER_WEBHOOK_QUEUE_RATE_LIMIT_DURATION_MS",
							),
						}
					: undefined,
			timeouts: { start: "5m", finish: "15m" },
			onFailure: async ({ event, error, step }) => {
				const data = parseProviderWebhookJob(event.data.event.data);
				await step.run("finalize-failed-receipt", () =>
					processProviderWebhookFailure({
						...data,
						errorMessage: error.message,
					}),
				);
			},
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
