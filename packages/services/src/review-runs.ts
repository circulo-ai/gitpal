import { runTransactionWithRetry } from "@gitpal/db";
import { createRepositories } from "@gitpal/repositories";
import { sanitizeDiagnosticText } from "./safe-diagnostics";

const QUEUED_RUN_TIMEOUT_MS = 30 * 60 * 1_000;
const RUNNING_RUN_TIMEOUT_MS = 2 * 60 * 60 * 1_000;

export async function failActiveReviewRun({
	runId,
	reason,
	errorMessage,
}: {
	runId: string;
	reason: string;
	errorMessage?: string | null;
}) {
	const now = new Date();
	const safeError = errorMessage
		? sanitizeDiagnosticText(errorMessage).slice(0, 2_000)
		: null;

	return runTransactionWithRetry(async (tx) => {
		const txRepos = createRepositories(tx);
		const run = await txRepos.reviewRun.failActiveRun(
			runId,
			now,
			reason,
			safeError,
		);

		if (run) {
			await txRepos.reviewRunStep.failRunningSteps([run.id], now, reason);
		}
		return Boolean(run);
	});
}

export async function expireStaleReviewRuns() {
	const now = new Date();
	const queuedBefore = new Date(now.getTime() - QUEUED_RUN_TIMEOUT_MS);
	const runningBefore = new Date(now.getTime() - RUNNING_RUN_TIMEOUT_MS);

	return runTransactionWithRetry(async (tx) => {
		const txRepos = createRepositories(tx);
		const queued = await txRepos.reviewRun.expireQueuedRuns(now, queuedBefore);
		const running = await txRepos.reviewRun.expireRunningRuns(
			now,
			runningBefore,
		);

		await txRepos.reviewRunStep.failRunningSteps(
			queued.map((run) => run.id),
			now,
			"worker_start_timeout",
		);
		await txRepos.reviewRunStep.failRunningSteps(
			running.map((run) => run.id),
			now,
			"worker_finish_timeout",
		);

		return { queued: queued.length, running: running.length };
	});
}
