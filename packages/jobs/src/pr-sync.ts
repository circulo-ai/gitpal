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

// Default reconcile cadence + worker concurrency. Kept as module constants
// (not env vars) so this file does not depend on env schema changes.
const PULL_REQUEST_SYNC_INTERVAL_MS = 15 * 60_000;
const PULL_REQUEST_SYNC_CONCURRENCY = 3;

export const pullRequestSyncQueueNames = {
	pullRequestSync: "pull-request-sync",
} as const;

export const pullRequestSyncJobNames = {
	// Fans out into one reconcile-repository job per enabled repository.
	dispatchAll: "dispatch-all",
	// Reconciles the pull requests of a single repository.
	reconcileRepository: "reconcile-repository",
} as const;

export const pullRequestSyncJobSchema = z.object({
	// Omit repositoryId for a dispatch-all sweep; set it for a single repo.
	repositoryId: z.string().min(1).optional(),
	reason: z
		.enum(["scheduled", "on-demand", "repository-enabled", "webhook-gap"])
		.optional(),
});

export type PullRequestSyncJobData = z.infer<typeof pullRequestSyncJobSchema>;

type PullRequestSyncJob = Job<PullRequestSyncJobData, void, string>;

type PullRequestSyncWorkerProcessor = (
	data: PullRequestSyncJobData,
	job: PullRequestSyncJob,
) => Promise<void>;

type PullRequestSyncQueueHandle = {
	connection: Redis;
	queue: Queue<PullRequestSyncJobData>;
};

export type PullRequestSyncWorkerHandle = {
	worker: Worker<PullRequestSyncJobData, void>;
	start: () => void;
	close: () => Promise<void>;
};

const log = createLogger("jobs");
let pullRequestSyncQueueHandle: PullRequestSyncQueueHandle | null = null;

function buildPullRequestSyncJobId(data: PullRequestSyncJobData) {
	return buildBullMqJobId([
		"pull-request-sync",
		data.repositoryId ?? "all",
		data.reason ?? "scheduled",
	]);
}

export function getPullRequestSyncQueue() {
	if (pullRequestSyncQueueHandle) {
		return pullRequestSyncQueueHandle.queue;
	}

	const handle = createBullMqQueue<PullRequestSyncJobData>(
		pullRequestSyncQueueNames.pullRequestSync,
	);

	pullRequestSyncQueueHandle = {
		connection: handle.connection,
		queue: handle.queue,
	};

	return handle.queue;
}

export async function closePullRequestSyncQueue() {
	const handle = pullRequestSyncQueueHandle;
	pullRequestSyncQueueHandle = null;
	await closeBullMqQueue(handle);
}

export async function enqueuePullRequestSyncJob(
	input: PullRequestSyncJobData,
	options?: Omit<JobsOptions, "jobId">,
) {
	const data = pullRequestSyncJobSchema.parse(input);
	const queue = getPullRequestSyncQueue();

	const jobName = data.repositoryId
		? pullRequestSyncJobNames.reconcileRepository
		: pullRequestSyncJobNames.dispatchAll;

	return queue.add(jobName, data, {
		...options,
		jobId: buildPullRequestSyncJobId(data),
	});
}

/**
 * Register the periodic reconcile sweep. Enqueues a repeatable `dispatch-all`
 * job; its processor fans out into per-repository reconcile jobs. Call once at
 * worker bootstrap (alongside createPullRequestSyncWorker).
 */
export async function schedulePullRequestSync(options?: { every?: number }) {
	const queue = getPullRequestSyncQueue();
	const every = options?.every ?? PULL_REQUEST_SYNC_INTERVAL_MS;

	return queue.add(
		pullRequestSyncJobNames.dispatchAll,
		{ reason: "scheduled" },
		{
			repeat: { every },
			jobId: buildPullRequestSyncJobId({ reason: "scheduled" }),
			removeOnComplete: true,
			removeOnFail: true,
		},
	);
}

export function createPullRequestSyncWorker(
	processor: PullRequestSyncWorkerProcessor,
	options?: Partial<Pick<WorkerOptions, "concurrency">>,
): PullRequestSyncWorkerHandle {
	const connection = createBullMqWorkerConnection();
	const worker = new Worker<PullRequestSyncJobData, void>(
		pullRequestSyncQueueNames.pullRequestSync,
		async (job) => {
			const data = pullRequestSyncJobSchema.parse(job.data);
			await processor(data, job);
		},
		{
			connection: toBullMqConnection(connection),
			autorun: false,
			concurrency: PULL_REQUEST_SYNC_CONCURRENCY,
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
						"Pull request sync worker stopped unexpectedly.",
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
