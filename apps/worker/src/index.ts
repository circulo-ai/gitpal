import { processProviderWebhookReceiptJob } from "@gitpal/api/services/repository-webhooks";
import {
	closeProviderWebhookQueueEvents,
	createProviderWebhookQueueEvents,
	createProviderWebhookWorker,
} from "@gitpal/jobs";
import { createLogger } from "@gitpal/logger";

const log = createLogger("worker");

const queueEventsHandle = createProviderWebhookQueueEvents();
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

async function shutdown(signal: string) {
	log.info({ signal }, "Shutting down worker.");
	await workerHandle.close();
	await closeProviderWebhookQueueEvents(queueEventsHandle);
	log.info("Worker shutdown complete.");
	process.exit(0);
}

process.once("SIGINT", () => {
	void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
	void shutdown("SIGTERM");
});

await Promise.all([
	workerHandle.worker.waitUntilReady(),
	queueEventsHandle.events.waitUntilReady(),
]);

log.info("GitPal worker is ready.");
