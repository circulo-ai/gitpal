import { processProviderWebhookReceiptJob } from "@gitpal/api/services/repository-webhooks";
import { createProviderWebhookWorker } from "@gitpal/jobs";
import { createLogger } from "@gitpal/logger";

const log = createLogger("worker");

const workerHandle = createProviderWebhookWorker(async (data, job) => {
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
});

workerHandle.worker.on("completed", (job) => {
	log.info({ jobId: job.id, name: job.name }, "Job completed.");
});

workerHandle.worker.on("failed", (job, error) => {
	log.error({ err: error, jobId: job?.id, name: job?.name }, "Job failed.");
});

workerHandle.worker.on("error", (error) => {
	log.error({ err: error }, "Worker error.");
});

workerHandle.worker.on("stalled", (jobId) => {
	log.warn({ jobId }, "Job stalled and will be retried.");
});

let isShuttingDown = false;

async function shutdown(signal: string) {
	if (isShuttingDown) {
		return;
	}

	isShuttingDown = true;
	log.info({ signal }, "Shutting down worker.");

	try {
		await workerHandle.close();
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
	await workerHandle.worker.waitUntilReady();

	if (!isShuttingDown) {
		workerHandle.start();
		log.info("GitPal worker is ready.");
	}
} catch (error) {
	if (!isShuttingDown) {
		log.error({ err: error }, "Worker failed to start.");
		await shutdown("startup");
		process.exitCode = 1;
	}
}
