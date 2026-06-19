import { db } from "@gitpal/db";
import * as aiSchema from "@gitpal/db/schema/ai";
import * as billingSchema from "@gitpal/db/schema/billing";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import * as observabilitySchema from "@gitpal/db/schema/observability";
import { listRepositoriesForUser } from "@gitpal/services/repository-sync";
import { and, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../index";

const defaultLookbackDays = 14;

const observabilityKindSchema = z
	.enum([
		"all",
		"ai",
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
	dateRange: z
		.object({
			from: z.string().optional(),
			to: z.string().optional(),
		})
		.optional(),
	limit: z.number().int().min(20).max(300).default(120),
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
	metadata: Record<string, unknown>;
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

export const observabilityRouter = router({
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

			const timeline = dedupeAndSort(events, input.limit);

			return {
				updatedAt: new Date().toISOString(),
				filters: {
					from: from.toISOString(),
					to: to.toISOString(),
					kind: selectedKind,
					organizationId,
					repositoryId: input.repositoryId ?? null,
				},
				repositories,
				stats: buildStats(timeline),
				events: timeline,
			};
		}),
});
