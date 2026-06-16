import { createHash } from "node:crypto";
import { env } from "@gitpal/env/server";
import { closeRedis, createRedis, type Redis } from "@gitpal/redis";
import { type ConnectionOptions, type JobsOptions, Queue } from "bullmq";

export type BullMqQueueHandle<TData> = {
	connection: Redis;
	queue: Queue<TData>;
};

export function createBullMqProducerConnection() {
	return createRedis({
		maxRetriesPerRequest: env.GITPAL_QUEUE_PRODUCER_MAX_RETRIES_PER_REQUEST,
	});
}

export function createBullMqWorkerConnection() {
	return createRedis({
		maxRetriesPerRequest: null,
	});
}

export function toBullMqConnection(connection: Redis): ConnectionOptions {
	return connection as unknown as ConnectionOptions;
}

export function getBullMqDefaultJobOptions(): JobsOptions {
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

export function buildBullMqJobId(
	parts: Array<string | number | boolean | null | undefined>,
) {
	return `job_${createHash("sha256")
		.update(JSON.stringify(parts))
		.digest("hex")}`;
}

export function createBullMqQueue<TData>(queueName: string) {
	const connection = createBullMqProducerConnection();
	const queue = new Queue<TData>(queueName, {
		connection: toBullMqConnection(connection),
		defaultJobOptions: getBullMqDefaultJobOptions(),
		prefix: env.GITPAL_QUEUE_PREFIX,
	});

	return {
		connection,
		queue,
	} satisfies BullMqQueueHandle<TData>;
}

export async function closeBullMqQueue<TData>(
	handle: BullMqQueueHandle<TData> | null,
) {
	if (!handle) {
		return;
	}

	try {
		await handle.queue.close();
	} finally {
		await closeRedis(handle.connection);
	}
}
