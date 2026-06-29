import { db } from "@gitpal/db";
import * as aiSchema from "@gitpal/db/schema/ai";
import * as billingSchema from "@gitpal/db/schema/billing";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import * as observabilitySchema from "@gitpal/db/schema/observability";
import { repositories } from "@gitpal/repositories";
import { listRepositoriesForUser } from "@gitpal/services/repository-sync";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../index";

const defaultLookbackDays = 14;

const observabilityKindSchema = z
	.enum([
		"all",
		"ai",
		"admin",
		"billing",
		"job",
		"notification",
		"review",
		"tool",
		"webhook",
	])
	.default("all");

const observabilityTimelineSchema = z.object({
	organizationId: z.string().min(1).optional(),
	repositoryId: z.string().min(1).optional(),
	kind: observabilityKindSchema.optional(),
	pullRequestNumber: z.number().int().positive().optional(),
	issueNumber: z.number().int().positive().optional(),
	user: z.string().trim().max(120).optional(),
	sourceId: z.string().trim().max(240).optional(),
	severity: z
		.enum(["all", "info", "success", "warning", "error"])
		.default("all"),
	dateRange: z
		.object({
			from: z.string().optional(),
			to: z.string().optional(),
		})
		.optional(),
	limit: z.number().int().min(20).max(300).default(120),
});

const observabilityDetailSchema = z.object({
	id: z.string().min(1),
	kind: observabilityKindSchema.optional(),
	sourceType: z.string().trim().max(120).optional().nullable(),
	sourceId: z.string().trim().max(240).optional().nullable(),
	traceId: z.string().trim().max(240).optional().nullable(),
	repositoryId: z.string().min(1).optional().nullable(),
	pullRequestId: z.string().min(1).optional().nullable(),
	issueId: z.string().min(1).optional().nullable(),
});

type TimelineKind = Exclude<z.infer<typeof observabilityKindSchema>, "all">;

type TimelineEvent = {
	id: string;
	timestamp: string;
	kind: TimelineKind;
	action: string;
	status: string;
	severity: "info" | "success" | "warning" | "error";
	title: string;
	body: string | null;
	sourceType: string | null;
	sourceId: string | null;
	traceId: string | null;
	durationMs: number | null;
	costCents: number | null;
	repository: {
		id: string;
		fullName: string;
		htmlUrl: string;
	} | null;
	pullRequest: {
		id: string;
		number: number;
		title: string;
		htmlUrl: string;
	} | null;
	issue?: {
		id: string;
		number: number;
		title: string;
		htmlUrl: string;
	} | null;
	metadata: Record<string, unknown>;
};

type DetailField = {
	label: string;
	value: string | null;
};

type DetailSource = {
	title: string;
	subtitle: string | null;
	fields: DetailField[];
	raw: Record<string, unknown>;
};

type DetailSourceInput = Omit<DetailSource, "fields"> & {
	fields: Array<DetailField | null>;
};

type ObservabilityDetailResponse = {
	source: DetailSource | null;
	timeline: TimelineEvent[];
	errorTimeline: TimelineEvent[];
};

function parseDate(value: string | undefined, fallback: Date) {
	if (!value) {
		return fallback;
	}

	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? fallback : date;
}

function defaultFromDate() {
	const date = new Date();
	date.setDate(date.getDate() - defaultLookbackDays);
	return date;
}

function normalizeDateRange(
	input: z.infer<typeof observabilityTimelineSchema>,
) {
	const to = parseDate(input.dateRange?.to, new Date());
	const from = parseDate(input.dateRange?.from, defaultFromDate());

	return { from, to };
}

function toRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}

	return value as Record<string, unknown>;
}

function toNumber(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function durationMs(
	startedAt: Date | null | undefined,
	completedAt: Date | null | undefined,
) {
	if (!startedAt || !completedAt) {
		return null;
	}

	const value = completedAt.getTime() - startedAt.getTime();
	return value >= 0 && Number.isFinite(value) ? value : null;
}

function severityForStatus(status: string): TimelineEvent["severity"] {
	const normalized = status.toLowerCase();

	if (
		[
			"cancelled",
			"expired",
			"failed",
			"processed_with_errors",
			"refunded",
		].includes(normalized)
	) {
		return "error";
	}

	if (
		[
			"pending",
			"processing",
			"queued",
			"received",
			"running",
			"waiting",
		].includes(normalized)
	) {
		return "warning";
	}

	if (
		[
			"completed",
			"created",
			"delivered",
			"paid",
			"processed",
			"succeeded",
			"topup-credit",
		].includes(normalized)
	) {
		return "success";
	}

	return "info";
}

function shouldInclude(kind: TimelineKind, selected: string) {
	return selected === "all" || selected === kind;
}

function repositoryPayload(
	repository:
		| Pick<
				typeof dashboardSchema.repository.$inferSelect,
				"id" | "fullName" | "htmlUrl"
		  >
		| null
		| undefined,
): TimelineEvent["repository"] {
	if (!repository) {
		return null;
	}

	return {
		id: repository.id,
		fullName: repository.fullName,
		htmlUrl: repository.htmlUrl,
	};
}

function pullRequestPayload(
	pullRequest:
		| Pick<
				typeof dashboardSchema.pullRequest.$inferSelect,
				"id" | "number" | "title" | "htmlUrl"
		  >
		| null
		| undefined,
): TimelineEvent["pullRequest"] {
	if (!pullRequest) {
		return null;
	}

	return {
		id: pullRequest.id,
		number: pullRequest.number,
		title: pullRequest.title,
		htmlUrl: pullRequest.htmlUrl,
	};
}

function issuePayload(
	issue:
		| Pick<
				typeof dashboardSchema.issue.$inferSelect,
				"id" | "number" | "title" | "htmlUrl"
		  >
		| null
		| undefined,
): TimelineEvent["issue"] {
	return issue
		? {
				id: issue.id,
				number: issue.number,
				title: issue.title,
				htmlUrl: issue.htmlUrl,
			}
		: null;
}

function formatDetailValue(value: unknown): string | null {
	if (value === null || value === undefined) {
		return null;
	}

	if (typeof value === "string") {
		return value;
	}

	if (
		typeof value === "number" ||
		typeof value === "bigint" ||
		typeof value === "boolean"
	) {
		return String(value);
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (Array.isArray(value)) {
		return value.map(formatDetailValue).filter(Boolean).join(", ") || null;
	}

	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function buildDetailField(label: string, value: unknown): DetailField | null {
	const formatted = formatDetailValue(value);
	return formatted ? { label, value: formatted } : null;
}

function buildDetailSource({
	title,
	subtitle,
	fields,
	raw,
}: DetailSourceInput): DetailSource {
	return {
		title,
		subtitle,
		fields: fields.filter((field): field is DetailField => Boolean(field)),
		raw,
	};
}

function buildReviewStepEvent(
	step: typeof dashboardSchema.reviewRunStep.$inferSelect,
	context: {
		repository: TimelineEvent["repository"];
		pullRequest: TimelineEvent["pullRequest"];
		issue?: TimelineEvent["issue"] | null;
		traceId: string | null;
	},
): TimelineEvent {
	return {
		id: step.id,
		timestamp: (step.completedAt ?? step.startedAt ?? new Date()).toISOString(),
		kind: "job",
		action: step.stepKey,
		status: step.status,
		severity: severityForStatus(step.status),
		title: step.title,
		body: step.summary ?? step.errorCode ?? null,
		sourceType: "review-run-step",
		sourceId: step.id,
		traceId: context.traceId,
		durationMs: step.durationMs,
		costCents: null,
		repository: context.repository,
		pullRequest: context.pullRequest,
		issue: context.issue ?? null,
		metadata: {
			stepKey: step.stepKey,
			position: step.position,
			attempt: step.attempt,
			errorCode: step.errorCode,
			details: step.details,
		},
	};
}

function isFailureStatus(status: string) {
	return ["cancelled", "expired", "failed", "ignored"].includes(
		status.toLowerCase(),
	);
}

function buildErrorTimeline(items: TimelineEvent[]) {
	const selectedIndexes = new Set<number>();

	for (let index = 0; index < items.length; index += 1) {
		const item = items[index];
		if (!item) {
			continue;
		}
		if (item.severity !== "error" && !isFailureStatus(item.status)) {
			continue;
		}

		selectedIndexes.add(index);
		if (index > 0) {
			selectedIndexes.add(index - 1);
		}
	}

	return [...selectedIndexes]
		.sort((left, right) => left - right)
		.map((index) => items[index])
		.filter((item): item is TimelineEvent => item !== undefined);
}

function timelineEventFromObservabilityRow(
	row:
		| typeof observabilitySchema.observabilityEvent.$inferSelect
		| null
		| undefined,
	context: {
		repository: TimelineEvent["repository"];
		pullRequest: TimelineEvent["pullRequest"];
		issue?: TimelineEvent["issue"] | null;
	},
): TimelineEvent | null {
	if (!row) {
		return null;
	}

	return {
		id: row.id,
		timestamp: row.occurredAt.toISOString(),
		kind: row.kind as TimelineKind,
		action: row.action,
		status: row.status,
		severity: row.severity as TimelineEvent["severity"],
		title: row.title,
		body: row.body,
		sourceType: row.sourceType,
		sourceId: row.sourceId,
		traceId: row.traceId,
		durationMs: row.durationMs,
		costCents: row.costCents,
		repository: context.repository,
		pullRequest: context.pullRequest,
		issue: context.issue ?? null,
		metadata: row.metadata ?? {},
	};
}

function buildStats(events: TimelineEvent[]) {
	return {
		totalEvents: events.length,
		failedEvents: events.filter((event) => event.severity === "error").length,
		runningEvents: events.filter((event) =>
			[
				"pending",
				"processing",
				"queued",
				"received",
				"running",
				"waiting",
			].includes(event.status.toLowerCase()),
		).length,
		aiCostCents: events
			.filter((event) => event.kind === "ai")
			.reduce((sum, event) => sum + (event.costCents ?? 0), 0),
		walletMovementCents: events
			.filter((event) => event.kind === "billing")
			.reduce(
				(sum, event) =>
					sum + (toNumber(event.metadata.amountCents) ?? event.costCents ?? 0),
				0,
			),
	};
}

function dedupeAndSort(events: TimelineEvent[], limit: number) {
	const seen = new Set<string>();
	const result: TimelineEvent[] = [];

	for (const event of events.sort(
		(left, right) =>
			new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
	)) {
		const key =
			event.sourceType && event.sourceId
				? `${event.kind}:${event.action}:${event.sourceType}:${event.sourceId}`
				: event.id;

		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		result.push(event);

		if (result.length >= limit) {
			break;
		}
	}

	return result;
}

function dedupeAndSortAscending(events: TimelineEvent[], limit: number) {
	const seen = new Set<string>();
	const result: TimelineEvent[] = [];

	for (const event of events.sort(
		(left, right) =>
			new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
	)) {
		const key =
			event.sourceType && event.sourceId
				? `${event.kind}:${event.action}:${event.sourceType}:${event.sourceId}`
				: event.id;

		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		result.push(event);

		if (result.length >= limit) {
			break;
		}
	}

	return result;
}

export const observabilityRouter = router({
	detail: protectedProcedure
		.input(observabilityDetailSchema)
		.query(async ({ ctx, input }) => {
			const [
				eventRows,
				requestedRepository,
				requestedPullRequest,
				requestedIssue,
			] = await Promise.all([
				db
					.select({
						event: observabilitySchema.observabilityEvent,
						repository: dashboardSchema.repository,
						pullRequest: dashboardSchema.pullRequest,
						issue: dashboardSchema.issue,
					})
					.from(observabilitySchema.observabilityEvent)
					.leftJoin(
						dashboardSchema.repository,
						eq(
							observabilitySchema.observabilityEvent.repositoryId,
							dashboardSchema.repository.id,
						),
					)
					.leftJoin(
						dashboardSchema.pullRequest,
						eq(
							observabilitySchema.observabilityEvent.pullRequestId,
							dashboardSchema.pullRequest.id,
						),
					)
					.leftJoin(
						dashboardSchema.issue,
						eq(
							observabilitySchema.observabilityEvent.issueId,
							dashboardSchema.issue.id,
						),
					)
					.where(
						and(
							eq(observabilitySchema.observabilityEvent.id, input.id),
							eq(
								observabilitySchema.observabilityEvent.userId,
								ctx.session.user.id,
							),
						),
					)
					.limit(1),
				input.repositoryId
					? repositories.repository.findById(input.repositoryId)
					: Promise.resolve(null),
				input.pullRequestId
					? repositories.pullRequest.findById(input.pullRequestId)
					: Promise.resolve(null),
				input.issueId
					? repositories.issue.findById(input.issueId)
					: Promise.resolve(null),
			]);

			const eventRow = eventRows[0] ?? null;
			const sourceType = input.sourceType ?? eventRow?.event.sourceType ?? null;
			const sourceId = input.sourceId ?? eventRow?.event.sourceId ?? null;
			let traceId = input.traceId ?? eventRow?.event.traceId ?? null;
			let repository = repositoryPayload(
				eventRow?.repository ?? requestedRepository ?? null,
			);
			let pullRequest = pullRequestPayload(
				eventRow?.pullRequest ?? requestedPullRequest ?? null,
			);
			let issue = issuePayload(eventRow?.issue ?? requestedIssue ?? null);
			let sourceEvent: TimelineEvent | null = eventRow
				? timelineEventFromObservabilityRow(eventRow.event, {
						repository,
						pullRequest,
						issue,
					})
				: null;
			let source: DetailSource | null = eventRow
				? buildDetailSource({
						title: eventRow.event.title,
						subtitle: eventRow.event.body,
						fields: [
							buildDetailField("Kind", eventRow.event.kind),
							buildDetailField("Action", eventRow.event.action),
							buildDetailField("Status", eventRow.event.status),
							buildDetailField("Severity", eventRow.event.severity),
							buildDetailField("Source type", eventRow.event.sourceType),
							buildDetailField("Source ID", eventRow.event.sourceId),
							buildDetailField("Trace ID", eventRow.event.traceId),
							buildDetailField("Duration", eventRow.event.durationMs),
							buildDetailField("Cost", eventRow.event.costCents),
							buildDetailField("Occurred at", eventRow.event.occurredAt),
						],
						raw: eventRow.event.metadata ?? {},
					})
				: null;
			const traceEvents: TimelineEvent[] = [];

			switch (sourceType) {
				case "review-run": {
					const reviewRun = sourceId
						? await repositories.reviewRun.findById(sourceId)
						: null;
					if (!reviewRun) {
						break;
					}

					const [
						reviewRepository,
						reviewPullRequest,
						reviewIssue,
						reviewSteps,
					] = await Promise.all([
						repositories.repository.findById(reviewRun.repositoryId),
						reviewRun.pullRequestId
							? repositories.pullRequest.findById(reviewRun.pullRequestId)
							: Promise.resolve(null),
						reviewRun.issueId
							? repositories.issue.findById(reviewRun.issueId)
							: Promise.resolve(null),
						repositories.reviewRunStep.listByReviewRun(reviewRun.id),
					]);

					repository = repositoryPayload(
						reviewRepository ?? requestedRepository,
					);
					pullRequest = pullRequestPayload(
						reviewPullRequest ?? requestedPullRequest,
					);
					issue = issuePayload(reviewIssue ?? requestedIssue);
					traceId = reviewRun.traceId ?? reviewRun.id;
					sourceEvent = {
						id: `review:${reviewRun.id}`,
						timestamp: (
							reviewRun.completedAt ??
							reviewRun.startedAt ??
							reviewRun.createdAt
						).toISOString(),
						kind: "review",
						action: reviewRun.reviewKind,
						status: reviewRun.status,
						severity: severityForStatus(reviewRun.status),
						title: `${reviewRun.reviewKind} review ${reviewRun.status}`,
						body: reviewRun.summary,
						sourceType: "review-run",
						sourceId: reviewRun.id,
						traceId,
						durationMs: durationMs(reviewRun.startedAt, reviewRun.completedAt),
						costCents: null,
						repository,
						pullRequest,
						issue,
						metadata: {
							trigger: reviewRun.trigger,
							modelId: reviewRun.modelId,
							providerEvent: reviewRun.providerEvent,
							providerAction: reviewRun.providerAction,
							promptVersion: reviewRun.promptVersion,
							reviewTemplate: reviewRun.reviewTemplate,
							confidenceLevel: reviewRun.confidenceLevel,
							confidenceScore: reviewRun.confidenceScore,
							confidenceSummary: reviewRun.confidenceSummary,
							result: reviewRun.result,
						},
					};
					source = buildDetailSource({
						title: `${reviewRun.reviewKind} review`,
						subtitle: reviewRun.summary ?? reviewRun.status,
						fields: [
							buildDetailField("Status", reviewRun.status),
							buildDetailField("Trigger", reviewRun.trigger),
							buildDetailField("Model", reviewRun.modelId),
							buildDetailField("Confidence", reviewRun.confidenceSummary),
							buildDetailField("Confidence score", reviewRun.confidenceScore),
							buildDetailField("Confidence level", reviewRun.confidenceLevel),
							buildDetailField("Provider event", reviewRun.providerEvent),
							buildDetailField("Provider action", reviewRun.providerAction),
							buildDetailField("Prompt version", reviewRun.promptVersion),
							buildDetailField("Review template", reviewRun.reviewTemplate),
							buildDetailField("Started at", reviewRun.startedAt),
							buildDetailField("Completed at", reviewRun.completedAt),
							buildDetailField("Step count", reviewSteps.length),
						],
						raw: toRecord(reviewRun.result),
					});
					traceEvents.push(
						...reviewSteps.map((step) =>
							buildReviewStepEvent(step, {
								repository,
								pullRequest,
								issue,
								traceId,
							}),
						),
					);
					break;
				}
				case "webhook-receipt": {
					const receipt = sourceId
						? await repositories.webhookEventReceipt.findById(sourceId)
						: null;
					if (!receipt) {
						break;
					}

					const relatedRunRows = await db
						.select({ run: dashboardSchema.reviewRun })
						.from(dashboardSchema.reviewRun)
						.where(
							and(
								eq(dashboardSchema.reviewRun.providerId, receipt.providerId),
								eq(
									dashboardSchema.reviewRun.providerDeliveryId,
									receipt.deliveryId,
								),
							),
						)
						.orderBy(desc(dashboardSchema.reviewRun.createdAt))
						.limit(1);
					const relatedRun = relatedRunRows[0]?.run ?? null;
					const relatedRepository = relatedRun
						? await repositories.repository.findById(relatedRun.repositoryId)
						: receipt.repositoryId
							? await repositories.repository.findById(receipt.repositoryId)
							: null;
					const relatedPullRequest = relatedRun?.pullRequestId
						? await repositories.pullRequest.findById(relatedRun.pullRequestId)
						: null;
					const relatedIssue = relatedRun?.issueId
						? await repositories.issue.findById(relatedRun.issueId)
						: null;
					repository = repositoryPayload(
						relatedRepository ?? requestedRepository,
					);
					pullRequest = pullRequestPayload(
						relatedPullRequest ?? requestedPullRequest,
					);
					issue = issuePayload(relatedIssue ?? requestedIssue);
					traceId =
						relatedRun?.traceId ??
						relatedRun?.id ??
						traceId ??
						receipt.deliveryId;
					sourceEvent = {
						id: `webhook:${receipt.id}`,
						timestamp: (
							receipt.processedAt ?? receipt.receivedAt
						).toISOString(),
						kind: "webhook",
						action: receipt.event,
						status: receipt.status,
						severity: severityForStatus(receipt.status),
						title: `${receipt.providerId} ${receipt.event}`,
						body: receipt.action,
						sourceType: "webhook-receipt",
						sourceId: receipt.id,
						traceId,
						durationMs: durationMs(receipt.receivedAt, receipt.processedAt),
						costCents: null,
						repository,
						pullRequest: null,
						issue: null,
						metadata: {
							deliveryId: receipt.deliveryId,
							repositoryPath: receipt.repositoryPath,
							action: receipt.action,
							relatedReviewRunId: relatedRun?.id ?? null,
						},
					};
					source = buildDetailSource({
						title: "Webhook receipt",
						subtitle: `${receipt.providerId} ${receipt.event}`,
						fields: [
							buildDetailField("Provider", receipt.providerId),
							buildDetailField("Delivery ID", receipt.deliveryId),
							buildDetailField("Event", receipt.event),
							buildDetailField("Action", receipt.action),
							buildDetailField("Status", receipt.status),
							buildDetailField("Repository path", receipt.repositoryPath),
							buildDetailField("Received at", receipt.receivedAt),
							buildDetailField("Processed at", receipt.processedAt),
							buildDetailField("Related review run", relatedRun?.id ?? null),
							buildDetailField(
								"Related review status",
								relatedRun?.status ?? null,
							),
						],
						raw: toRecord(receipt.payload),
					});
					if (relatedRun) {
						const relatedSteps =
							await repositories.reviewRunStep.listByReviewRun(relatedRun.id);
						traceEvents.push(
							...relatedSteps.map((step) =>
								buildReviewStepEvent(step, {
									repository,
									pullRequest,
									issue,
									traceId,
								}),
							),
						);
					}
					break;
				}
				case "ai-generation": {
					const generation = sourceId
						? await repositories.aiGeneration.findById(sourceId)
						: null;
					if (!generation) {
						break;
					}

					const [generationRepository, generationPullRequest, generationIssue] =
						await Promise.all([
							generation.repositoryId
								? repositories.repository.findById(generation.repositoryId)
								: Promise.resolve(null),
							generation.pullRequestId
								? repositories.pullRequest.findById(generation.pullRequestId)
								: Promise.resolve(null),
							generation.issueId
								? repositories.issue.findById(generation.issueId)
								: Promise.resolve(null),
						]);

					repository = repositoryPayload(
						generationRepository ?? requestedRepository,
					);
					pullRequest = pullRequestPayload(
						generationPullRequest ?? requestedPullRequest,
					);
					issue = issuePayload(generationIssue ?? requestedIssue);
					traceId = generation.reviewRunId ?? generation.id;
					const costCents =
						generation.actualCostCents ?? generation.estimatedCostCents;
					sourceEvent = {
						id: `ai:${generation.id}`,
						timestamp: (
							generation.completedAt ??
							generation.startedAt ??
							generation.createdAt
						).toISOString(),
						kind: "ai",
						action: generation.callKind,
						status: generation.status,
						severity: severityForStatus(generation.status),
						title: `${generation.callKind} AI generation ${generation.status}`,
						body: `${generation.providerLabel} ${generation.modelId} through ${generation.routeLabel ?? generation.routeId}`,
						sourceType: "ai-generation",
						sourceId: generation.id,
						traceId,
						durationMs: durationMs(
							generation.startedAt,
							generation.completedAt,
						),
						costCents,
						repository,
						pullRequest,
						issue,
						metadata: {
							routeId: generation.routeId,
							routeLabel: generation.routeLabel,
							billingMode: generation.billingMode,
							totalTokens: generation.totalTokens,
							inputTokens: generation.inputTokens,
							outputTokens: generation.outputTokens,
							walletDebitCents: generation.walletDebitCents,
							walletBalanceAfterCents: generation.walletBalanceAfterCents,
							providerGenerationId: generation.providerGenerationId,
							errorMessage: generation.errorMessage,
						},
					};
					source = buildDetailSource({
						title: `${generation.callKind} generation`,
						subtitle: `${generation.providerLabel} ${generation.modelId}`,
						fields: [
							buildDetailField("Status", generation.status),
							buildDetailField("Call kind", generation.callKind),
							buildDetailField("Billing mode", generation.billingMode),
							buildDetailField("Model", generation.modelId),
							buildDetailField("Provider", generation.providerLabel),
							buildDetailField(
								"Route",
								generation.routeLabel ?? generation.routeId,
							),
							buildDetailField("Input tokens", generation.inputTokens),
							buildDetailField("Output tokens", generation.outputTokens),
							buildDetailField("Total tokens", generation.totalTokens),
							buildDetailField("Actual cost", costCents),
							buildDetailField("Wallet debit", generation.walletDebitCents),
							buildDetailField(
								"Provider generation ID",
								generation.providerGenerationId,
							),
							buildDetailField("Error", generation.errorMessage),
						],
						raw: {
							...(generation.providerMetadata ?? {}),
							...(generation.metadata ?? {}),
						},
					});
					break;
				}
				case "wallet-topup": {
					const topup = sourceId
						? await repositories.walletTopup.findById(sourceId)
						: null;
					if (!topup) {
						break;
					}

					traceId = topup.orderId;
					sourceEvent = {
						id: `billing-topup:${topup.id}`,
						timestamp: topup.updatedAt.toISOString(),
						kind: "billing",
						action: "wallet-topup",
						status: topup.status,
						severity: severityForStatus(topup.status),
						title: `Wallet top-up ${topup.status}`,
						body: topup.errorMessage ?? topup.providerStatus,
						sourceType: "wallet-topup",
						sourceId: topup.id,
						traceId,
						durationMs: durationMs(topup.createdAt, topup.creditedAt),
						costCents: topup.priceAmountUsdCents,
						repository,
						pullRequest: null,
						issue: null,
						metadata: {
							orderId: topup.orderId,
							provider: topup.provider,
							providerInvoiceId: topup.providerInvoiceId,
							providerPaymentId: topup.providerPaymentId,
							revenueAmountCents: topup.revenueAmountCents,
							creditedAmountCents: topup.creditedAmountCents,
							invoiceUrl: topup.invoiceUrl,
						},
					};
					source = buildDetailSource({
						title: "Wallet top-up",
						subtitle: topup.providerStatus ?? topup.status,
						fields: [
							buildDetailField("Status", topup.status),
							buildDetailField("Provider", topup.provider),
							buildDetailField("Order ID", topup.orderId),
							buildDetailField("Provider invoice ID", topup.providerInvoiceId),
							buildDetailField("Provider payment ID", topup.providerPaymentId),
							buildDetailField("Price amount", topup.priceAmountUsdCents),
							buildDetailField("Revenue amount", topup.revenueAmountCents),
							buildDetailField("Credited amount", topup.creditedAmountCents),
							buildDetailField("Invoice URL", topup.invoiceUrl),
							buildDetailField("Error", topup.errorMessage),
							buildDetailField("Created at", topup.createdAt),
							buildDetailField("Credited at", topup.creditedAt),
						],
						raw: toRecord({
							...topup,
							metadata: topup.metadata,
						}),
					});
					break;
				}
				case "wallet-ledger-entry": {
					const entry = sourceId
						? await repositories.walletLedgerEntry.findById(sourceId)
						: null;
					if (!entry) {
						break;
					}

					traceId = entry.sourceId;
					sourceEvent = {
						id: `billing-ledger:${entry.id}`,
						timestamp: entry.createdAt.toISOString(),
						kind: "billing",
						action: entry.type,
						status: entry.type,
						severity: severityForStatus(entry.type),
						title: entry.description,
						body: entry.sourceType,
						sourceType: "wallet-ledger-entry",
						sourceId: entry.id,
						traceId,
						durationMs: null,
						costCents: Math.abs(entry.amountCents),
						repository,
						pullRequest: null,
						issue: null,
						metadata: {
							amountCents: entry.amountCents,
							balanceAfterCents: entry.balanceAfterCents,
							sourceType: entry.sourceType,
							sourceId: entry.sourceId,
							currency: entry.currency,
						},
					};
					source = buildDetailSource({
						title: "Wallet ledger entry",
						subtitle: entry.description,
						fields: [
							buildDetailField("Type", entry.type),
							buildDetailField("Amount", entry.amountCents),
							buildDetailField("Balance after", entry.balanceAfterCents),
							buildDetailField("Source type", entry.sourceType),
							buildDetailField("Source ID", entry.sourceId),
							buildDetailField("Currency", entry.currency),
							buildDetailField("Created at", entry.createdAt),
						],
						raw: toRecord(entry.metadata),
					});
					break;
				}
				default: {
					if (!sourceEvent && sourceType && eventRow) {
						sourceEvent = timelineEventFromObservabilityRow(eventRow.event, {
							repository,
							pullRequest,
							issue,
						});
					}

					if (eventRow?.event) {
						source = buildDetailSource({
							title: eventRow.event.title,
							subtitle: eventRow.event.body,
							fields: [
								buildDetailField("Kind", eventRow.event.kind),
								buildDetailField("Action", eventRow.event.action),
								buildDetailField("Status", eventRow.event.status),
								buildDetailField("Severity", eventRow.event.severity),
								buildDetailField("Source type", eventRow.event.sourceType),
								buildDetailField("Source ID", eventRow.event.sourceId),
								buildDetailField("Trace ID", eventRow.event.traceId),
								buildDetailField("Duration", eventRow.event.durationMs),
								buildDetailField("Cost", eventRow.event.costCents),
								buildDetailField("Occurred at", eventRow.event.occurredAt),
							],
							raw: eventRow.event.metadata ?? {},
						});
					}
				}
			}

			if (!sourceEvent && sourceType && sourceId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Observability source could not be resolved.",
				});
			}

			const traceRows = traceId
				? await repositories.observabilityEvent.listByTrace(traceId)
				: [];
			const traceContext = {
				repository,
				pullRequest,
				issue,
			};
			const traceTimeline = traceRows
				.map((row) => timelineEventFromObservabilityRow(row, traceContext))
				.filter((row): row is TimelineEvent => row !== null);
			const timeline = dedupeAndSortAscending(
				[
					...(sourceEvent ? [sourceEvent] : []),
					...traceTimeline,
					...traceEvents,
				],
				200,
			);

			return {
				source,
				timeline,
				errorTimeline: buildErrorTimeline(timeline),
			} satisfies ObservabilityDetailResponse;
		}),
	timeline: protectedProcedure
		.input(observabilityTimelineSchema)
		.query(async ({ ctx, input }) => {
			const selectedKind = input.kind ?? "all";
			const { from, to } = normalizeDateRange(input);
			const organizationId =
				input.organizationId ??
				ctx.session.session.activeOrganizationId ??
				null;
			const repositories = await listRepositoriesForUser({
				userId: ctx.session.user.id,
				organizationId,
			});
			const repositoryMap = new Map(
				repositories.map((repository) => [repository.id, repository]),
			);
			const requestedRepository = input.repositoryId
				? repositoryMap.get(input.repositoryId)
				: null;
			const repositoryIds = input.repositoryId
				? requestedRepository
					? [requestedRepository.id]
					: []
				: repositories.map((repository) => repository.id);
			const hasRepositoryFilter = Boolean(input.repositoryId);
			const events: TimelineEvent[] = [];
			const repositoryScope =
				repositoryIds.length > 0
					? inArray(
							observabilitySchema.observabilityEvent.repositoryId,
							repositoryIds,
						)
					: isNull(observabilitySchema.observabilityEvent.repositoryId);

			const observedRows = await db
				.select({
					event: observabilitySchema.observabilityEvent,
					repository: dashboardSchema.repository,
					pullRequest: dashboardSchema.pullRequest,
					issue: dashboardSchema.issue,
				})
				.from(observabilitySchema.observabilityEvent)
				.leftJoin(
					dashboardSchema.repository,
					eq(
						observabilitySchema.observabilityEvent.repositoryId,
						dashboardSchema.repository.id,
					),
				)
				.leftJoin(
					dashboardSchema.pullRequest,
					eq(
						observabilitySchema.observabilityEvent.pullRequestId,
						dashboardSchema.pullRequest.id,
					),
				)
				.leftJoin(
					dashboardSchema.issue,
					eq(
						observabilitySchema.observabilityEvent.issueId,
						dashboardSchema.issue.id,
					),
				)
				.where(
					and(
						eq(
							observabilitySchema.observabilityEvent.userId,
							ctx.session.user.id,
						),
						gte(observabilitySchema.observabilityEvent.occurredAt, from),
						lte(observabilitySchema.observabilityEvent.occurredAt, to),
						selectedKind === "all"
							? undefined
							: eq(observabilitySchema.observabilityEvent.kind, selectedKind),
						hasRepositoryFilter ? repositoryScope : undefined,
					),
				)
				.orderBy(desc(observabilitySchema.observabilityEvent.occurredAt))
				.limit(input.limit);

			for (const row of observedRows) {
				events.push({
					id: row.event.id,
					timestamp: row.event.occurredAt.toISOString(),
					kind: row.event.kind as TimelineKind,
					action: row.event.action,
					status: row.event.status,
					severity: row.event.severity as TimelineEvent["severity"],
					title: row.event.title,
					body: row.event.body,
					sourceType: row.event.sourceType,
					sourceId: row.event.sourceId,
					traceId: row.event.traceId,
					durationMs: row.event.durationMs,
					costCents: row.event.costCents,
					repository: repositoryPayload(row.repository),
					pullRequest: pullRequestPayload(row.pullRequest),
					issue: issuePayload(row.issue),
					metadata: row.event.metadata ?? {},
				});
			}

			if (shouldInclude("ai", selectedKind)) {
				const aiConditions = [
					eq(aiSchema.aiGeneration.userId, ctx.session.user.id),
					gte(aiSchema.aiGeneration.createdAt, from),
					lte(aiSchema.aiGeneration.createdAt, to),
				];

				if (hasRepositoryFilter) {
					aiConditions.push(
						repositoryIds.length > 0
							? inArray(aiSchema.aiGeneration.repositoryId, repositoryIds)
							: isNull(aiSchema.aiGeneration.repositoryId),
					);
				} else if (organizationId && repositoryIds.length > 0) {
					const repositoryScope = or(
						inArray(aiSchema.aiGeneration.repositoryId, repositoryIds),
						isNull(aiSchema.aiGeneration.repositoryId),
					);

					if (repositoryScope) {
						aiConditions.push(repositoryScope);
					}
				}

				const aiRows = await db
					.select({
						generation: aiSchema.aiGeneration,
						repository: dashboardSchema.repository,
						pullRequest: dashboardSchema.pullRequest,
					})
					.from(aiSchema.aiGeneration)
					.leftJoin(
						dashboardSchema.repository,
						eq(
							aiSchema.aiGeneration.repositoryId,
							dashboardSchema.repository.id,
						),
					)
					.leftJoin(
						dashboardSchema.pullRequest,
						eq(
							aiSchema.aiGeneration.pullRequestId,
							dashboardSchema.pullRequest.id,
						),
					)
					.where(and(...aiConditions))
					.orderBy(desc(aiSchema.aiGeneration.createdAt))
					.limit(input.limit);

				for (const row of aiRows) {
					const generation = row.generation;
					const costCents =
						generation.actualCostCents ?? generation.estimatedCostCents;

					events.push({
						id: `ai:${generation.id}`,
						timestamp: (
							generation.completedAt ??
							generation.startedAt ??
							generation.createdAt
						).toISOString(),
						kind: "ai",
						action: generation.callKind,
						status: generation.status,
						severity: severityForStatus(generation.status),
						title: `${generation.callKind} AI generation ${generation.status}`,
						body: `${generation.providerLabel} ${generation.modelId} through ${generation.routeLabel ?? generation.routeId}`,
						sourceType: "ai-generation",
						sourceId: generation.id,
						traceId: generation.reviewRunId ?? generation.id,
						durationMs: durationMs(
							generation.startedAt,
							generation.completedAt,
						),
						costCents,
						repository: repositoryPayload(row.repository),
						pullRequest: pullRequestPayload(row.pullRequest),
						metadata: {
							routeId: generation.routeId,
							routeLabel: generation.routeLabel,
							billingMode: generation.billingMode,
							totalTokens: generation.totalTokens,
							inputTokens: generation.inputTokens,
							outputTokens: generation.outputTokens,
							walletDebitCents: generation.walletDebitCents,
							walletBalanceAfterCents: generation.walletBalanceAfterCents,
							providerGenerationId: generation.providerGenerationId,
							errorMessage: generation.errorMessage,
						},
					});
				}
			}

			if (repositoryIds.length > 0 && shouldInclude("review", selectedKind)) {
				const reviewRows = await db
					.select({
						run: dashboardSchema.reviewRun,
						repository: dashboardSchema.repository,
						pullRequest: dashboardSchema.pullRequest,
					})
					.from(dashboardSchema.reviewRun)
					.innerJoin(
						dashboardSchema.repository,
						eq(
							dashboardSchema.reviewRun.repositoryId,
							dashboardSchema.repository.id,
						),
					)
					.leftJoin(
						dashboardSchema.pullRequest,
						eq(
							dashboardSchema.reviewRun.pullRequestId,
							dashboardSchema.pullRequest.id,
						),
					)
					.where(
						and(
							inArray(dashboardSchema.reviewRun.repositoryId, repositoryIds),
							gte(dashboardSchema.reviewRun.createdAt, from),
							lte(dashboardSchema.reviewRun.createdAt, to),
						),
					)
					.orderBy(desc(dashboardSchema.reviewRun.createdAt))
					.limit(input.limit);

				for (const row of reviewRows) {
					const result = toRecord(row.run.result);
					const stepCount = toNumber(result.stepCount);

					events.push({
						id: `review:${row.run.id}`,
						timestamp: (
							row.run.completedAt ??
							row.run.startedAt ??
							row.run.createdAt
						).toISOString(),
						kind: "review",
						action: row.run.reviewKind,
						status: row.run.status,
						severity: severityForStatus(row.run.status),
						title: `${row.run.reviewKind} review ${row.run.status}`,
						body: row.run.summary,
						sourceType: "review-run",
						sourceId: row.run.id,
						traceId: row.run.id,
						durationMs: durationMs(row.run.startedAt, row.run.completedAt),
						costCents: null,
						repository: repositoryPayload(row.repository),
						pullRequest: pullRequestPayload(row.pullRequest),
						metadata: {
							trigger: row.run.trigger,
							modelId: row.run.modelId,
							providerEvent: row.run.providerEvent,
							providerAction: row.run.providerAction,
							stepCount,
						},
					});

					if (
						stepCount !== null &&
						stepCount > 0 &&
						shouldInclude("tool", selectedKind)
					) {
						events.push({
							id: `tool-loop:${row.run.id}`,
							timestamp: (
								row.run.completedAt ??
								row.run.startedAt ??
								row.run.createdAt
							).toISOString(),
							kind: "tool",
							action: "tool-loop",
							status: row.run.status,
							severity: severityForStatus(row.run.status),
							title: `Reviewer tool loop ran ${stepCount} steps`,
							body: "AI review used repository-aware tools during this run.",
							sourceType: "review-run",
							sourceId: row.run.id,
							traceId: row.run.id,
							durationMs: durationMs(row.run.startedAt, row.run.completedAt),
							costCents: null,
							repository: repositoryPayload(row.repository),
							pullRequest: pullRequestPayload(row.pullRequest),
							metadata: {
								stepCount,
								reviewKind: row.run.reviewKind,
								trigger: row.run.trigger,
							},
						});
					}
				}
			}

			if (repositoryIds.length > 0 && shouldInclude("tool", selectedKind)) {
				const findingRows = await db
					.select({
						finding: dashboardSchema.toolFinding,
						repository: dashboardSchema.repository,
						pullRequest: dashboardSchema.pullRequest,
					})
					.from(dashboardSchema.toolFinding)
					.innerJoin(
						dashboardSchema.repository,
						eq(
							dashboardSchema.toolFinding.repositoryId,
							dashboardSchema.repository.id,
						),
					)
					.leftJoin(
						dashboardSchema.pullRequest,
						eq(
							dashboardSchema.toolFinding.pullRequestId,
							dashboardSchema.pullRequest.id,
						),
					)
					.where(
						and(
							inArray(dashboardSchema.toolFinding.repositoryId, repositoryIds),
							gte(dashboardSchema.toolFinding.createdAt, from),
							lte(dashboardSchema.toolFinding.createdAt, to),
						),
					)
					.orderBy(desc(dashboardSchema.toolFinding.createdAt))
					.limit(input.limit);

				for (const row of findingRows) {
					events.push({
						id: `tool-finding:${row.finding.id}`,
						timestamp: row.finding.createdAt.toISOString(),
						kind: "tool",
						action: row.finding.toolType,
						status: row.finding.status,
						severity: severityForStatus(row.finding.severity),
						title: row.finding.title,
						body: row.finding.filePath,
						sourceType: "tool-finding",
						sourceId: row.finding.id,
						traceId: row.finding.pullRequestId ?? row.finding.id,
						durationMs: null,
						costCents: null,
						repository: repositoryPayload(row.repository),
						pullRequest: pullRequestPayload(row.pullRequest),
						metadata: {
							toolName: row.finding.toolName,
							toolType: row.finding.toolType,
							filePath: row.finding.filePath,
							severity: row.finding.severity,
						},
					});
				}
			}

			if (repositoryIds.length > 0 && shouldInclude("webhook", selectedKind)) {
				const webhookRows = await db
					.select({
						receipt: dashboardSchema.webhookEventReceipt,
						repository: dashboardSchema.repository,
					})
					.from(dashboardSchema.webhookEventReceipt)
					.leftJoin(
						dashboardSchema.repository,
						eq(
							dashboardSchema.webhookEventReceipt.repositoryId,
							dashboardSchema.repository.id,
						),
					)
					.where(
						and(
							inArray(
								dashboardSchema.webhookEventReceipt.repositoryId,
								repositoryIds,
							),
							gte(dashboardSchema.webhookEventReceipt.receivedAt, from),
							lte(dashboardSchema.webhookEventReceipt.receivedAt, to),
						),
					)
					.orderBy(desc(dashboardSchema.webhookEventReceipt.receivedAt))
					.limit(input.limit);

				for (const row of webhookRows) {
					events.push({
						id: `webhook:${row.receipt.id}`,
						timestamp: (
							row.receipt.processedAt ?? row.receipt.receivedAt
						).toISOString(),
						kind: "webhook",
						action: row.receipt.event,
						status: row.receipt.status,
						severity: severityForStatus(row.receipt.status),
						title: `${row.receipt.providerId} ${row.receipt.event}`,
						body: row.receipt.action,
						sourceType: "webhook-receipt",
						sourceId: row.receipt.id,
						traceId: row.receipt.deliveryId,
						durationMs: durationMs(
							row.receipt.receivedAt,
							row.receipt.processedAt,
						),
						costCents: null,
						repository: repositoryPayload(row.repository),
						pullRequest: null,
						metadata: {
							deliveryId: row.receipt.deliveryId,
							repositoryPath: row.receipt.repositoryPath,
							action: row.receipt.action,
						},
					});
				}
			}

			if (!hasRepositoryFilter && shouldInclude("billing", selectedKind)) {
				const [topups, ledgerEntries] = await Promise.all([
					db
						.select()
						.from(billingSchema.walletTopup)
						.where(
							and(
								eq(billingSchema.walletTopup.userId, ctx.session.user.id),
								gte(billingSchema.walletTopup.createdAt, from),
								lte(billingSchema.walletTopup.createdAt, to),
							),
						)
						.orderBy(desc(billingSchema.walletTopup.createdAt))
						.limit(input.limit),
					db
						.select()
						.from(billingSchema.walletLedgerEntry)
						.where(
							and(
								eq(billingSchema.walletLedgerEntry.userId, ctx.session.user.id),
								gte(billingSchema.walletLedgerEntry.createdAt, from),
								lte(billingSchema.walletLedgerEntry.createdAt, to),
							),
						)
						.orderBy(desc(billingSchema.walletLedgerEntry.createdAt))
						.limit(input.limit),
				]);

				for (const topup of topups) {
					events.push({
						id: `billing-topup:${topup.id}`,
						timestamp: topup.updatedAt.toISOString(),
						kind: "billing",
						action: "wallet-topup",
						status: topup.status,
						severity: severityForStatus(topup.status),
						title: `Wallet top-up ${topup.status}`,
						body: topup.errorMessage ?? topup.providerStatus,
						sourceType: "wallet-topup",
						sourceId: topup.id,
						traceId: topup.orderId,
						durationMs: durationMs(topup.createdAt, topup.creditedAt),
						costCents: topup.priceAmountUsdCents,
						repository: null,
						pullRequest: null,
						metadata: {
							orderId: topup.orderId,
							provider: topup.provider,
							providerInvoiceId: topup.providerInvoiceId,
							providerPaymentId: topup.providerPaymentId,
							revenueAmountCents: topup.revenueAmountCents,
							creditedAmountCents: topup.creditedAmountCents,
							invoiceUrl: topup.invoiceUrl,
						},
					});
				}

				for (const entry of ledgerEntries) {
					events.push({
						id: `billing-ledger:${entry.id}`,
						timestamp: entry.createdAt.toISOString(),
						kind: "billing",
						action: entry.type,
						status: entry.type,
						severity: severityForStatus(entry.type),
						title: entry.description,
						body: entry.sourceType,
						sourceType: "wallet-ledger-entry",
						sourceId: entry.id,
						traceId: entry.sourceId,
						durationMs: null,
						costCents: Math.abs(entry.amountCents),
						repository: null,
						pullRequest: null,
						metadata: {
							amountCents: entry.amountCents,
							balanceAfterCents: entry.balanceAfterCents,
							sourceType: entry.sourceType,
							sourceId: entry.sourceId,
							currency: entry.currency,
						},
					});
				}
			}

			const userQuery = input.user?.toLowerCase();
			const sourceQuery = input.sourceId?.toLowerCase();
			const filteredEvents = events.filter((event) => {
				if (input.severity !== "all" && event.severity !== input.severity)
					return false;
				if (
					input.pullRequestNumber &&
					event.pullRequest?.number !== input.pullRequestNumber
				)
					return false;
				if (input.issueNumber && event.issue?.number !== input.issueNumber)
					return false;
				if (
					sourceQuery &&
					!`${event.sourceId ?? ""} ${event.traceId ?? ""}`
						.toLowerCase()
						.includes(sourceQuery)
				)
					return false;
				if (userQuery) {
					const searchable =
						`${event.title} ${event.body ?? ""} ${JSON.stringify(event.metadata)}`.toLowerCase();
					if (!searchable.includes(userQuery)) return false;
				}
				return true;
			});
			const timeline = dedupeAndSort(filteredEvents, input.limit);

			return {
				updatedAt: new Date().toISOString(),
				filters: {
					from: from.toISOString(),
					to: to.toISOString(),
					kind: selectedKind,
					organizationId,
					repositoryId: input.repositoryId ?? null,
					pullRequestNumber: input.pullRequestNumber ?? null,
					issueNumber: input.issueNumber ?? null,
					user: input.user ?? null,
					sourceId: input.sourceId ?? null,
					severity: input.severity,
				},
				repositories,
				stats: buildStats(timeline),
				events: timeline,
			};
		}),
});
