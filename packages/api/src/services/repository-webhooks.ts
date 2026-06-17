import { randomUUID } from "node:crypto";
import { createDb } from "@gitpal/db";
import * as authSchema from "@gitpal/db/schema/auth";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import { env } from "@gitpal/env/server";
import {
	createGitHubAdapter,
	createGitLabAdapter,
	type GitProviderAdapter,
	type GitPullRequest,
	type GitRepository,
	type GitWebhookEnvelope,
} from "@gitpal/git";
import {
	enqueueProviderWebhookReceiptJob,
	type ProviderWebhookJobData,
	providerWebhookJobSchema,
} from "@gitpal/jobs";
import { createLogger } from "@gitpal/logger";
import type { WorkspaceSettings } from "@gitpal/utils";
import { and, desc, eq, inArray } from "drizzle-orm";

import {
	createAdapterFromAccount,
	type EnterpriseProvider,
	type GitAccount,
	getAutomationActorForRepository,
	getEnterpriseProviderMap,
} from "./git-provider-access";
import { runRepositoryLabeler } from "./labeler";
import {
	type RepositoryReviewOutput,
	runRepositoryReview,
} from "./review-agent";
import { getRepositoryWorkspaceSettings } from "./workspace-settings";

const db = createDb();
const log = createLogger("repository-webhooks");
const ENTERPRISE_GIT_PROVIDER_PREFIX = "enterprise-git:";
const GITHUB_WEBHOOK_EVENTS = [
	"issues",
	"pull_request",
	"pull_request_review",
	"pull_request_review_comment",
	"issue_comment",
] as const;
const GITLAB_WEBHOOK_EVENTS = ["pull_request", "issue", "note"] as const;
const COMMENT_WEBHOOK_EVENTS = new Set([
	"issue_comment",
	"pull_request_review_comment",
	"pull_request_review",
	"note",
]);
const PULL_REQUEST_OPEN_ACTIONS = new Set([
	"opened",
	"reopened",
	"open",
	"reopen",
]);
const PULL_REQUEST_PUSH_ACTIONS = new Set([
	"synchronize",
	"synchronized",
	"update",
]);

type RepositoryRow = typeof dashboardSchema.repository.$inferSelect;
type PullRequestRow = typeof dashboardSchema.pullRequest.$inferSelect;
type WebhookEventReceiptRow =
	typeof dashboardSchema.webhookEventReceipt.$inferSelect;
type ReviewDispatchKind = "review" | "mention" | "pre-merge";
type WebhookReviewKind = ReviewDispatchKind | "labeler";
type ProviderType = "github" | "gitlab";
type WebhookReceiptStatus =
	| "received"
	| "processing"
	| "processed"
	| "processed_with_errors"
	| "ignored"
	| "failed";
type WebhookProcessingResult = "processed" | "failed" | "ignored";

type ProviderWebhookTarget = {
	providerId: string;
	providerType: ProviderType;
	label: string;
	baseUrl: string | null;
	apiBaseUrl: string | null;
	secret: string | null;
	routePath: string;
};

type RepositoryWebhookSyncResult = {
	created: number;
	existing: number;
	skipped: number;
	failed: number;
	errors: string[];
};

type WebhookReceiptResult = {
	receiptId: string;
	duplicate: boolean;
};

type PullRequestEventContext = {
	pullRequestNumber: number | null;
	labels: string[];
	commentBody: string | null;
	reviewState: string | null;
	headSha: string | null;
	baseSha: string | null;
	isPullRequestCommentEvent: boolean;
};

type LabelEventContext = {
	kind: "issue" | "pull_request";
	number: number | null;
	title: string;
	body: string | null;
	labels: string[];
	isDraft: boolean;
};

type ReviewDispatch = {
	kind: ReviewDispatchKind;
	trigger: string;
	manual: boolean;
};

type LabelDispatch = {
	kind: "issue" | "pull_request";
	trigger: string;
	manual: boolean;
};

const REQUIRED_WEBHOOK_EVENTS_BY_PROVIDER = {
	github: GITHUB_WEBHOOK_EVENTS,
	gitlab: GITLAB_WEBHOOK_EVENTS,
} satisfies Record<ProviderType, readonly string[]>;

function normalizeWebhookUrl(url: string) {
	return url.trim().replace(/\/+$/, "");
}

function normalizeText(value: string) {
	return value.trim().toLowerCase();
}

function toDateOrNull(value: string | null | undefined) {
	if (!value) {
		return null;
	}

	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asString(value: unknown) {
	return typeof value === "string" ? value : null;
}

function asNumber(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getWebhookBaseUrl() {
	return env.GITPAL_WEBHOOK_BASE_URL ?? env.BETTER_AUTH_URL;
}

function formatSecretPreview(secret: string) {
	if (secret.length <= 6) {
		return "*".repeat(secret.length);
	}

	return `${secret.slice(0, 4)}...${secret.slice(-2)}`;
}

function getRequiredWebhookEvents(providerType: ProviderType) {
	return [...REQUIRED_WEBHOOK_EVENTS_BY_PROVIDER[providerType]];
}

function isCommentWebhookEvent(event: string) {
	return COMMENT_WEBHOOK_EVENTS.has(event);
}

function isPullRequestOpenAction(action: string) {
	return PULL_REQUEST_OPEN_ACTIONS.has(action);
}

function isPullRequestPushAction(action: string) {
	return PULL_REQUEST_PUSH_ACTIONS.has(action);
}

function resolveWebhookReceiptStatus({
	processed,
	failed,
}: {
	processed: number;
	failed: number;
}): WebhookReceiptStatus {
	if (failed > 0 && processed > 0) {
		return "processed_with_errors";
	}

	if (failed > 0) {
		return "failed";
	}

	if (processed > 0) {
		return "processed";
	}

	return "ignored";
}

function buildDeliveryUrl(target: ProviderWebhookTarget) {
	return new URL(target.routePath, getWebhookBaseUrl()).toString();
}

function createWebhookVerifier(target: ProviderWebhookTarget) {
	const webhookSecrets = target.secret ? [target.secret] : [];

	if (target.providerType === "github") {
		return createGitHubAdapter({
			providerId: target.providerId,
			label: target.label,
			authBaseUrl: target.baseUrl ?? undefined,
			apiBaseUrl: target.apiBaseUrl ?? undefined,
			webhookSecrets,
		}).webhooks;
	}

	return createGitLabAdapter({
		providerId: target.providerId,
		label: target.label,
		baseUrl: target.baseUrl ?? undefined,
		apiBaseUrl: target.apiBaseUrl ?? undefined,
		webhookSecrets,
	}).webhooks;
}

async function resolveWebhookTarget(
	providerId: string,
	enterpriseProviders?: Map<string, EnterpriseProvider>,
): Promise<ProviderWebhookTarget | null> {
	if (providerId === "github") {
		return {
			providerId,
			providerType: "github",
			label: "GitHub",
			baseUrl: null,
			apiBaseUrl: null,
			secret: env.GITHUB_WEBHOOK_SECRET ?? null,
			routePath: "/webhooks/github",
		};
	}

	if (providerId === "gitlab") {
		return {
			providerId,
			providerType: "gitlab",
			label: "GitLab",
			baseUrl: "https://gitlab.com",
			apiBaseUrl: "https://gitlab.com/api/v4",
			secret: env.GITLAB_WEBHOOK_SECRET ?? null,
			routePath: "/webhooks/gitlab",
		};
	}

	if (!providerId.startsWith(ENTERPRISE_GIT_PROVIDER_PREFIX)) {
		return null;
	}

	const enterpriseProviderKey = providerId.slice(
		ENTERPRISE_GIT_PROVIDER_PREFIX.length,
	);
	const providers = enterpriseProviders ?? (await getEnterpriseProviderMap());
	const provider = providers.get(enterpriseProviderKey);

	if (!provider || (provider.type !== "github" && provider.type !== "gitlab")) {
		return null;
	}

	return {
		providerId,
		providerType: provider.type,
		label: provider.name,
		baseUrl: provider.baseUrl,
		apiBaseUrl: provider.apiBaseUrl,
		secret: provider.webhookSecret ?? null,
		routePath: `/webhooks/enterprise/${enterpriseProviderKey}`,
	};
}

function extractLabelNames(value: unknown) {
	if (!Array.isArray(value)) {
		return [] as string[];
	}

	return value
		.flatMap((item) => {
			if (typeof item === "string") {
				return [item];
			}

			const record = asRecord(item);
			const name = record ? asString(record.name) : null;
			return name ? [name] : [];
		})
		.filter(Boolean);
}

function extractGitHubContext(
	payload: Record<string, unknown>,
): PullRequestEventContext {
	const pullRequest = asRecord(payload.pull_request);
	const issue = asRecord(payload.issue);
	const comment = asRecord(payload.comment);
	const review = asRecord(payload.review);
	const issuePullRequest = issue ? asRecord(issue.pull_request) : null;
	const head = pullRequest ? asRecord(pullRequest.head) : null;
	const base = pullRequest ? asRecord(pullRequest.base) : null;

	return {
		pullRequestNumber:
			asNumber(pullRequest?.number) ??
			(issuePullRequest ? asNumber(issue?.number) : null),
		labels: extractLabelNames(pullRequest?.labels),
		commentBody: asString(comment?.body) ?? asString(review?.body),
		reviewState: asString(review?.state),
		headSha: asString(head?.sha),
		baseSha: asString(base?.sha),
		isPullRequestCommentEvent: Boolean(issuePullRequest || pullRequest),
	};
}

function extractGitLabContext(
	payload: Record<string, unknown>,
): PullRequestEventContext {
	const objectAttributes = asRecord(payload.object_attributes);
	const mergeRequest = asRecord(payload.merge_request);
	const lastCommit =
		asRecord(objectAttributes?.last_commit) ??
		asRecord(mergeRequest?.last_commit);
	const noteableType = asString(objectAttributes?.noteable_type);

	return {
		pullRequestNumber:
			asNumber(objectAttributes?.iid) ??
			asNumber(mergeRequest?.iid) ??
			asNumber(objectAttributes?.noteable_iid),
		labels: [
			...extractLabelNames(objectAttributes?.labels),
			...extractLabelNames(mergeRequest?.labels),
		],
		commentBody:
			asString(objectAttributes?.note) ??
			asString(objectAttributes?.description),
		reviewState: asString(objectAttributes?.state),
		headSha: asString(lastCommit?.id),
		baseSha: null,
		isPullRequestCommentEvent:
			noteableType === "MergeRequest" || Boolean(mergeRequest),
	};
}

function extractPullRequestContext(
	providerType: ProviderType,
	envelope: GitWebhookEnvelope,
) {
	const payload = asRecord(envelope.payload) ?? {};
	return providerType === "github"
		? extractGitHubContext(payload)
		: extractGitLabContext(payload);
}

function extractGitHubLabelContext(
	payload: Record<string, unknown>,
	event: string,
): LabelEventContext | null {
	if (event !== "pull_request" && event !== "issues") {
		return null;
	}

	const issue = asRecord(payload.issue);
	const pullRequest = asRecord(payload.pull_request);
	const issuePullRequest = issue ? asRecord(issue.pull_request) : null;

	if (event === "issues" && issuePullRequest) {
		return null;
	}

	const isPullRequest = event === "pull_request";
	const source = isPullRequest ? pullRequest ?? issue : issue;

	if (!source) {
		return null;
	}

	return {
		kind: isPullRequest ? "pull_request" : "issue",
		number:
			asNumber(source.number) ?? asNumber(issue?.number) ?? asNumber(pullRequest?.number),
		title: asString(source.title) ?? "",
		body: asString(source.body),
		labels: extractLabelNames(source.labels),
		isDraft: Boolean(pullRequest?.draft),
	};
}

function extractGitLabLabelContext(
	payload: Record<string, unknown>,
	event: string,
): LabelEventContext | null {
	if (event !== "pull_request" && event !== "issue") {
		return null;
	}

	const objectAttributes = asRecord(payload.object_attributes);
	const mergeRequest = asRecord(payload.merge_request);
	const issue = asRecord(payload.issue);
	const isPullRequest = event === "pull_request";
	const source = isPullRequest
		? mergeRequest ?? objectAttributes ?? issue
		: issue ?? objectAttributes;

	if (!source) {
		return null;
	}

	const labels = isPullRequest
		? [...extractLabelNames(objectAttributes?.labels), ...extractLabelNames(mergeRequest?.labels)]
		: [...extractLabelNames(objectAttributes?.labels), ...extractLabelNames(issue?.labels)];

	return {
		kind: isPullRequest ? "pull_request" : "issue",
		number:
			asNumber(objectAttributes?.iid) ??
			asNumber(mergeRequest?.iid) ??
			asNumber(issue?.iid) ??
			asNumber(objectAttributes?.noteable_iid),
		title: asString(source.title) ?? "",
		body: asString(source.description) ?? asString(objectAttributes?.description),
		labels,
		isDraft: Boolean(
			mergeRequest?.draft ?? objectAttributes?.work_in_progress ?? false,
		),
	};
}

function extractLabelContext(
	providerType: ProviderType,
	envelope: GitWebhookEnvelope,
): LabelEventContext | null {
	const payload = asRecord(envelope.payload) ?? {};
	return providerType === "github"
		? extractGitHubLabelContext(payload, envelope.event)
		: extractGitLabLabelContext(payload, envelope.event);
}

function resolveLabelDispatch({
	providerType,
	envelope,
	settings,
	context,
}: {
	providerType: ProviderType;
	envelope: GitWebhookEnvelope;
	settings: WorkspaceSettings;
	context: LabelEventContext;
}): LabelDispatch | null {
	if (!settings.ai.labeler.enabled || !context.number) {
		return null;
	}

	const normalizedAction = envelope.action?.toLowerCase() ?? "";

	if (context.kind === "pull_request") {
		if (
			isPullRequestOpenAction(normalizedAction) ||
			(providerType === "github" && normalizedAction === "ready_for_review")
		) {
			return {
				kind: "pull_request",
				trigger: normalizedAction || "pull_request",
				manual: false,
			};
		}

		return null;
	}

	if (isPullRequestOpenAction(normalizedAction)) {
		return {
			kind: "issue",
			trigger: normalizedAction || "issue",
			manual: false,
		};
	}

	return null;
}

function matchesCommandTrigger(
	body: string | null,
	settings:
		| WorkspaceSettings["webhooks"]["mentions"]
		| WorkspaceSettings["webhooks"]["preMerge"],
) {
	if (!body || !settings.enabled) {
		return false;
	}

	const normalizedBody = normalizeText(body);
	const hasAlias =
		settings.aliases.length === 0 ||
		settings.aliases.some((alias) =>
			normalizedBody.includes(normalizeText(alias)),
		);
	const hasCommand =
		settings.commands.length === 0 ||
		settings.commands.some((command) =>
			normalizedBody.includes(normalizeText(command)),
		);

	return hasAlias && hasCommand;
}

function shouldRunAutomatedReview({
	pullRequest,
	settings,
	labels,
}: {
	pullRequest: GitPullRequest;
	settings: WorkspaceSettings;
	labels: string[];
}) {
	const autoReview = settings.reviews.behavior.autoReview;

	if (
		autoReview.baseBranches.length > 0 &&
		!autoReview.baseBranches.includes(pullRequest.targetBranch)
	) {
		return false;
	}

	if (autoReview.skipDrafts && pullRequest.draft) {
		return false;
	}

	if (
		autoReview.labels.length > 0 &&
		labels.length > 0 &&
		!autoReview.labels.some((label) => labels.includes(label))
	) {
		return false;
	}

	if (
		autoReview.skipLabels.length > 0 &&
		labels.some((label) => autoReview.skipLabels.includes(label))
	) {
		return false;
	}

	return true;
}

function getConfiguredPullRequestActions(
	providerType: ProviderType,
	settings: WorkspaceSettings,
) {
	return providerType === "github"
		? settings.webhooks.pullRequests
		: settings.webhooks.mergeRequests;
}

function resolveReviewDispatch({
	providerType,
	envelope,
	pullRequest,
	settings,
	context,
}: {
	providerType: ProviderType;
	envelope: GitWebhookEnvelope;
	pullRequest: GitPullRequest;
	settings: WorkspaceSettings;
	context: PullRequestEventContext;
}): ReviewDispatch | null {
	if (!settings.ai.reviewer.enabled && !settings.preMergeChecks.enabled) {
		return null;
	}

	const isCommentEvent = isCommentWebhookEvent(envelope.event);

	if (isCommentEvent && !context.isPullRequestCommentEvent) {
		return null;
	}

	if (
		isCommentEvent &&
		settings.preMergeChecks.enabled &&
		matchesCommandTrigger(context.commentBody, settings.webhooks.preMerge)
	) {
		return {
			kind: "pre-merge",
			trigger: "comment-command",
			manual: true,
		};
	}

	if (
		isCommentEvent &&
		settings.reviews.behavior.autoReview.onMention &&
		matchesCommandTrigger(context.commentBody, settings.webhooks.mentions)
	) {
		return {
			kind: "mention",
			trigger: "mention-command",
			manual: true,
		};
	}

	if (
		providerType === "github" &&
		envelope.event === "pull_request_review" &&
		context.reviewState === "approved" &&
		settings.preMergeChecks.enabled &&
		settings.webhooks.preMerge.enabled &&
		shouldRunAutomatedReview({
			pullRequest,
			settings,
			labels: context.labels,
		})
	) {
		return {
			kind: "pre-merge",
			trigger: "review-approved",
			manual: false,
		};
	}

	if (envelope.event !== "pull_request" || !envelope.action) {
		return null;
	}

	const configuredActions = getConfiguredPullRequestActions(
		providerType,
		settings,
	);
	const normalizedAction = envelope.action.toLowerCase();

	if (
		!configuredActions.enabled ||
		!configuredActions.actions.includes(normalizedAction)
	) {
		return null;
	}

	if (
		!shouldRunAutomatedReview({
			pullRequest,
			settings,
			labels: context.labels,
		})
	) {
		return null;
	}

	if (isPullRequestOpenAction(normalizedAction)) {
		return settings.reviews.behavior.autoReview.onOpen
			? {
					kind: "review",
					trigger: normalizedAction,
					manual: false,
				}
			: null;
	}

	if (isPullRequestPushAction(normalizedAction)) {
		return settings.reviews.behavior.autoReview.onPush
			? {
					kind: "review",
					trigger: normalizedAction,
					manual: false,
				}
			: null;
	}

	if (normalizedAction === "ready_for_review") {
		return settings.reviews.behavior.autoReview.onReadyForReview
			? {
					kind: "review",
					trigger: normalizedAction,
					manual: false,
				}
			: null;
	}

	if (
		normalizedAction === "approved" &&
		settings.preMergeChecks.enabled &&
		settings.webhooks.preMerge.enabled
	) {
		return {
			kind: "pre-merge",
			trigger: normalizedAction,
			manual: false,
		};
	}

	return null;
}

async function findRepositoriesForWebhook({
	providerId,
	repositoryPath,
}: {
	providerId: string;
	repositoryPath: string;
}) {
	return db
		.select()
		.from(dashboardSchema.repository)
		.where(
			and(
				eq(dashboardSchema.repository.providerId, providerId),
				eq(dashboardSchema.repository.repositoryPath, repositoryPath),
			),
		);
}

async function updateRepositoryWebhookHeartbeat(repositoryIds: string[]) {
	if (repositoryIds.length === 0) {
		return;
	}

	const now = new Date();
	await db
		.update(dashboardSchema.repositoryWebhook)
		.set({
			verifiedAt: now,
			lastDeliveredAt: now,
			updatedAt: now,
		})
		.where(
			inArray(dashboardSchema.repositoryWebhook.repositoryId, repositoryIds),
		);
}

async function createWebhookReceipt({
	providerId,
	deliveryId,
	repositoryId,
	repositoryPath,
	event,
	action,
	payload,
}: {
	providerId: string;
	deliveryId: string | null;
	repositoryId: string | null;
	repositoryPath: string | null;
	event: string;
	action: string | null;
	payload: Record<string, unknown>;
}): Promise<WebhookReceiptResult> {
	const now = new Date();

	if (deliveryId) {
		const inserted = await db
			.insert(dashboardSchema.webhookEventReceipt)
			.values({
				id: `webhook_receipt_${randomUUID()}`,
				repositoryId,
				providerId,
				deliveryId,
				repositoryPath,
				event,
				action,
				status: "received",
				payload,
				receivedAt: now,
				updatedAt: now,
			})
			.onConflictDoNothing({
				target: [
					dashboardSchema.webhookEventReceipt.providerId,
					dashboardSchema.webhookEventReceipt.deliveryId,
				],
			})
			.returning({
				id: dashboardSchema.webhookEventReceipt.id,
			});

		if (inserted[0]) {
			return {
				receiptId: inserted[0].id,
				duplicate: false,
			};
		}

		const [existing] = await db
			.select({
				id: dashboardSchema.webhookEventReceipt.id,
			})
			.from(dashboardSchema.webhookEventReceipt)
			.where(
				and(
					eq(dashboardSchema.webhookEventReceipt.providerId, providerId),
					eq(dashboardSchema.webhookEventReceipt.deliveryId, deliveryId),
				),
			)
			.limit(1);

		if (!existing) {
			throw new Error("Webhook receipt conflict could not be resolved.");
		}

		return {
			receiptId: existing.id,
			duplicate: true,
		};
	}

	const [receipt] = await db
		.insert(dashboardSchema.webhookEventReceipt)
		.values({
			id: `webhook_receipt_${randomUUID()}`,
			repositoryId,
			providerId,
			deliveryId: `no-delivery-id:${randomUUID()}`,
			repositoryPath,
			event,
			action,
			status: "received",
			payload,
			receivedAt: now,
			updatedAt: now,
		})
		.returning({
			id: dashboardSchema.webhookEventReceipt.id,
		});

	if (!receipt) {
		throw new Error("Webhook receipt could not be created.");
	}

	return {
		receiptId: receipt.id,
		duplicate: false,
	};
}

async function updateWebhookReceipt({
	receiptId,
	status,
}: {
	receiptId: string;
	status: WebhookReceiptStatus;
}) {
	const now = new Date();

	await db
		.update(dashboardSchema.webhookEventReceipt)
		.set({
			status,
			processedAt:
				status === "processing" || status === "received" ? null : now,
			updatedAt: now,
		})
		.where(eq(dashboardSchema.webhookEventReceipt.id, receiptId));
}

async function upsertPullRequestSnapshot({
	repositoryId,
	pullRequest,
}: {
	repositoryId: string;
	pullRequest: GitPullRequest;
}) {
	const updatedAt = toDateOrNull(pullRequest.updatedAt) ?? new Date();
	const createdAt = toDateOrNull(pullRequest.createdAt) ?? updatedAt;
	const mergedAt = toDateOrNull(pullRequest.mergedAt);
	const closedAt = toDateOrNull(pullRequest.closedAt);
	const reviewReadyAt = pullRequest.draft ? null : updatedAt;

	const [row] = await db
		.insert(dashboardSchema.pullRequest)
		.values({
			id: `pull_request_${randomUUID()}`,
			repositoryId,
			providerPullRequestId: pullRequest.id,
			number: pullRequest.number,
			title: pullRequest.title,
			state: pullRequest.state,
			draft: pullRequest.draft,
			htmlUrl: pullRequest.htmlUrl,
			sourceBranch: pullRequest.sourceBranch,
			targetBranch: pullRequest.targetBranch,
			authorLogin: pullRequest.author?.login,
			authorName: pullRequest.author?.name,
			authorAvatarUrl: pullRequest.author?.avatarUrl,
			createdAt,
			updatedAt,
			mergedAt,
			closedAt,
			lastCommitAt: updatedAt,
			reviewReadyAt,
			mergeCommitSha: pullRequest.mergeCommitSha,
		})
		.onConflictDoUpdate({
			target: [
				dashboardSchema.pullRequest.repositoryId,
				dashboardSchema.pullRequest.number,
			],
			set: {
				providerPullRequestId: pullRequest.id,
				title: pullRequest.title,
				state: pullRequest.state,
				draft: pullRequest.draft,
				htmlUrl: pullRequest.htmlUrl,
				sourceBranch: pullRequest.sourceBranch,
				targetBranch: pullRequest.targetBranch,
				authorLogin: pullRequest.author?.login,
				authorName: pullRequest.author?.name,
				authorAvatarUrl: pullRequest.author?.avatarUrl,
				updatedAt,
				mergedAt,
				closedAt,
				lastCommitAt: updatedAt,
				reviewReadyAt,
				mergeCommitSha: pullRequest.mergeCommitSha,
			},
		})
		.returning();

	if (!row) {
		throw new Error("Pull request snapshot could not be stored.");
	}

	return row;
}

async function createReviewRun({
	repository,
	pullRequest,
	envelope,
	reviewKind,
	trigger,
	modelId,
	thinkingEnabled,
}: {
	repository: RepositoryRow;
	pullRequest: PullRequestRow | null;
	envelope: GitWebhookEnvelope;
	reviewKind: WebhookReviewKind;
	trigger: string;
	modelId: string;
	thinkingEnabled: boolean;
}) {
	const now = new Date();

	const [row] = await db
		.insert(dashboardSchema.reviewRun)
		.values({
			id: `review_run_${randomUUID()}`,
			repositoryId: repository.id,
			pullRequestId: pullRequest?.id ?? null,
			reviewKind,
			trigger,
			providerId: repository.providerId,
			providerDeliveryId: envelope.deliveryId,
			providerEvent: envelope.event,
			providerAction: envelope.action,
			status: "running",
			modelId,
			thinkingEnabled,
			startedAt: now,
			createdAt: now,
			updatedAt: now,
		})
		.returning();

	if (!row) {
		throw new Error("Review run could not be created.");
	}

	return row;
}

async function finalizeReviewRun({
	reviewRunId,
	status,
	summary,
	finalCommentBody,
	result,
}: {
	reviewRunId: string;
	status: string;
	summary: string | null;
	finalCommentBody: string | null;
	result: Record<string, unknown>;
}) {
	const now = new Date();

	await db
		.update(dashboardSchema.reviewRun)
		.set({
			status,
			summary,
			finalCommentBody,
			result,
			completedAt: now,
			updatedAt: now,
		})
		.where(eq(dashboardSchema.reviewRun.id, reviewRunId));
}

function formatFindingBody(
	finding: RepositoryReviewOutput["findings"][number],
) {
	return `**${finding.severity.toUpperCase()}** · ${finding.title}\n\n${finding.body}`;
}

function buildLabelerSummaryMarkdown({
	summary,
	suggestedLabels,
	appliedLabels,
}: {
	summary: string;
	suggestedLabels: string[];
	appliedLabels: string[];
}) {
	const sections: string[] = [];

	if (summary.trim()) {
		sections.push(`## Label summary\n${summary.trim()}`);
	}

	if (suggestedLabels.length > 0) {
		sections.push(
			`## Suggested labels\n${suggestedLabels.map((label) => `- ${label}`).join("\n")}`,
		);
	}

	if (appliedLabels.length > 0) {
		sections.push(
			`## Applied labels\n${appliedLabels.map((label) => `- ${label}`).join("\n")}`,
		);
	}

	return sections.join("\n\n");
}

async function listSuggestedReviewersForRepository(repositoryId: string) {
	const rows = await db
		.select({
			access: dashboardSchema.repositoryAccess,
			user: authSchema.user,
		})
		.from(dashboardSchema.repositoryAccess)
		.innerJoin(
			dashboardSchema.repository,
			eq(
				dashboardSchema.repositoryAccess.repositoryId,
				dashboardSchema.repository.id,
			),
		)
		.innerJoin(
			authSchema.user,
			eq(authSchema.user.id, dashboardSchema.repositoryAccess.userId),
		)
		.where(
			and(
				eq(dashboardSchema.repositoryAccess.repositoryId, repositoryId),
				eq(dashboardSchema.repositoryAccess.enabled, true),
			),
		)
		.orderBy(desc(dashboardSchema.repositoryAccess.lastSeenAt))
		.limit(3);

	return rows
		.map(({ user }) => user.name?.trim() || user.email.split("@")[0] || user.id)
		.filter(Boolean);
}

function toGitRepository(repository: RepositoryRow): GitRepository {
	return {
		providerId: repository.providerId,
		repositoryPath: repository.repositoryPath,
		repositoryId: repository.repositoryId,
		name: repository.name,
		fullName: repository.fullName,
		htmlUrl: repository.htmlUrl,
		defaultBranch: repository.defaultBranch,
		private: repository.private,
		description: repository.description,
		owner: repository.ownerLogin
			? {
					id: repository.ownerLogin,
					login: repository.ownerLogin,
					name: repository.ownerLogin,
					email: null,
					avatarUrl: repository.ownerAvatarUrl,
					htmlUrl: null,
					kind: "user",
				}
			: null,
		workspace: null,
	};
}

async function maybePublishSummaryComment({
	adapter,
	repository,
	pullRequest,
	settings,
	dispatch,
	commentMarkdown,
}: {
	adapter: GitProviderAdapter;
	repository: RepositoryRow;
	pullRequest: GitPullRequest;
	settings: WorkspaceSettings;
	dispatch: ReviewDispatch;
	commentMarkdown: string;
}) {
	const shouldPublish =
		dispatch.kind === "pre-merge"
			? settings.statuses.publishPreMergeSummary
			: settings.statuses.publishReviewSummary;

	if (!shouldPublish || !settings.ai.reviewer.postSummaryComment) {
		return null;
	}

	const comment = await adapter.createComment({
		repositoryPath: repository.repositoryPath,
		pullRequestNumber: pullRequest.number,
		body: commentMarkdown,
	});

	return comment;
}

async function createReviewCommentRecords({
	reviewRunId,
	repository,
	pullRequest,
	settings,
	adapter,
	headSha,
	baseSha,
	output,
}: {
	reviewRunId: string;
	repository: RepositoryRow;
	pullRequest: PullRequestRow;
	settings: WorkspaceSettings;
	adapter: GitProviderAdapter;
	headSha: string | null;
	baseSha: string | null;
	output: RepositoryReviewOutput;
}) {
	for (const finding of output.findings) {
		let providerCommentId: string | null = null;
		const now = new Date();

		if (
			settings.ai.reviewer.postInlineFindings &&
			repository.providerType === "github" &&
			finding.filePath &&
			finding.line &&
			headSha
		) {
			try {
				const inlineComment = await adapter.createComment({
					repositoryPath: repository.repositoryPath,
					pullRequestNumber: pullRequest.number,
					body: formatFindingBody(finding),
					path: finding.filePath,
					line: finding.line,
					commitSha: headSha,
					baseSha: baseSha ?? undefined,
					headSha,
				});
				providerCommentId = inlineComment.id;
			} catch {
				providerCommentId = null;
			}
		}

		await db.insert(dashboardSchema.reviewComment).values({
			id: `review_comment_${randomUUID()}`,
			reviewRunId,
			pullRequestId: pullRequest.id,
			repositoryId: repository.id,
			providerCommentId,
			authorType: "ai",
			authorLogin: "gitpal",
			severity: finding.severity,
			category: finding.category,
			title: finding.title,
			body: finding.body,
			filePath: finding.filePath,
			line: finding.line,
			startLine: finding.line,
			metadata: {},
			accepted: false,
			resolved: false,
			createdAt: now,
			updatedAt: now,
		});
	}
}

async function createPreMergeCheckRecords({
	reviewRunId,
	repository,
	pullRequest,
	output,
}: {
	reviewRunId: string;
	repository: RepositoryRow;
	pullRequest: PullRequestRow;
	output: RepositoryReviewOutput;
}) {
	for (const check of output.preMergeChecks) {
		const now = new Date();

		await db.insert(dashboardSchema.preMergeCheckRun).values({
			id: `pre_merge_check_${randomUUID()}`,
			reviewRunId,
			repositoryId: repository.id,
			pullRequestId: pullRequest.id,
			checkName: check.name,
			checkType: "ai",
			status: check.status,
			details: {
				details: check.details,
			},
			startedAt: now,
			completedAt: now,
		});
	}
}

async function runWebhookReview({
	repository,
	envelope,
	providerType,
	context,
}: {
	repository: RepositoryRow;
	envelope: GitWebhookEnvelope;
	providerType: ProviderType;
	context: PullRequestEventContext;
}): Promise<WebhookProcessingResult> {
	const automationActor = await getAutomationActorForRepository({
		repositoryId: repository.id,
		providerId: repository.providerId,
	});

	if (!automationActor || !context.pullRequestNumber) {
		return "ignored" as const;
	}

	const settingsResult = await getRepositoryWorkspaceSettings({
		organizationId: repository.organizationId,
		repositoryId: repository.id,
		userId: automationActor.userId,
	});

	if (!settingsResult) {
		return "ignored" as const;
	}

	const settings = settingsResult.effectiveSettings;
	const pullRequest = await automationActor.adapter.getPullRequest({
		repositoryPath: repository.repositoryPath,
		pullRequestNumber: context.pullRequestNumber,
	});
	const dispatch = resolveReviewDispatch({
		providerType,
		envelope,
		pullRequest,
		settings,
		context,
	});

	if (!dispatch) {
		return "ignored" as const;
	}

	if (dispatch.kind !== "pre-merge" && !settings.ai.reviewer.enabled) {
		return "ignored" as const;
	}

	const pullRequestRow = await upsertPullRequestSnapshot({
		repositoryId: repository.id,
		pullRequest,
	});
	const reviewRun = await createReviewRun({
		repository,
		envelope,
		pullRequest: pullRequestRow,
		reviewKind: dispatch.kind,
		trigger: dispatch.trigger,
		modelId: settings.ai.reviewer.modelId,
		thinkingEnabled: settings.ai.thinking.enabled,
	});

	try {
		const [files, comments] = await Promise.all([
			automationActor.adapter.listPullRequestFiles({
				repositoryPath: repository.repositoryPath,
				pullRequestNumber: pullRequest.number,
			}),
			automationActor.adapter.listPullRequestComments({
				repositoryPath: repository.repositoryPath,
				pullRequestNumber: pullRequest.number,
			}),
		]);
		const suggestedReviewers = await listSuggestedReviewersForRepository(
			repository.id,
		);
		const reviewResult = await runRepositoryReview({
			userId: automationActor.userId,
			adapter: automationActor.adapter,
			repository: toGitRepository(repository),
			pullRequest,
			files,
			comments,
			settings,
			kind: dispatch.kind,
			suggestedReviewers,
		});

		await maybePublishSummaryComment({
			adapter: automationActor.adapter,
			repository,
			pullRequest,
			settings,
			dispatch,
			commentMarkdown: reviewResult.commentMarkdown,
		});
		await createReviewCommentRecords({
			reviewRunId: reviewRun.id,
			repository,
			pullRequest: pullRequestRow,
			settings,
			adapter: automationActor.adapter,
			headSha: context.headSha,
			baseSha: context.baseSha,
			output: reviewResult.output,
		});
		await createPreMergeCheckRecords({
			reviewRunId: reviewRun.id,
			repository,
			pullRequest: pullRequestRow,
			output: reviewResult.output,
		});
		await finalizeReviewRun({
			reviewRunId: reviewRun.id,
			status: "completed",
			summary: reviewResult.output.summary,
			finalCommentBody: reviewResult.commentMarkdown,
			result: {
				output: reviewResult.output,
				commentMarkdown: reviewResult.commentMarkdown,
				poem: reviewResult.poem,
				suggestedReviewers,
				text: reviewResult.text,
				stepCount: reviewResult.steps.length,
			},
		});

		return "processed" as const;
	} catch (error) {
		await finalizeReviewRun({
			reviewRunId: reviewRun.id,
			status: "failed",
			summary: null,
			finalCommentBody: null,
			result: {
				error: error instanceof Error ? error.message : "review_failed",
			},
		});
		return "failed" as const;
	}
}

async function runWebhookLabeler({
	repository,
	envelope,
	providerType,
}: {
	repository: RepositoryRow;
	envelope: GitWebhookEnvelope;
	providerType: ProviderType;
}): Promise<WebhookProcessingResult> {
	const automationActor = await getAutomationActorForRepository({
		repositoryId: repository.id,
		providerId: repository.providerId,
	});

	if (!automationActor) {
		return "ignored" as const;
	}

	const settingsResult = await getRepositoryWorkspaceSettings({
		organizationId: repository.organizationId,
		repositoryId: repository.id,
		userId: automationActor.userId,
	});

	if (!settingsResult) {
		return "ignored" as const;
	}

	const settings = settingsResult.effectiveSettings;
	const labelContext = extractLabelContext(providerType, envelope);
	if (!labelContext || !labelContext.number) {
		return "ignored" as const;
	}

	const dispatch = resolveLabelDispatch({
		providerType,
		envelope,
		settings,
		context: labelContext,
	});

	if (!dispatch) {
		return "ignored" as const;
	}

	const repositoryLabels = await automationActor.adapter.listRepositoryLabels({
		repositoryPath: repository.repositoryPath,
		limit: 100,
	});

	if (repositoryLabels.length === 0) {
		return "ignored" as const;
	}

	let pullRequestRow: PullRequestRow | null = null;
	let labelFiles: Awaited<ReturnType<typeof automationActor.adapter.listPullRequestFiles>> = [];

	if (dispatch.kind === "pull_request") {
		const pullRequest = await automationActor.adapter.getPullRequest({
			repositoryPath: repository.repositoryPath,
			pullRequestNumber: labelContext.number,
		});
		pullRequestRow = await upsertPullRequestSnapshot({
			repositoryId: repository.id,
			pullRequest,
		});
		labelFiles = await automationActor.adapter.listPullRequestFiles({
			repositoryPath: repository.repositoryPath,
			pullRequestNumber: labelContext.number,
		});
	}

	const labelRun = await createReviewRun({
		repository,
		pullRequest: pullRequestRow,
		envelope,
		reviewKind: "labeler",
		trigger: dispatch.trigger,
		modelId: settings.ai.labeler.modelId,
		thinkingEnabled: false,
	});

	try {
		const labelResult = await runRepositoryLabeler({
			userId: automationActor.userId,
			adapter: automationActor.adapter,
			repository: toGitRepository(repository),
			settings,
			target: {
				kind: dispatch.kind,
				number: labelContext.number,
				title: labelContext.title,
				body: labelContext.body,
				currentLabels: labelContext.labels,
				files: labelFiles,
			},
			trigger: dispatch.trigger,
			providerEvent: envelope.event,
			providerAction: envelope.action,
			repositoryLabels,
		});

		if (!labelResult) {
			await finalizeReviewRun({
				reviewRunId: labelRun.id,
				status: "ignored",
				summary: null,
				finalCommentBody: null,
				result: {
					reason: "labeler_disabled",
				},
			});
			return "ignored" as const;
		}

		await finalizeReviewRun({
			reviewRunId: labelRun.id,
			status: "completed",
			summary: labelResult.summary,
			finalCommentBody: buildLabelerSummaryMarkdown(labelResult),
			result: {
				summary: labelResult.summary,
				suggestedLabels: labelResult.suggestedLabels,
				appliedLabels: labelResult.appliedLabels,
				availableLabels: labelResult.availableLabels.map((label) => label.name),
				trigger: dispatch.trigger,
				providerEvent: envelope.event,
				providerAction: envelope.action,
			},
		});

		return "processed" as const;
	} catch (error) {
		await finalizeReviewRun({
			reviewRunId: labelRun.id,
			status: "failed",
			summary: null,
			finalCommentBody: null,
			result: {
				error: error instanceof Error ? error.message : "labeler_failed",
			},
		});

		return "failed" as const;
	}
}

async function processWebhookReceipt({
	receiptId,
	repositories,
	envelope,
	target,
}: {
	receiptId: string;
	repositories: RepositoryRow[];
	envelope: GitWebhookEnvelope;
	target: ProviderWebhookTarget;
}) {
	await updateWebhookReceipt({
		receiptId,
		status: "processing",
	});

	const context = extractPullRequestContext(target.providerType, envelope);
	let processed = 0;
	let failed = 0;

	for (const repository of repositories) {
		const labelResult = await runWebhookLabeler({
			repository,
			envelope,
			providerType: target.providerType,
		});
		const reviewResult = await runWebhookReview({
			repository,
			envelope,
			providerType: target.providerType,
			context,
		});

		if (labelResult === "processed" || reviewResult === "processed") {
			processed += 1;
		}

		if (labelResult === "failed" || reviewResult === "failed") {
			failed += 1;
		}
	}

	await updateWebhookReceipt({
		receiptId,
		status: resolveWebhookReceiptStatus({
			processed,
			failed,
		}),
	});
}

async function getWebhookReceipt(receiptId: string) {
	const [receipt] = await db
		.select()
		.from(dashboardSchema.webhookEventReceipt)
		.where(eq(dashboardSchema.webhookEventReceipt.id, receiptId))
		.limit(1);

	return receipt ?? null;
}

function createWebhookEnvelopeFromReceipt(
	receipt: WebhookEventReceiptRow,
): GitWebhookEnvelope<Record<string, unknown>> {
	const payload = receipt.payload ?? {};
	const deliveryId = receipt.deliveryId.startsWith("no-delivery-id:")
		? null
		: receipt.deliveryId;

	return {
		providerId: receipt.providerId,
		event: receipt.event,
		action: receipt.action,
		deliveryId,
		repository: null,
		sender: null,
		payload,
		headers: {},
		rawBody: JSON.stringify(payload),
	};
}

export async function processProviderWebhookReceiptJob(
	input: ProviderWebhookJobData,
) {
	const data = providerWebhookJobSchema.parse(input);
	const receipt = await getWebhookReceipt(data.receiptId);

	if (!receipt) {
		log.warn(
			{
				receiptId: data.receiptId,
				providerId: data.providerId,
			},
			"Provider webhook receipt was not found.",
		);
		return;
	}

	if (receipt.providerId !== data.providerId) {
		await updateWebhookReceipt({
			receiptId: receipt.id,
			status: "failed",
		});
		throw new Error("Provider webhook receipt provider mismatch.");
	}

	const target = await resolveWebhookTarget(receipt.providerId);

	if (!target) {
		await updateWebhookReceipt({
			receiptId: receipt.id,
			status: "failed",
		});
		throw new Error("Provider webhook target could not be resolved.");
	}

	const repositories = receipt.repositoryPath
		? await findRepositoriesForWebhook({
				providerId: receipt.providerId,
				repositoryPath: receipt.repositoryPath,
			})
		: [];

	if (repositories.length === 0) {
		await updateWebhookReceipt({
			receiptId: receipt.id,
			status: "ignored",
		});
		return;
	}

	await updateRepositoryWebhookHeartbeat(
		repositories.map((repository) => repository.id),
	);
	await processWebhookReceipt({
		receiptId: receipt.id,
		repositories,
		envelope: createWebhookEnvelopeFromReceipt(receipt),
		target,
	});
}

async function ensureRepositoryWebhookSubscription({
	repository,
	adapter,
	target,
}: {
	repository: RepositoryRow;
	adapter: GitProviderAdapter;
	target: ProviderWebhookTarget;
}) {
	if (!target.secret || !getWebhookBaseUrl()) {
		return {
			status: "skipped" as const,
			error: `${repository.fullName}: webhook base URL or secret is not configured.`,
		};
	}

	const deliveryUrl = normalizeWebhookUrl(buildDeliveryUrl(target));
	const requiredEvents = getRequiredWebhookEvents(target.providerType);
	const existingWebhooks = await adapter.listWebhooks({
		repositoryPath: repository.repositoryPath,
	});
	const matchingWebhook = existingWebhooks.find(
		(webhook) => normalizeWebhookUrl(webhook.url) === deliveryUrl,
	);
	const webhookIsCompatible =
		Boolean(matchingWebhook?.active) &&
		requiredEvents.every((event) => matchingWebhook?.events.includes(event));

	let activeWebhook = matchingWebhook;

	if (!activeWebhook || !webhookIsCompatible) {
		if (activeWebhook) {
			await adapter.deleteWebhook({
				repositoryPath: repository.repositoryPath,
				webhookId: activeWebhook.id,
			});
		}

		activeWebhook = await adapter.createWebhook({
			repositoryPath: repository.repositoryPath,
			url: deliveryUrl,
			events: requiredEvents,
			secret: target.secret ?? undefined,
			active: true,
		});
	}

	const now = new Date();
	await db
		.delete(dashboardSchema.repositoryWebhook)
		.where(
			and(
				eq(dashboardSchema.repositoryWebhook.repositoryId, repository.id),
				eq(dashboardSchema.repositoryWebhook.providerId, repository.providerId),
			),
		);

	await db
		.insert(dashboardSchema.repositoryWebhook)
		.values({
			id: `repository_webhook_${randomUUID()}`,
			repositoryId: repository.id,
			providerId: repository.providerId,
			providerWebhookId: String(activeWebhook.id),
			deliveryUrl,
			events: requiredEvents,
			enabled: activeWebhook.active,
			secretPreview: formatSecretPreview(target.secret),
			verifiedAt: null,
			lastDeliveredAt: null,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [
				dashboardSchema.repositoryWebhook.repositoryId,
				dashboardSchema.repositoryWebhook.providerId,
				dashboardSchema.repositoryWebhook.providerWebhookId,
			],
			set: {
				deliveryUrl,
				events: requiredEvents,
				enabled: activeWebhook.active,
				secretPreview: formatSecretPreview(target.secret),
				updatedAt: now,
			},
		});

	return {
		status:
			matchingWebhook && webhookIsCompatible
				? ("existing" as const)
				: ("created" as const),
		error: null,
	};
}

export async function syncRepositoryWebhooksForUser({
	userId,
	organizationId,
	repositoryId,
}: {
	userId: string;
	organizationId?: string | null;
	repositoryId?: string;
}) {
	const conditions = [
		eq(dashboardSchema.repositoryAccess.userId, userId),
		eq(dashboardSchema.repositoryAccess.enabled, true),
	];

	if (organizationId) {
		conditions.push(
			eq(dashboardSchema.repository.organizationId, organizationId),
		);
	}

	if (repositoryId) {
		conditions.push(eq(dashboardSchema.repository.id, repositoryId));
	}

	const repositories = await db
		.select({
			repository: dashboardSchema.repository,
		})
		.from(dashboardSchema.repositoryAccess)
		.innerJoin(
			dashboardSchema.repository,
			eq(
				dashboardSchema.repositoryAccess.repositoryId,
				dashboardSchema.repository.id,
			),
		)
		.where(and(...conditions));
	const accounts = await db
		.select()
		.from(authSchema.account)
		.where(eq(authSchema.account.userId, userId));
	const enterpriseProviders = await getEnterpriseProviderMap();
	const accountMap = new Map(
		accounts.map((account) => [account.providerId, account]),
	);
	const result: RepositoryWebhookSyncResult = {
		created: 0,
		existing: 0,
		skipped: 0,
		failed: 0,
		errors: [],
	};

	for (const { repository } of repositories) {
		const account = accountMap.get(repository.providerId);

		if (!account) {
			result.skipped += 1;
			result.errors.push(
				`${repository.fullName}: no connected provider account is available for webhook setup.`,
			);
			continue;
		}

		const target = await resolveWebhookTarget(
			repository.providerId,
			enterpriseProviders,
		);

		if (!target) {
			result.skipped += 1;
			continue;
		}

		const adapter = createAdapterFromAccount({
			account: account as GitAccount,
			enterpriseProviders,
			webhookSecrets: target.secret ? [target.secret] : [],
		});

		if (!adapter) {
			result.skipped += 1;
			continue;
		}

		try {
			const syncResult = await ensureRepositoryWebhookSubscription({
				repository,
				adapter,
				target,
			});

			if (syncResult.status === "created") {
				result.created += 1;
			} else if (syncResult.status === "existing") {
				result.existing += 1;
			} else {
				result.skipped += 1;
				if (syncResult.error) {
					result.errors.push(syncResult.error);
				}
			}
		} catch (error) {
			result.failed += 1;
			result.errors.push(
				error instanceof Error
					? `${repository.fullName}: ${error.message}`
					: `${repository.fullName}: webhook setup failed.`,
			);
		}
	}

	return result;
}

export const ensureRepositoryWebhooksForUser = syncRepositoryWebhooksForUser;

export async function receiveProviderWebhook({
	providerId,
	headers,
	rawBody,
}: {
	providerId: string;
	headers: Headers | Record<string, string | null | undefined>;
	rawBody: string;
}) {
	const target = await resolveWebhookTarget(providerId);

	if (!target) {
		return {
			status: 404,
			body: {
				ok: false,
				error: "provider_not_found",
			},
		};
	}

	const verifier = createWebhookVerifier(target);

	try {
		const verified = await verifier.verify({
			headers,
			rawBody,
		});

		if (!verified) {
			return {
				status: 401,
				body: {
					ok: false,
					error: "invalid_signature",
				},
			};
		}

		const envelope = verifier.parse({
			headers,
			rawBody,
		});
		const repositoryPath = envelope.repository?.repositoryPath ?? null;
		const repositories = repositoryPath
			? await findRepositoriesForWebhook({
					providerId,
					repositoryPath,
				})
			: [];
		const receipt = await createWebhookReceipt({
			providerId,
			deliveryId: envelope.deliveryId,
			repositoryId: repositories[0]?.id ?? null,
			repositoryPath,
			event: envelope.event,
			action: envelope.action,
			payload: asRecord(envelope.payload) ?? {
				payload: envelope.payload,
			},
		});

		if (receipt.duplicate) {
			return {
				status: 200,
				body: {
					ok: true,
					deduplicated: true,
				},
			};
		}

		if (repositories.length === 0) {
			await updateWebhookReceipt({
				receiptId: receipt.receiptId,
				status: "ignored",
			});
			return {
				status: 202,
				body: {
					ok: true,
					queued: false,
					matchedRepositories: 0,
				},
			};
		}

		await updateRepositoryWebhookHeartbeat(
			repositories.map((repository) => repository.id),
		);

		try {
			await enqueueProviderWebhookReceiptJob({
				receiptId: receipt.receiptId,
				providerId,
			});
		} catch (error) {
			log.error(
				{
					err: error,
					providerId,
					receiptId: receipt.receiptId,
				},
				"Provider webhook receipt could not be queued.",
			);
			await updateWebhookReceipt({
				receiptId: receipt.receiptId,
				status: "failed",
			});
			return {
				status: 503,
				body: {
					ok: false,
					error: "webhook_queue_unavailable",
				},
			};
		}

		return {
			status: 202,
			body: {
				ok: true,
				queued: true,
				matchedRepositories: repositories.length,
			},
		};
	} catch (error) {
		return {
			status: 400,
			body: {
				ok: false,
				error:
					error instanceof Error ? error.message : "webhook_processing_failed",
			},
		};
	}
}
