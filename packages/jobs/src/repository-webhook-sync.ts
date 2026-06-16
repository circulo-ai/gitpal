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

export const repositoryWebhookSyncQueueNames = {
	repositoryWebhookSync: "repository-webhook-sync",
} as const;

export const repositoryWebhookSyncJobNames = {
	sync: "sync",
} as const;

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

type RepositoryWebhookSyncJob = Job<RepositoryWebhookSyncJobData, void, string>;

type RepositoryWebhookSyncWorkerProcessor = (
	data: RepositoryWebhookSyncJobData,
	job: RepositoryWebhookSyncJob,
) => Promise<void>;

type RepositoryWebhookSyncQueueHandle = {
	connection: Redis;
	queue: Queue<RepositoryWebhookSyncJobData>;
};

export type RepositoryWebhookSyncWorkerHandle = {
	worker: Worker<RepositoryWebhookSyncJobData, void>;
	start: () => void;
	close: () => Promise<void>;
};

const log = createLogger("jobs");
let repositoryWebhookSyncQueueHandle: RepositoryWebhookSyncQueueHandle | null =
	null;

function buildRepositoryWebhookSyncJobId(data: RepositoryWebhookSyncJobData) {
	return buildBullMqJobId([
		"repository-webhook-sync",
		data.userId,
		data.organizationId ?? null,
		data.repositoryId ?? null,
	]);
}

export function getRepositoryWebhookSyncQueue() {
	if (repositoryWebhookSyncQueueHandle) {
		return repositoryWebhookSyncQueueHandle.queue;
	}

	const handle = createBullMqQueue<RepositoryWebhookSyncJobData>(
		repositoryWebhookSyncQueueNames.repositoryWebhookSync,
	);

	repositoryWebhookSyncQueueHandle = {
		connection: handle.connection,
		queue: handle.queue,
	};

	return handle.queue;
}

export async function closeRepositoryWebhookSyncQueue() {
	const handle = repositoryWebhookSyncQueueHandle;
	repositoryWebhookSyncQueueHandle = null;
	await closeBullMqQueue(handle);
}

export async function enqueueRepositoryWebhookSyncJob(
	input: RepositoryWebhookSyncJobData,
	options?: Omit<JobsOptions, "jobId">,
) {
	const data = repositoryWebhookSyncJobSchema.parse(input);
	const queue = getRepositoryWebhookSyncQueue();

	return queue.add(repositoryWebhookSyncJobNames.sync, data, {
		...options,
		jobId: buildRepositoryWebhookSyncJobId(data),
	});
}

export function createRepositoryWebhookSyncWorker(
	processor: RepositoryWebhookSyncWorkerProcessor,
	options?: Partial<Pick<WorkerOptions, "concurrency">>,
): RepositoryWebhookSyncWorkerHandle {
	const connection = createBullMqWorkerConnection();
	const worker = new Worker<RepositoryWebhookSyncJobData, void>(
		repositoryWebhookSyncQueueNames.repositoryWebhookSync,
		async (job) => {
			const data = repositoryWebhookSyncJobSchema.parse(job.data);
			await processor(data, job);
		},
		{
			connection: toBullMqConnection(connection),
			autorun: false,
			concurrency: 1,
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
						"Repository webhook sync worker stopped unexpectedly.",
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
