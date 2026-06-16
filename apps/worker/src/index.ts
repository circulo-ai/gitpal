import { processRepositoryWebhookSyncJob } from "@gitpal/api/services/repository-webhook-sync";
import { processProviderWebhookReceiptJob } from "@gitpal/api/services/repository-webhooks";
import {
	createProviderWebhookWorker,
	createRepositoryWebhookSyncWorker,
	type ProviderWebhookWorkerHandle,
	type RepositoryWebhookSyncWorkerHandle,
} from "@gitpal/jobs";
import { createLogger } from "@gitpal/logger";

const log = createLogger("worker");

type WorkerInstance =
	| ProviderWebhookWorkerHandle["worker"]
	| RepositoryWebhookSyncWorkerHandle["worker"];

function registerWorkerListeners(worker: WorkerInstance, label: string) {
	worker.on("completed", (job) => {
		log.info({ jobId: job.id, name: job.name, label }, "Job completed.");
	});

	worker.on("failed", (job, error) => {
		log.error(
			{ err: error, jobId: job?.id, name: job?.name, label },
			"Job failed.",
		);
	});

	worker.on("error", (error) => {
		log.error({ err: error, label }, "Worker error.");
	});

	worker.on("stalled", (jobId) => {
		log.warn({ jobId, label }, "Job stalled and will be retried.");
	});
}

const workerHandles = [
	{
		label: "provider webhook receipt",
		handle: createProviderWebhookWorker(async (data, job) => {
			log.info(
				{
					jobId: job.id,
					providerId: data.providerId,
					receiptId: data.receiptId,
					attempt: job.attemptsMade + 1,
				},
				"Processing provider webhook receipt.",
			);

			await processProviderWebhookReceiptJob(data);
		}),
	},
	{
		label: "repository webhook sync",
		handle: createRepositoryWebhookSyncWorker(async (data, job) => {
			log.info(
				{
					jobId: job.id,
					organizationId: data.organizationId ?? null,
					repositoryId: data.repositoryId ?? null,
					reason: data.reason ?? null,
					attempt: job.attemptsMade + 1,
				},
				"Processing repository webhook sync.",
			);

			await processRepositoryWebhookSyncJob(data);
		}),
	},
];

for (const { handle, label } of workerHandles) {
	registerWorkerListeners(handle.worker, label);
}

let isShuttingDown = false;

async function shutdown(signal: string) {
	if (isShuttingDown) {
		return;
	}

	isShuttingDown = true;
	log.info({ signal }, "Shutting down workers.");

	try {
		await Promise.all(workerHandles.map(({ handle }) => handle.close()));
		log.info("Worker shutdown complete.");
	} catch (error) {
		log.error({ err: error, signal }, "Worker shutdown failed.");
		process.exitCode = 1;
	}
}

process.once("SIGINT", () => {
	void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
	void shutdown("SIGTERM");
});

try {
	await Promise.all(
		workerHandles.map(({ handle }) => handle.worker.waitUntilReady()),
	);

	if (!isShuttingDown) {
		for (const { handle } of workerHandles) {
			handle.start();
		}

		log.info("GitPal workers are ready.");
	}
} catch (error) {
	if (!isShuttingDown) {
		log.error({ err: error }, "Worker failed to start.");
		await shutdown("startup");
		process.exitCode = 1;
	}
}
