import { randomUUID } from "node:crypto";
import { db } from "@gitpal/db";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import { and, eq } from "drizzle-orm";
import { sanitizeDiagnosticText, sanitizeRunDetails } from "./safe-diagnostics";

export async function startRunStep({
	reviewRunId,
	stepKey,
	position,
	title,
	summary,
	details,
	attempt = 1,
}: {
	reviewRunId: string;
	stepKey: string;
	position: number;
	title: string;
	summary?: string | null;
	details?: Record<string, unknown> | null;
	attempt?: number;
}) {
	const now = new Date();
	const [row] = await db
		.insert(dashboardSchema.reviewRunStep)
		.values({
			id: `run_step_${randomUUID()}`,
			reviewRunId,
			stepKey,
			position,
			attempt,
			status: "running",
			title,
			summary: summary ? sanitizeDiagnosticText(summary) : null,
			details: sanitizeRunDetails(details),
			startedAt: now,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [
				dashboardSchema.reviewRunStep.reviewRunId,
				dashboardSchema.reviewRunStep.stepKey,
				dashboardSchema.reviewRunStep.attempt,
			],
			set: {
				status: "running",
				summary: summary ? sanitizeDiagnosticText(summary) : null,
				details: sanitizeRunDetails(details),
				startedAt: now,
				completedAt: null,
				durationMs: null,
				updatedAt: now,
			},
		})
		.returning();
	return row;
}

export async function finishRunStep({
	reviewRunId,
	stepKey,
	status = "completed",
	summary,
	details,
	errorCode,
	attempt = 1,
}: {
	reviewRunId: string;
	stepKey: string;
	status?: "completed" | "failed" | "skipped";
	summary?: string | null;
	details?: Record<string, unknown> | null;
	errorCode?: string | null;
	attempt?: number;
}) {
	const now = new Date();
	const [existing] = await db
		.select()
		.from(dashboardSchema.reviewRunStep)
		.where(
			and(
				eq(dashboardSchema.reviewRunStep.reviewRunId, reviewRunId),
				eq(dashboardSchema.reviewRunStep.stepKey, stepKey),
				eq(dashboardSchema.reviewRunStep.attempt, attempt),
			),
		)
		.limit(1);
	if (!existing) return null;
	const [row] = await db
		.update(dashboardSchema.reviewRunStep)
		.set({
			status,
			summary: summary ? sanitizeDiagnosticText(summary) : existing.summary,
			details: details ? sanitizeRunDetails(details) : existing.details,
			errorCode: errorCode ?? null,
			completedAt: now,
			durationMs: existing.startedAt
				? Math.max(0, now.getTime() - existing.startedAt.getTime())
				: null,
			updatedAt: now,
		})
		.where(eq(dashboardSchema.reviewRunStep.id, existing.id))
		.returning();
	return row ?? null;
}

export async function recordCompletedRunStep(
	input: Parameters<typeof startRunStep>[0],
) {
	await startRunStep(input);
	return finishRunStep({
		reviewRunId: input.reviewRunId,
		stepKey: input.stepKey,
		summary: input.summary,
		details: input.details,
		attempt: input.attempt,
	});
}
