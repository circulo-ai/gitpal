import { randomUUID } from "node:crypto";
import {
	enqueueRepositoryLabelerRunJob,
	enqueueRepositoryReviewRunJob,
} from "@gitpal/jobs/inngest/functions/ai-workflows";
import { type AiGeneration, repositories } from "@gitpal/repositories";
import { getAutomationActorForRepository } from "./git-provider-access";
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
	if (!organizationId) return null;
	const row = await repositories.repositoryAccess.findAccessWithRepository(
		userId,
		repositoryId,
		organizationId,
	);
	return row
		? {
				...row.repository,
				enabled: row.access.enabled,
			}
		: null;
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
	const userRepositories = await listRepositoriesForUser({
		userId,
		organizationId,
	});
	const allowed = userRepositories
		.filter((repository) => !repositoryId || repository.id === repositoryId)
		.map((repository) => repository.id);
	if (allowed.length === 0) return { items: [], total: 0, page, pageSize };
	const repositoryMap = new Map(
		userRepositories.map((repository) => [repository.id, repository]),
	);
	const normalizedQuery = query?.trim();
	const normalizedPage = Math.max(1, Math.trunc(page));
	const normalizedPageSize = Math.min(100, Math.max(1, Math.trunc(pageSize)));
	const offset = (normalizedPage - 1) * normalizedPageSize;

	if (kind === "pull_request") {
		const { items, total } = await repositories.pullRequest.searchPullRequests({
			repositoryIds: allowed,
			state,
			query: normalizedQuery,
			limit: normalizedPageSize,
			offset,
		});
		return {
			items: items.map((item) => ({
				...item,
				kind,
				repository: repositoryMap.get(item.repositoryId) ?? null,
			})),
			total,
			page: normalizedPage,
			pageSize: normalizedPageSize,
		};
	}

	const { items, total } = await repositories.issue.searchIssues({
		repositoryIds: allowed,
		state,
		query: normalizedQuery,
		limit: normalizedPageSize,
		offset,
	});
	return {
		items: items.map((item) => ({
			...item,
			kind,
			repository: repositoryMap.get(item.repositoryId) ?? null,
		})),
		total,
		page: normalizedPage,
		pageSize: normalizedPageSize,
	};
}

function safeGeneration(generation: AiGeneration) {
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
	const item =
		kind === "pull_request"
			? await repositories.pullRequest.findByNumber(repositoryId, number)
			: await repositories.issue.findByNumber(repositoryId, number);

	if (!item) return null;

	const runs =
		kind === "pull_request"
			? await repositories.reviewRun.listAllByPullRequest(item.id)
			: await repositories.reviewRun.listAllByIssue(item.id);
	const runIds = runs.map((run) => run.id);
	const [steps, generations, events, comments, checks] = await Promise.all([
		repositories.reviewRunStep.listByReviewRunIds(runIds),
		repositories.aiGeneration.listByReviewRunIds(runIds),
		repositories.observabilityEvent.listByReviewRunIds(runIds),
		kind === "pull_request"
			? repositories.reviewComment.listAllByPullRequest(item.id)
			: Promise.resolve([]),
		kind === "pull_request"
			? repositories.preMergeCheckRun.listByPullRequest(item.id)
			: Promise.resolve([]),
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
	repository: Awaited<ReturnType<typeof accessibleRepository>>,
) {
	if (!repository) return null;
	// App/installation-only: automation credentials always come from the
	// provider App installation resolved for this repository. We never fall back
	// to the OAuth login token the user authenticated to GitPal with.
	const automationActor = await getAutomationActorForRepository({
		repositoryId: repository.id,
		providerId: repository.providerId,
	});
	return automationActor?.adapter ?? null;
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
	const adapter = await adapterForWorkItem(repository);
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
	const queuedRun = await repositories.reviewRun.createQueuedRun({
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
	});
	if (!queuedRun) throw new Error("This work item already has an active run.");
	const payload = {
		source: "manual" as const,
		repositoryId: input.repositoryId,
		providerType,
		targetNumber: input.number,
		targetKind: input.kind,
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
		await repositories.reviewRun.updateById(runId, {
			status: "failed",
			result: { error: "queue_failed" },
			completedAt: new Date(),
			updatedAt: new Date(),
		});
		throw error;
	}
}
