import { env } from "@gitpal/env/server";
import { createLogger } from "@gitpal/logger";
import { closeRedis, createRedis, type Redis } from "@gitpal/redis";
import {
	type ConnectionOptions,
	type Job,
	type JobsOptions,
	Queue,
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

function buildProviderWebhookJobId(data: ProviderWebhookJobData) {
	return data.receiptId;
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
	try {
		await handle.queue.close();
	} finally {
		await closeRedis(handle.connection);
	}
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
			autorun: false,
			concurrency: env.GITPAL_PROVIDER_WEBHOOK_WORKER_CONCURRENCY,
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
