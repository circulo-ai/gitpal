import { randomUUID } from "node:crypto";
import { db } from "@gitpal/db";
import * as aiSchema from "@gitpal/db/schema/ai";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import * as observabilitySchema from "@gitpal/db/schema/observability";
import {
	enqueueRepositoryLabelerRunJob,
	enqueueRepositoryReviewRunJob,
} from "@gitpal/jobs/inngest/functions/ai-workflows";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import {
	createAdapterForUserProvider,
	getAutomationActorForRepository,
} from "./git-provider-access";
import { projectIssueSnapshot } from "./issue-projection";
import { projectPullRequestSnapshot } from "./pr-projection";
import { listRepositoriesForUser } from "./repository-sync";
import { sanitizeDiagnosticText, sanitizeRunDetails } from "./safe-diagnostics";

export type WorkItemKind = "pull_request" | "issue";
const ACTIVE_RUN_STATUSES = ["queued", "running"];

async function accessibleRepository({
	userId,
	organizationId,
	repositoryId,
}: {
	userId: string;
	organizationId: string | null;
	repositoryId: string;
}) {
	const repositories = await listRepositoriesForUser({
		userId,
		organizationId,
	});
	return (
		repositories.find((repository) => repository.id === repositoryId) ?? null
	);
}

export async function listWorkItems({
	userId,
	organizationId,
	kind,
	query,
	state,
	repositoryId,
	page = 1,
	pageSize = 20,
}: {
	userId: string;
	organizationId: string | null;
	kind: WorkItemKind;
	query?: string;
	state?: string;
	repositoryId?: string;
	page?: number;
	pageSize?: number;
}) {
	const repositories = await listRepositoriesForUser({
		userId,
		organizationId,
	});
	const allowed = repositories
		.filter((repository) => !repositoryId || repository.id === repositoryId)
		.map((repository) => repository.id);
	if (allowed.length === 0) return { items: [], total: 0, page, pageSize };
	const repositoryMap = new Map(
		repositories.map((repository) => [repository.id, repository]),
	);
	const normalizedQuery = query?.trim();
	const offset = (page - 1) * pageSize;

	if (kind === "pull_request") {
		const rows = await db
			.select()
			.from(dashboardSchema.pullRequest)
			.where(
				and(
					inArray(dashboardSchema.pullRequest.repositoryId, allowed),
					state ? eq(dashboardSchema.pullRequest.state, state) : undefined,
					normalizedQuery
						? or(
								ilike(
									dashboardSchema.pullRequest.title,
									`%${normalizedQuery}%`,
								),
								ilike(
									dashboardSchema.pullRequest.authorLogin,
									`%${normalizedQuery}%`,
								),
							)
						: undefined,
				),
			)
			.orderBy(desc(dashboardSchema.pullRequest.updatedAt));
		return {
			items: rows.slice(offset, offset + pageSize).map((item) => ({
				...item,
				kind,
				repository: repositoryMap.get(item.repositoryId) ?? null,
			})),
			total: rows.length,
			page,
			pageSize,
		};
	}

	const rows = await db
		.select()
		.from(dashboardSchema.issue)
		.where(
			and(
				inArray(dashboardSchema.issue.repositoryId, allowed),
				state ? eq(dashboardSchema.issue.state, state) : undefined,
				normalizedQuery
					? or(
							ilike(dashboardSchema.issue.title, `%${normalizedQuery}%`),
							ilike(dashboardSchema.issue.authorLogin, `%${normalizedQuery}%`),
						)
					: undefined,
			),
		)
		.orderBy(desc(dashboardSchema.issue.updatedAt));
	return {
		items: rows.slice(offset, offset + pageSize).map((item) => ({
			...item,
			kind,
			repository: repositoryMap.get(item.repositoryId) ?? null,
		})),
		total: rows.length,
		page,
		pageSize,
	};
}

function safeGeneration(generation: typeof aiSchema.aiGeneration.$inferSelect) {
	return {
		id: generation.id,
		callKind: generation.callKind,
		status: generation.status,
		modelId: generation.modelId,
		providerLabel: generation.providerLabel,
		billingMode: generation.billingMode,
		inputTokens: generation.inputTokens,
		outputTokens: generation.outputTokens,
		totalTokens: generation.totalTokens,
		costCents: generation.actualCostCents ?? generation.estimatedCostCents,
		errorMessage: generation.errorMessage
			? sanitizeDiagnosticText(generation.errorMessage)
			: null,
		startedAt: generation.startedAt,
		completedAt: generation.completedAt,
	};
}

export async function getWorkItemDetail({
	userId,
	organizationId,
	kind,
	repositoryId,
	number,
}: {
	userId: string;
	organizationId: string | null;
	kind: WorkItemKind;
	repositoryId: string;
	number: number;
}) {
	const repository = await accessibleRepository({
		userId,
		organizationId,
		repositoryId,
	});
	if (!repository) return null;
	const [item] =
		kind === "pull_request"
			? await db
					.select()
					.from(dashboardSchema.pullRequest)
					.where(
						and(
							eq(dashboardSchema.pullRequest.repositoryId, repositoryId),
							eq(dashboardSchema.pullRequest.number, number),
						),
					)
					.limit(1)
			: await db
					.select()
					.from(dashboardSchema.issue)
					.where(
						and(
							eq(dashboardSchema.issue.repositoryId, repositoryId),
							eq(dashboardSchema.issue.number, number),
						),
					)
					.limit(1);
	if (!item) return null;

	const runs = await db
		.select()
		.from(dashboardSchema.reviewRun)
		.where(
			kind === "pull_request"
				? eq(dashboardSchema.reviewRun.pullRequestId, item.id)
				: eq(dashboardSchema.reviewRun.issueId, item.id),
		)
		.orderBy(desc(dashboardSchema.reviewRun.createdAt));
	const runIds = runs.map((run) => run.id);
	const [steps, generations, events, comments, checks] = await Promise.all([
		runIds.length
			? db
					.select()
					.from(dashboardSchema.reviewRunStep)
					.where(inArray(dashboardSchema.reviewRunStep.reviewRunId, runIds))
					.orderBy(dashboardSchema.reviewRunStep.position)
			: [],
		runIds.length
			? db
					.select()
					.from(aiSchema.aiGeneration)
					.where(inArray(aiSchema.aiGeneration.reviewRunId, runIds))
			: [],
		runIds.length
			? db
					.select({
						id: observabilitySchema.observabilityEvent.id,
						reviewRunId: observabilitySchema.observabilityEvent.reviewRunId,
						kind: observabilitySchema.observabilityEvent.kind,
						action: observabilitySchema.observabilityEvent.action,
						status: observabilitySchema.observabilityEvent.status,
						severity: observabilitySchema.observabilityEvent.severity,
						title: observabilitySchema.observabilityEvent.title,
						body: observabilitySchema.observabilityEvent.body,
						durationMs: observabilitySchema.observabilityEvent.durationMs,
						occurredAt: observabilitySchema.observabilityEvent.occurredAt,
					})
					.from(observabilitySchema.observabilityEvent)
					.where(
						inArray(observabilitySchema.observabilityEvent.reviewRunId, runIds),
					)
					.orderBy(observabilitySchema.observabilityEvent.occurredAt)
			: [],
		kind === "pull_request"
			? db
					.select()
					.from(dashboardSchema.reviewComment)
					.where(eq(dashboardSchema.reviewComment.pullRequestId, item.id))
					.orderBy(desc(dashboardSchema.reviewComment.createdAt))
			: [],
		kind === "pull_request"
			? db
					.select()
					.from(dashboardSchema.preMergeCheckRun)
					.where(eq(dashboardSchema.preMergeCheckRun.pullRequestId, item.id))
					.orderBy(desc(dashboardSchema.preMergeCheckRun.startedAt))
			: [],
	]);

	return {
		kind,
		item,
		repository,
		runs: runs.map((run) => ({
			...run,
			result: sanitizeRunDetails(run.result),
			traceId: run.traceId ?? run.id,
			steps: steps.filter((step) => step.reviewRunId === run.id),
			generations: generations
				.filter((generation) => generation.reviewRunId === run.id)
				.map(safeGeneration),
			events: events
				.filter((event) => event.reviewRunId === run.id)
				.map((event) => ({
					...event,
					body: event.body ? sanitizeDiagnosticText(event.body) : null,
				})),
		})),
		comments,
		checks,
	};
}

async function adapterForWorkItem(
	userId: string,
	repository: Awaited<ReturnType<typeof accessibleRepository>>,
) {
	if (!repository) return null;
	const userAdapter = await createAdapterForUserProvider({
		userId,
		providerId: repository.providerId,
	});
	if (userAdapter) return userAdapter;
	return (
		(
			await getAutomationActorForRepository({
				repositoryId: repository.id,
				providerId: repository.providerId,
			})
		)?.adapter ?? null
	);
}

export async function refreshWorkItem(input: {
	userId: string;
	organizationId: string | null;
	kind: WorkItemKind;
	repositoryId: string;
	number: number;
}) {
	const repository = await accessibleRepository(input);
	if (!repository) return null;
	const adapter = await adapterForWorkItem(input.userId, repository);
	if (!adapter)
		throw new Error(
			"No provider credentials are available for this repository.",
		);
	if (input.kind === "pull_request") {
		const pullRequest = await adapter.getPullRequest({
			repositoryPath: repository.repositoryPath,
			pullRequestNumber: input.number,
		});
		return projectPullRequestSnapshot({
			repositoryId: repository.id,
			pullRequest,
		});
	}
	const issue = await adapter.getIssue({
		repositoryPath: repository.repositoryPath,
		issueNumber: input.number,
	});
	return projectIssueSnapshot({ repositoryId: repository.id, issue });
}

export async function enqueueManualWorkItemRun(input: {
	userId: string;
	organizationId: string | null;
	kind: WorkItemKind;
	repositoryId: string;
	number: number;
	retryOfRunId?: string;
	idempotencyKey?: string;
}) {
	const detail = await getWorkItemDetail(input);
	if (!detail) return null;
	if (detail.runs.some((run) => ACTIVE_RUN_STATUSES.includes(run.status))) {
		throw new Error("This work item already has an active run.");
	}
	if (input.retryOfRunId) {
		const retryRun = detail.runs.find((run) => run.id === input.retryOfRunId);
		if (retryRun?.status !== "failed") {
			throw new Error("Only a failed run can be retried.");
		}
	}
	if (
		detail.repository.providerType !== "github" &&
		detail.repository.providerType !== "gitlab"
	) {
		throw new Error("This provider does not support AI work item runs.");
	}
	const providerType: "github" | "gitlab" = detail.repository.providerType;
	const runId = `review_run_${randomUUID()}`;
	const deliveryId = input.idempotencyKey ?? randomUUID();
	const now = new Date();
	const [queuedRun] = await db
		.insert(dashboardSchema.reviewRun)
		.values({
			id: runId,
			repositoryId: input.repositoryId,
			pullRequestId: input.kind === "pull_request" ? detail.item.id : null,
			issueId: input.kind === "issue" ? detail.item.id : null,
			requestedByUserId: input.userId,
			retryOfRunId: input.retryOfRunId ?? null,
			traceId: runId,
			reviewKind: input.kind === "pull_request" ? "review" : "labeler",
			trigger: input.retryOfRunId ? "manual-retry" : "manual",
			providerId: detail.repository.providerId,
			providerDeliveryId: deliveryId,
			providerEvent:
				input.kind === "pull_request" ? "manual_review" : "manual_labeler",
			providerAction: "requested",
			status: "queued",
			result: {},
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing()
		.returning();
	if (!queuedRun) throw new Error("This work item already has an active run.");
	const payload = {
		source: "manual" as const,
		repositoryId: input.repositoryId,
		providerType,
		targetNumber: input.number,
		requestedByUserId: input.userId,
		retryOfRunId: input.retryOfRunId,
		idempotencyKey: deliveryId,
		runId,
	};
	try {
		const event =
			input.kind === "pull_request"
				? await enqueueRepositoryReviewRunJob(payload)
				: await enqueueRepositoryLabelerRunJob(payload);
		return { queued: true, runId, event };
	} catch (error) {
		await db
			.update(dashboardSchema.reviewRun)
			.set({
				status: "failed",
				result: { error: "queue_failed" },
				completedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(dashboardSchema.reviewRun.id, runId));
		throw error;
	}
}
