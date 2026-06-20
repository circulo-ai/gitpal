import { randomUUID } from "node:crypto";
import { db } from "@gitpal/db";
import * as observabilitySchema from "@gitpal/db/schema/observability";
import { eq } from "drizzle-orm";
import { sanitizeDiagnosticText, sanitizeRunDetails } from "./safe-diagnostics";

type ObservabilityDbExecutor = Pick<typeof db, "insert" | "update">;

export type ObservabilityEventKind =
	| "ai"
	| "billing"
	| "job"
	| "notification"
	| "review"
	| "tool"
	| "webhook";

export type ObservabilityEventSeverity =
	| "info"
	| "success"
	| "warning"
	| "error";

export type RecordObservabilityEventInput = {
	userId: string;
	organizationId?: string | null;
	repositoryId?: string | null;
	pullRequestId?: string | null;
	issueId?: string | null;
	reviewRunId?: string | null;
	traceId?: string | null;
	parentEventId?: string | null;
	kind: ObservabilityEventKind;
	action: string;
	status: string;
	severity?: ObservabilityEventSeverity;
	title: string;
	body?: string | null;
	sourceType?: string | null;
	sourceId?: string | null;
	dedupeKey?: string | null;
	durationMs?: number | null;
	costCents?: number | null;
	metadata?: Record<string, unknown> | null;
	occurredAt?: Date;
};

function eventId() {
	return `obs_${randomUUID()}`;
}

export async function recordObservabilityEvent(
	input: RecordObservabilityEventInput,
	executor: ObservabilityDbExecutor = db,
) {
	const now = input.occurredAt ?? new Date();
	const id = eventId();
	const values = {
		id,
		userId: input.userId,
		organizationId: input.organizationId ?? null,
		repositoryId: input.repositoryId ?? null,
		pullRequestId: input.pullRequestId ?? null,
		issueId: input.issueId ?? null,
		reviewRunId: input.reviewRunId ?? null,
		traceId: input.traceId ?? null,
		parentEventId: input.parentEventId ?? null,
		kind: input.kind,
		action: input.action,
		status: input.status,
		severity: input.severity ?? "info",
		title: sanitizeDiagnosticText(input.title).slice(0, 500),
		body: input.body ? sanitizeDiagnosticText(input.body) : null,
		sourceType: input.sourceType ?? null,
		sourceId: input.sourceId ?? null,
		dedupeKey: input.dedupeKey ?? null,
		durationMs: input.durationMs ?? null,
		costCents: input.costCents ?? null,
		metadata: sanitizeRunDetails(input.metadata),
		occurredAt: now,
		createdAt: new Date(),
	};

	const [row] = await executor
		.insert(observabilitySchema.observabilityEvent)
		.values(values)
		.onConflictDoUpdate({
			target: observabilitySchema.observabilityEvent.dedupeKey,
			set: {
				organizationId: values.organizationId,
				repositoryId: values.repositoryId,
				pullRequestId: values.pullRequestId,
				issueId: values.issueId,
				reviewRunId: values.reviewRunId,
				traceId: values.traceId,
				parentEventId: values.parentEventId,
				kind: values.kind,
				action: values.action,
				status: values.status,
				severity: values.severity,
				title: values.title,
				body: values.body,
				sourceType: values.sourceType,
				sourceId: values.sourceId,
				durationMs: values.durationMs,
				costCents: values.costCents,
				metadata: values.metadata,
				occurredAt: values.occurredAt,
			},
		})
		.returning();

	return row;
}

export async function appendObservabilityEventMetadata({
	eventId: id,
	metadata,
}: {
	eventId: string;
	metadata: Record<string, unknown>;
}) {
	await db
		.update(observabilitySchema.observabilityEvent)
		.set({ metadata: sanitizeRunDetails(metadata) })
		.where(eq(observabilitySchema.observabilityEvent.id, id));
}
