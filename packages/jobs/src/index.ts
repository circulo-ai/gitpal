import { env } from "@gitpal/env/server";
import { createLogger } from "@gitpal/logger";
import { closeRedis, createRedis, type Redis } from "@gitpal/redis";
import {
	type ConnectionOptions,
	type Job,
	type JobsOptions,
	Queue,
	QueueEvents,
	Worker,
	type WorkerOptions,
} from "bullmq";
import { z } from "zod";

export const queueNames = {
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

type QueueHandle = {
	connection: Redis;
	queue: Queue<ProviderWebhookJobData>;
};

type QueueEventsHandle = {
	connection: Redis;
	events: QueueEvents;
};

const log = createLogger("jobs");
let providerWebhookQueueHandle: QueueHandle | null = null;

function createProducerConnection() {
	return createRedis({
		maxRetriesPerRequest: env.GITPAL_QUEUE_PRODUCER_MAX_RETRIES_PER_REQUEST,
	});
}

function createWorkerConnection() {
	return createRedis({
		maxRetriesPerRequest: null,
	});
}

function toBullMqConnection(connection: Redis): ConnectionOptions {
	return connection as unknown as ConnectionOptions;
}

function getDefaultJobOptions(): JobsOptions {
	return {
		attempts: env.GITPAL_QUEUE_JOB_ATTEMPTS,
		backoff: {
			type: "exponential",
			delay: env.GITPAL_QUEUE_JOB_BACKOFF_MS,
			jitter: 0.2,
		},
		removeOnComplete: env.GITPAL_QUEUE_REMOVE_ON_COMPLETE,
		removeOnFail: env.GITPAL_QUEUE_REMOVE_ON_FAIL,
	};
}

function getProviderWebhookJobId(data: ProviderWebhookJobData) {
	return `provider-webhook:${data.providerId}:${data.receiptId}`;
}

export function getProviderWebhookQueue() {
	if (providerWebhookQueueHandle) {
		return providerWebhookQueueHandle.queue;
	}

	const connection = createProducerConnection();
	const queue = new Queue<ProviderWebhookJobData>(queueNames.providerWebhooks, {
		connection: toBullMqConnection(connection),
		defaultJobOptions: getDefaultJobOptions(),
		prefix: env.GITPAL_QUEUE_PREFIX,
	});

	providerWebhookQueueHandle = {
		connection,
		queue,
	};

	return queue;
}

export async function closeProviderWebhookQueue() {
	if (!providerWebhookQueueHandle) {
		return;
	}

	const handle = providerWebhookQueueHandle;
	providerWebhookQueueHandle = null;
	await handle.queue.close();
	await closeRedis(handle.connection);
}

export async function enqueueProviderWebhookReceiptJob(
	input: ProviderWebhookJobData,
	options?: JobsOptions,
) {
	const data = providerWebhookJobSchema.parse(input);
	const queue = getProviderWebhookQueue();

	return queue.add(providerWebhookJobNames.processReceipt, data, {
		...options,
		jobId: getProviderWebhookJobId(data),
	});
}

export function createProviderWebhookWorker(
	processor: ProviderWebhookWorkerProcessor,
	options?: Pick<WorkerOptions, "autorun" | "concurrency">,
) {
	const connection = createWorkerConnection();
	const limiter =
		env.GITPAL_PROVIDER_WEBHOOK_QUEUE_RATE_LIMIT_MAX > 0
			? {
					max: env.GITPAL_PROVIDER_WEBHOOK_QUEUE_RATE_LIMIT_MAX,
					duration: env.GITPAL_PROVIDER_WEBHOOK_QUEUE_RATE_LIMIT_DURATION_MS,
				}
			: undefined;
	const worker = new Worker<ProviderWebhookJobData, void>(
		queueNames.providerWebhooks,
		async (job) => {
			const data = providerWebhookJobSchema.parse(job.data);
			await processor(data, job);
		},
		{
			connection: toBullMqConnection(connection),
			concurrency: env.GITPAL_PROVIDER_WEBHOOK_WORKER_CONCURRENCY,
			limiter,
			prefix: env.GITPAL_QUEUE_PREFIX,
			...options,
		},
	);

	return {
		worker,
		close: async () => {
			await worker.close();
			await closeRedis(connection);
		},
	};
}

export function createProviderWebhookQueueEvents(): QueueEventsHandle {
	const connection = createWorkerConnection();
	const events = new QueueEvents(queueNames.providerWebhooks, {
		connection: toBullMqConnection(connection),
		prefix: env.GITPAL_QUEUE_PREFIX,
	});

	events.on("error", (error) => {
		log.error({ err: error }, "Provider webhook queue events failed.");
	});

	return {
		connection,
		events,
	};
}

export async function closeProviderWebhookQueueEvents(
	handle: QueueEventsHandle,
) {
	await handle.events.close();
	await closeRedis(handle.connection);
}
