import { randomUUID } from "node:crypto";
import { createRepositories, repositories } from "@gitpal/repositories";
import { sanitizeDiagnosticText, sanitizeRunDetails } from "./safe-diagnostics";

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
	executor?: any,
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

	const repos = executor ? createRepositories(executor) : repositories;
	const row = await repos.observabilityEvent.upsertByDedupeKey(values);

	return row;
}

export async function appendObservabilityEventMetadata({
	eventId: id,
	metadata,
}: {
	eventId: string;
	metadata: Record<string, unknown>;
}) {
	await repositories.observabilityEvent.updateById(id, {
		metadata: sanitizeRunDetails(metadata),
	});
}
