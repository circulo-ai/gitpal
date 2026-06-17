import { env } from "@gitpal/env/server";
import { createLogger } from "@gitpal/logger";
import { closeRedis, type Redis } from "@gitpal/redis";
import {
	type Job,
	type JobsOptions,
	type Queue,
	Worker,
	type WorkerOptions,
} from "bullmq";
import { z } from "zod";
import {
	buildBullMqJobId,
	closeBullMqQueue,
	createBullMqQueue,
	createBullMqWorkerConnection,
	toBullMqConnection,
} from "./bullmq";

export const providerWebhookQueueNames = {
	providerWebhooks: "provider-webhooks",
} as const;

export const providerWebhookJobNames = {
	processReceipt: "process-receipt",
} as const;

export const providerWebhookJobSchema = z.object({
	receiptId: z.string().min(1),
	providerId: z.string().min(1),
});

export type ProviderWebhookJobData = z.infer<typeof providerWebhookJobSchema>;

type ProviderWebhookJob = Job<ProviderWebhookJobData, void, string>;

type ProviderWebhookWorkerProcessor = (
	data: ProviderWebhookJobData,
	job: ProviderWebhookJob,
) => Promise<void>;

type ProviderWebhookQueueHandle = {
	connection: Redis;
	queue: Queue<ProviderWebhookJobData>;
};

export type ProviderWebhookWorkerHandle = {
	worker: Worker<ProviderWebhookJobData, void>;
	start: () => void;
	close: () => Promise<void>;
};

const log = createLogger("jobs");
let providerWebhookQueueHandle: ProviderWebhookQueueHandle | null = null;

function buildProviderWebhookJobId(data: ProviderWebhookJobData) {
	return buildBullMqJobId(["provider-webhook-receipt", data.receiptId]);
}

export function getProviderWebhookQueue() {
	if (providerWebhookQueueHandle) {
		return providerWebhookQueueHandle.queue;
	}

	const handle = createBullMqQueue<ProviderWebhookJobData>(
		providerWebhookQueueNames.providerWebhooks,
	);

	providerWebhookQueueHandle = {
		connection: handle.connection,
		queue: handle.queue,
	};

	return handle.queue;
}

export async function closeProviderWebhookQueue() {
	const handle = providerWebhookQueueHandle;
	providerWebhookQueueHandle = null;
	await closeBullMqQueue(handle);
}

export async function enqueueProviderWebhookReceiptJob(
	input: ProviderWebhookJobData,
	options?: Omit<JobsOptions, "jobId">,
) {
	const data = providerWebhookJobSchema.parse(input);
	const queue = getProviderWebhookQueue();

	return queue.add(providerWebhookJobNames.processReceipt, data, {
		...options,
		jobId: buildProviderWebhookJobId(data),
	});
}

export function createProviderWebhookWorker(
	processor: ProviderWebhookWorkerProcessor,
	options?: Partial<Pick<WorkerOptions, "concurrency">>,
): ProviderWebhookWorkerHandle {
	const connection = createBullMqWorkerConnection();
	const limiter =
		env.GITPAL_PROVIDER_WEBHOOK_QUEUE_RATE_LIMIT_MAX > 0
			? {
					max: env.GITPAL_PROVIDER_WEBHOOK_QUEUE_RATE_LIMIT_MAX,
					duration: env.GITPAL_PROVIDER_WEBHOOK_QUEUE_RATE_LIMIT_DURATION_MS,
				}
			: undefined;
	const worker = new Worker<ProviderWebhookJobData, void>(
		providerWebhookQueueNames.providerWebhooks,
		async (job) => {
			const data = providerWebhookJobSchema.parse(job.data);
			await processor(data, job);
		},
		{
			connection: toBullMqConnection(connection),
			autorun: false,
			concurrency: env.GITPAL_PROVIDER_WEBHOOK_WORKER_CONCURRENCY ?? 5,
			limiter,
			prefix: env.GITPAL_QUEUE_PREFIX,
			...options,
		},
	);

	let runPromise: Promise<void> | null = null;
	let isClosing = false;

	return {
		worker,
		start: () => {
			if (runPromise || isClosing) {
				return;
			}

			runPromise = Promise.resolve(worker.run()).catch((error) => {
				if (!isClosing) {
					log.error(
						{ err: error },
						"Provider webhook worker stopped unexpectedly.",
					);
				}
			});
		},
		close: async () => {
			isClosing = true;
			try {
				await worker.close();
			} finally {
				await closeRedis(connection);
			}

			if (runPromise) {
				await runPromise;
			}
		},
	};
}
