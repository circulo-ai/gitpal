import { db } from "@gitpal/db";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import { and, eq, inArray, lt } from "drizzle-orm";
import { sanitizeDiagnosticText } from "./safe-diagnostics";

const ACTIVE_RUN_STATUSES = ["queued", "running"];
const QUEUED_RUN_TIMEOUT_MS = 30 * 60 * 1_000;
const RUNNING_RUN_TIMEOUT_MS = 2 * 60 * 60 * 1_000;

async function failRunningSteps(
	executor: Parameters<Parameters<typeof db.transaction>[0]>[0],
	runIds: string[],
	now: Date,
	errorCode: string,
) {
	if (runIds.length === 0) return;
	await executor
		.update(dashboardSchema.reviewRunStep)
		.set({
			status: "failed",
			errorCode,
			completedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				inArray(dashboardSchema.reviewRunStep.reviewRunId, runIds),
				eq(dashboardSchema.reviewRunStep.status, "running"),
			),
		);
}

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

	return db.transaction(async (tx) => {
		const [run] = await tx
			.update(dashboardSchema.reviewRun)
			.set({
				status: "failed",
				result: { reason, ...(safeError ? { error: safeError } : {}) },
				completedAt: now,
				updatedAt: now,
			})
			.where(
				and(
					eq(dashboardSchema.reviewRun.id, runId),
					inArray(dashboardSchema.reviewRun.status, ACTIVE_RUN_STATUSES),
				),
			)
			.returning({ id: dashboardSchema.reviewRun.id });

		if (run) {
			await failRunningSteps(tx, [run.id], now, reason);
		}
		return Boolean(run);
	});
}

export async function expireStaleReviewRuns() {
	const now = new Date();
	const queuedBefore = new Date(now.getTime() - QUEUED_RUN_TIMEOUT_MS);
	const runningBefore = new Date(now.getTime() - RUNNING_RUN_TIMEOUT_MS);

	return db.transaction(async (tx) => {
		const queued = await tx
			.update(dashboardSchema.reviewRun)
			.set({
				status: "failed",
				result: { reason: "worker_start_timeout" },
				completedAt: now,
				updatedAt: now,
			})
			.where(
				and(
					eq(dashboardSchema.reviewRun.status, "queued"),
					lt(dashboardSchema.reviewRun.createdAt, queuedBefore),
				),
			)
			.returning({ id: dashboardSchema.reviewRun.id });
		const running = await tx
			.update(dashboardSchema.reviewRun)
			.set({
				status: "failed",
				result: { reason: "worker_finish_timeout" },
				completedAt: now,
				updatedAt: now,
			})
			.where(
				and(
					eq(dashboardSchema.reviewRun.status, "running"),
					lt(dashboardSchema.reviewRun.startedAt, runningBefore),
				),
			)
			.returning({ id: dashboardSchema.reviewRun.id });

		await failRunningSteps(
			tx,
			queued.map((run) => run.id),
			now,
			"worker_start_timeout",
		);
		await failRunningSteps(
			tx,
			running.map((run) => run.id),
			now,
			"worker_finish_timeout",
		);

		return { queued: queued.length, running: running.length };
	});
}
