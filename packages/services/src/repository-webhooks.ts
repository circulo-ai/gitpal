import { randomUUID } from "node:crypto";
import { decryptSecret } from "@gitpal/auth";
import { db } from "@gitpal/db";
import * as aiSchema from "@gitpal/db/schema/ai";
import * as authSchema from "@gitpal/db/schema/auth";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import { env } from "@gitpal/env/server";
import {
	createGitHubAdapter,
	createGitLabAdapter,
	type GitActor,
	type GitProviderAdapter,
	type GitPullRequest,
	type GitPullRequestFile,
	type GitRepository,
	type GitRepositoryLabel,
	type GitWebhookEnvelope,
	isGitLabWebhookSigningToken,
} from "@gitpal/git";
import {
	enqueueRepositoryLabelerRunJob,
	enqueueRepositoryReviewRunJob,
	type RepositoryLabelerRunJobData,
	type RepositoryReviewRunJobData,
	repositoryLabelerRunJobSchema,
	repositoryReviewRunJobSchema,
} from "@gitpal/jobs/inngest/functions/ai-workflows";
import {
	enqueueProviderWebhookReceiptJob,
	type ProviderWebhookJobData,
	providerWebhookJobSchema,
} from "@gitpal/jobs/inngest/functions/provider-webhooks";
import { createLogger } from "@gitpal/logger";
import type { WorkspaceSettings } from "@gitpal/utils";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
	createAdapterFromAccount,
	createAppAdapterForRepository,
	type EnterpriseProvider,
	type GitAccount,
	getAutomationActorForRepository,
	getEnterpriseProviderMap,
} from "./git-provider-access";
import { projectIssueSnapshot } from "./issue-projection";
import { runRepositoryLabeler } from "./labeler";
import { sendUserNotification } from "./notifications";
import { recordObservabilityEvent } from "./observability";
import {
	projectPullRequestSnapshot,
	recordHumanReviewSignal,
	recordPullRequestMetricEvents,
} from "./pr-projection";
import {
	type RepositoryReviewOutput,
	runRepositoryReview,
} from "./review-agent";
import { resolveDiffAnchor } from "./review-anchors";
import { failActiveReviewRun } from "./review-runs";
import {
	finishRunStep,
	recordCompletedRunStep,
	startRunStep,
} from "./run-trace";
import { sanitizeRunDetails } from "./safe-diagnostics";
import {
	findWebhookAfterDuplicate,
	getUnverifiedWebhookDecision,
	isGitHubDuplicateWebhookError,
} from "./webhook-reconciliation";
import { getRepositoryWorkspaceSettings } from "./workspace-settings";

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
type IssueRow = typeof dashboardSchema.issue.$inferSelect;
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
	signingSecret: string | null;
	routePath: string;
};
type RepositoryWebhookSyncResult = {
	created: number;
	existing: number;
	skipped: number;
	failed: number;
	warnings: string[];
	errors: string[];
};
type RepositoryWebhookSubscriptionResult = {
	status: "created" | "existing" | "skipped";
	error: string | null;
	severity: "warning" | "error" | null;
};
type WebhookReceiptResult = {
	receiptId: string;
	duplicate: boolean;
};
type PullRequestEventContext = {
	pullRequestNumber: number | null;
	labels: string[];
	commentBody: string | null;
	// FIX (bot loop): type is "Bot" for GitHub Apps / bots, "User" for humans.
	// Login ends with "[bot]" for GitHub App bot users (e.g. "gitpal[bot]").
	commentAuthorType: string | null;
	commentAuthorLogin: string | null;
	reviewState: string | null;
	reviewSubmittedAt: string | null;
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
// FIX #6: added teamReviewers so it can be populated if the adapter supports it
type NativeReviewerRequest = {
	reviewers?: string[];
	reviewerIds?: number[];
	teamReviewers?: string[];
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

function getGitHubRepositoryWebhookAccessErrorMessages(error: unknown) {
	const messages = new Set<string>();
	const add = (value: unknown) => {
		if (typeof value === "string") {
			const trimmed = value.trim();
			if (trimmed) {
				messages.add(trimmed);
			}
		}
	};

	add(error);

	if (error instanceof Error) {
		add(error.message);
		add(error.cause);
	}

	const record = asRecord(error);
	const response = asRecord(record?.response);
	const data = asRecord(response?.data);
	const cause = asRecord(record?.cause);
	const causeResponse = asRecord(cause?.response);
	const causeData = asRecord(causeResponse?.data);

	for (const candidate of [
		record?.message,
		record?.error,
		record?.reason,
		response?.message,
		data?.message,
		data?.error,
		cause?.message,
		causeResponse?.message,
		causeData?.message,
		causeData?.error,
	]) {
		add(candidate);
	}

	for (const errors of [data?.errors, causeData?.errors]) {
		if (!Array.isArray(errors)) {
			continue;
		}

		for (const item of errors) {
			if (typeof item === "string") {
				add(item);
				continue;
			}
			const message = asRecord(item)?.message;
			add(message);
		}
	}

	return [...messages];
}

export function isGitHubRepositoryWebhookAccessError(error: unknown) {
	const normalizedMessages = getGitHubRepositoryWebhookAccessErrorMessages(
		error,
	).map((message) => message.toLowerCase());

	return (
		normalizedMessages.some((message) =>
			message.includes("resource not accessible by integration"),
		) ||
		normalizedMessages.some((message) =>
			message.includes("webhooks repository permissions"),
		) ||
		normalizedMessages.some((message) => message.includes("admin:repo_hook")) ||
		normalizedMessages.some((message) => message.includes("read:repo_hook")) ||
		normalizedMessages.some((message) => message.includes("write:repo_hook"))
	);
}

function buildGitHubRepositoryWebhookAccessMessage(repositoryFullName: string) {
	return `${repositoryFullName}: GitHub blocked repository webhook access for this repository. Reauthorize the connected account or installation with repository webhook permission, then sync again.`;
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
		webhookSigningSecrets: target.signingSecret ? [target.signingSecret] : [],
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
			signingSecret: null,
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
			signingSecret: env.GITLAB_WEBHOOK_SIGNING_SECRET ?? null,
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
	const decryptedWebhookSecret = provider.webhookSecret
		? decryptSecret(provider.webhookSecret)
		: null;
	return {
		providerId,
		providerType: provider.type,
		label: provider.name,
		baseUrl: provider.baseUrl,
		apiBaseUrl: provider.apiBaseUrl,
		// Webhook secret is encrypted at rest; decrypt before use.
		// decryptSecret() returns legacy plaintext values unchanged.
		secret:
			decryptedWebhookSecret &&
			(provider.type !== "gitlab" ||
				!isGitLabWebhookSigningToken(decryptedWebhookSecret))
				? decryptedWebhookSecret
				: null,
		signingSecret:
			provider.type === "gitlab" &&
			decryptedWebhookSecret &&
			isGitLabWebhookSigningToken(decryptedWebhookSecret)
				? decryptedWebhookSecret
				: null,
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
// FIX (PR number extraction): Added multiple fallback paths so the PR number
// is correctly resolved across all GitHub event types:
//   - pull_request.*          → payload.pull_request.number       (primary)
//   - pull_request_review.*   → payload.pull_request.number       (primary)
//   - pull_request_review_comment.* → payload.pull_request.number (primary)
//   - issue_comment on a PR   → payload.issue.number when payload.issue.pull_request exists
//   - Defensive fallback      → payload.number (some edge-case event shapes)
function extractGitHubContext(
	payload: Record<string, unknown>,
): PullRequestEventContext {
	const pullRequest = asRecord(payload.pull_request);
	const issue = asRecord(payload.issue);
	const comment = asRecord(payload.comment);
	const review = asRecord(payload.review);
	// present on issue_comment events for PRs
	const issuePullRequest = issue ? asRecord(issue.pull_request) : null;
	const head = pullRequest ? asRecord(pullRequest.head) : null;
	const base = pullRequest ? asRecord(pullRequest.base) : null;
	// For pull_request_review events, the review object contains a link back to
	// the PR but not the number directly — the full PR object at the top level is
	// the authoritative source. We also fall back to payload.number for any
	// unusual event shapes.
	const pullRequestNumber =
		asNumber(pullRequest?.number) ??
		(issuePullRequest ? asNumber(issue?.number) : null) ??
		asNumber(payload.number) ?? // top-level fallback
		null;
	// FIX (bot loop): extract the comment/review author and the top-level
	// sender so resolveReviewDispatch can filter out bot-authored comments.
	// GitHub sets comment.user.type = "Bot" and login ends with "[bot]" for
	// GitHub App bots. payload.sender carries the same info as a fallback.
	const commentUser = comment ? asRecord(comment.user) : null;
	const reviewUser = review ? asRecord(review.user) : null;
	const sender = asRecord(payload.sender);
	const commentAuthorType =
		asString(commentUser?.type) ??
		asString(reviewUser?.type) ??
		asString(sender?.type);
	const commentAuthorLogin =
		asString(commentUser?.login) ??
		asString(reviewUser?.login) ??
		asString(sender?.login);
	return {
		pullRequestNumber,
		labels: extractLabelNames(pullRequest?.labels),
		commentBody: asString(comment?.body) ?? asString(review?.body),
		commentAuthorType,
		commentAuthorLogin,
		reviewState: asString(review?.state),
		reviewSubmittedAt: asString(review?.submitted_at),
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
		// GitLab does not distinguish bot users the same way; default to null.
		commentAuthorType: null,
		commentAuthorLogin:
			asString(asRecord(payload.user)?.username) ??
			asString(asRecord(objectAttributes?.author)?.username),
		reviewState: asString(objectAttributes?.state),
		reviewSubmittedAt:
			asString(objectAttributes?.updated_at) ??
			asString(objectAttributes?.created_at),
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
	// Ignore issue_comment events that happen to carry an issue with a PR link
	if (event === "issues" && issuePullRequest) {
		return null;
	}
	const isPullRequest = event === "pull_request";
	const source = isPullRequest ? (pullRequest ?? issue) : issue;
	if (!source) {
		return null;
	}
	return {
		kind: isPullRequest ? "pull_request" : "issue",
		number:
			asNumber(source.number) ??
			asNumber(issue?.number) ??
			asNumber(pullRequest?.number),
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
		? (mergeRequest ?? objectAttributes ?? issue)
		: (issue ?? objectAttributes);
	if (!source) {
		return null;
	}
	const labels = isPullRequest
		? [
				...extractLabelNames(objectAttributes?.labels),
				...extractLabelNames(mergeRequest?.labels),
			]
		: [
				...extractLabelNames(objectAttributes?.labels),
				...extractLabelNames(issue?.labels),
			];
	return {
		kind: isPullRequest ? "pull_request" : "issue",
		number:
			asNumber(objectAttributes?.iid) ??
			asNumber(mergeRequest?.iid) ??
			asNumber(issue?.iid) ??
			asNumber(objectAttributes?.noteable_iid),
		title: asString(source.title) ?? "",
		body:
			asString(source.description) ?? asString(objectAttributes?.description),
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
	// FIX (loop + vacuous match): Only inspect the FIRST non-empty line of the
	// comment.  The old code used `normalizedBody.includes(...)` which matched
	// the full body — so bot review comments that happen to repeat prior
	// discussion (which includes "/gitpal review") matched as commands and
	// fed the infinite loop.  Commands must appear at the very start of the
	// comment, not buried inside a quoted conversation thread.
	//
	// Additional safety: when aliases OR commands is an empty array the old
	// code returned true vacuously ("any comment passes").  We now treat an
	// empty array as "no filter" only if BOTH are empty we bail out — an
	// entirely unconfigured trigger should not match every comment.
	if (settings.aliases.length === 0 && settings.commands.length === 0) {
		return false;
	}
	const firstLine =
		body
			.split(/\r?\n/)
			.map((l) => l.trim())
			.find((l) => l.length > 0) ?? "";
	const normalizedFirstLine = normalizeText(firstLine);
	const hasAlias =
		settings.aliases.length === 0 ||
		settings.aliases.some((alias) =>
			normalizedFirstLine.startsWith(normalizeText(alias)),
		);
	const hasCommand =
		settings.commands.length === 0 ||
		settings.commands.some((command) =>
			normalizedFirstLine.includes(normalizeText(command)),
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
	if (
		!settings.ai.reviewer.enabled &&
		!settings.preMergeChecks.enabled &&
		!settings.reviews.behavior.autoAssignReviewers
	) {
		log.info("No review features enabled — skipping dispatch.");
		return null;
	}
	const isCommentEvent = isCommentWebhookEvent(envelope.event);
	if (isCommentEvent && !context.isPullRequestCommentEvent) {
		return null;
	}
	// ── Bot / automation-actor loop defence (layered) ────────────────────────
	//
	// Layer 1 — SENTINEL (strongest): every comment posted by this bot contains
	//   the HTML marker <!-- gitpal-bot -->.  This is immune to login changes,
	//   GitHub App renames, enterprise installs, and edge-case API shape
	//   differences.  Check it first so none of the command-matching logic even
	//   runs on a bot-generated body.
	//
	// Layer 2 — TYPE CHECK: GitHub sets user.type === "Bot" for GitHub App
	//   installations.  Catches bots from any app, not just this one.
	//
	// Layer 3 — LOGIN SUFFIX: GitHub App bot users have logins ending in
	//   "[bot]" (e.g. "gitpal[bot]").  Backup for layer 2.
	//
	// Layer 4 — FIRST-LINE MATCHING (in matchesCommandTrigger): commands must
	//   appear on the very first line of the comment, so bot review bodies that
	//   contain "/gitpal" deep inside quoted discussion never match.
	//
	// These layers are independent — all four must be defeated simultaneously
	// for a bot comment to accidentally trigger a review.
	if (isCommentEvent) {
		const body = context.commentBody ?? "";
		if (body.includes("<!-- gitpal-bot -->")) {
			log.debug("Skipping comment — bot sentinel found in body.");
			return null;
		}
		const authorType = context.commentAuthorType?.toLowerCase();
		const authorLogin = context.commentAuthorLogin?.toLowerCase() ?? "";
		if (authorType === "bot" || authorLogin.endsWith("[bot]")) {
			log.debug("Skipping comment event from bot user.", {
				authorType: context.commentAuthorType,
				authorLogin: context.commentAuthorLogin,
			});
			return null;
		}
	}
	if (
		isCommentEvent &&
		settings.preMergeChecks.enabled &&
		matchesCommandTrigger(context.commentBody, settings.webhooks.preMerge)
	) {
		log.info("Dispatching pre-merge via comment command.");
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
		log.info("Dispatching mention review via mention command.");
		return {
			kind: "mention",
			trigger: "mention-command",
			manual: true,
		};
	}
	// GitHub: approved pull_request_review triggers pre-merge check.
	// LOOP DEFENCE: also apply the sentinel + bot-type guard here because
	// pull_request_review events enter via isCommentEvent = true but the
	// "approved" branch was evaluated AFTER the isCommentEvent guard block,
	// meaning a bot that submits an approving review bypassed all bot checks.
	// We now re-apply them explicitly on this path.
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
		// Sentinel check — did this approval come from a bot-posted review?
		const reviewBody = context.commentBody ?? "";
		if (reviewBody.includes("<!-- gitpal-bot -->")) {
			log.debug("Skipping approved pull_request_review — bot sentinel found.");
			return null;
		}
		const approverType = context.commentAuthorType?.toLowerCase();
		const approverLogin = context.commentAuthorLogin?.toLowerCase() ?? "";
		if (approverType === "bot" || approverLogin.endsWith("[bot]")) {
			log.debug("Skipping approved pull_request_review from bot user.", {
				approverType: context.commentAuthorType,
				approverLogin: context.commentAuthorLogin,
			});
			return null;
		}
		log.info("Dispatching pre-merge via review approval.");
		return {
			kind: "pre-merge",
			trigger: "review-approved",
			manual: false,
		};
	}
	if (envelope.event !== "pull_request" || !envelope.action) {
		log.info("Non-pull_request event with no dispatchable action.", {
			event: envelope.event,
			action: envelope.action,
		});
		return null;
	}
	const normalizedAction = envelope.action.toLowerCase();
	// FIX (auto-review on PR open): "opened", "reopened", and
	// "ready_for_review" actions are gated solely by their own
	// autoReview feature flags — NOT by configuredActions. Previously,
	// configuredActions.enabled being false (the common default) or the
	// action being absent from configuredActions.actions silently blocked
	// every PR-open review, making onOpen / onReadyForReview dead settings.
	//
	// Only "synchronize"-style push actions go through configuredActions,
	// because those are typically opt-in per-repo review-on-push settings.
	const isOpenAction = isPullRequestOpenAction(normalizedAction);
	const isReadyForReviewAction = normalizedAction === "ready_for_review";
	if (!isOpenAction && !isReadyForReviewAction) {
		const configuredActions = getConfiguredPullRequestActions(
			providerType,
			settings,
		);
		if (
			!configuredActions.enabled ||
			!configuredActions.actions.includes(normalizedAction)
		) {
			log.info("Action not in configured pull request actions.", {
				action: normalizedAction,
			});
			return null;
		}
	}
	if (
		!shouldRunAutomatedReview({
			pullRequest,
			settings,
			labels: context.labels,
		})
	) {
		log.info("Automated review suppressed by branch/draft/label filters.");
		return null;
	}
	if (isOpenAction) {
		log.info("Dispatching open review.", { action: normalizedAction });
		return settings.reviews.behavior.autoReview.onOpen
			? {
					kind: "review",
					trigger: normalizedAction,
					manual: false,
				}
			: null;
	}
	if (isPullRequestPushAction(normalizedAction)) {
		log.info("Dispatching push review.", { action: normalizedAction });
		return settings.reviews.behavior.autoReview.onPush
			? {
					kind: "review",
					trigger: normalizedAction,
					manual: false,
				}
			: null;
	}
	if (isReadyForReviewAction) {
		log.info("Dispatching ready-for-review review.");
		return settings.reviews.behavior.autoReview.onReadyForReview
			? {
					kind: "review",
					trigger: normalizedAction,
					manual: false,
				}
			: null;
	}
	// FIX #2: Removed the dead-code `"approved"` branch that was only reachable
	// for `pull_request` events (which GitHub never sends with action "approved").
	// The approved → pre-merge path is correctly handled above via the
	// `pull_request_review` + reviewState === "approved" branch.
	log.info("No matching dispatch rule.", { action: normalizedAction });
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
	// No deliveryId — deduplication is not possible for this event.
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

export async function processProviderWebhookFailure({
	receiptId,
	errorMessage,
}: {
	receiptId: string;
	errorMessage: string;
}) {
	log.error(
		{ receiptId, error: sanitizeRunDetails({ message: errorMessage }) },
		"Provider webhook processing exhausted its retries.",
	);
	await updateWebhookReceipt({ receiptId, status: "failed" });
}
// `upsertPullRequestSnapshot` and `recordHumanReviewSignal` now live in
// `./pull-request-projection` so the webhook path, the scheduled reconcile
// worker, and any future on-demand refresh share one idempotent projection.
async function createReviewRun({
	repository,
	pullRequest,
	envelope,
	reviewKind,
	trigger,
	modelId,
	thinkingEnabled,
	issue = null,
	requestedByUserId = null,
	retryOfRunId = null,
	precreatedRunId = null,
}: {
	repository: RepositoryRow;
	pullRequest: PullRequestRow | null;
	envelope: GitWebhookEnvelope;
	reviewKind: WebhookReviewKind;
	trigger: string;
	modelId: string;
	thinkingEnabled: boolean;
	issue?: IssueRow | null;
	requestedByUserId?: string | null;
	retryOfRunId?: string | null;
	precreatedRunId?: string | null;
}) {
	const now = new Date();
	const id = precreatedRunId ?? `review_run_${randomUUID()}`;
	if (precreatedRunId) {
		const [row] = await db
			.update(dashboardSchema.reviewRun)
			.set({
				status: "running",
				trigger,
				modelId,
				thinkingEnabled,
				startedAt: now,
				updatedAt: now,
			})
			.where(
				and(
					eq(dashboardSchema.reviewRun.id, precreatedRunId),
					eq(dashboardSchema.reviewRun.status, "queued"),
				),
			)
			.returning();
		if (!row) throw new Error("Queued review run could not be started.");
		return row;
	}
	const [row] = await db
		.insert(dashboardSchema.reviewRun)
		.values({
			id,
			repositoryId: repository.id,
			pullRequestId: pullRequest?.id ?? null,
			issueId: issue?.id ?? null,
			requestedByUserId,
			retryOfRunId,
			traceId: id,
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

async function finalizeUnstartedManualRun({
	reviewRunId,
	status,
	reason,
}: {
	reviewRunId: string | null | undefined;
	status: "failed" | "ignored";
	reason: string;
}) {
	if (!reviewRunId) return;
	const now = new Date();
	await db
		.update(dashboardSchema.reviewRun)
		.set({
			status,
			result: { reason },
			completedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(dashboardSchema.reviewRun.id, reviewRunId),
				eq(dashboardSchema.reviewRun.status, "queued"),
			),
		);
}
async function finalizeReviewRun({
	reviewRunId,
	status,
	summary,
	finalCommentBody,
	result,
	promptVersion,
	reviewTemplate,
	confidence,
}: {
	reviewRunId: string;
	status: string;
	summary: string | null;
	finalCommentBody: string | null;
	result: Record<string, unknown>;
	promptVersion?: string | null;
	reviewTemplate?: string | null;
	confidence?: RepositoryReviewOutput["confidence"] | null;
}) {
	const now = new Date();
	await db
		.update(dashboardSchema.reviewRun)
		.set({
			status,
			summary,
			finalCommentBody,
			result: sanitizeRunDetails(result),
			promptVersion: promptVersion ?? undefined,
			reviewTemplate: reviewTemplate ?? undefined,
			confidenceLevel: confidence?.risk ?? undefined,
			confidenceScore: confidence?.score ?? undefined,
			confidenceSummary: confidence?.summary ?? undefined,
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
async function listRepositoryReviewerCandidates(repositoryId: string) {
	return db
		.select({
			access: dashboardSchema.repositoryAccess,
			user: authSchema.user,
			account: authSchema.account,
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
		.innerJoin(
			authSchema.account,
			and(
				eq(authSchema.account.userId, dashboardSchema.repositoryAccess.userId),
				eq(
					authSchema.account.providerId,
					dashboardSchema.repository.providerId,
				),
			),
		)
		.where(
			and(
				eq(dashboardSchema.repositoryAccess.repositoryId, repositoryId),
				eq(dashboardSchema.repositoryAccess.enabled, true),
			),
		)
		.orderBy(desc(dashboardSchema.repositoryAccess.lastSeenAt))
		.limit(10);
}
async function listSuggestedReviewersForRepository(repositoryId: string) {
	const rows = await listRepositoryReviewerCandidates(repositoryId);
	return rows
		.map(({ user }) => user.name?.trim() || user.email.split("@")[0] || user.id)
		.filter(Boolean);
}
function getActorIdentityKey(
	actor: GitActor | null,
	providerType: ProviderType,
) {
	if (!actor) {
		return null;
	}
	if (providerType === "github") {
		return actor.login?.trim().toLowerCase() ?? null;
	}
	return actor.id?.trim() ?? null;
}
async function requestProviderNativeReviewers({
	repository,
	automationActor,
	pullRequest,
	providerType,
}: {
	repository: RepositoryRow;
	automationActor: Awaited<ReturnType<typeof getAutomationActorForRepository>>;
	pullRequest: GitPullRequest;
	providerType: ProviderType;
}) {
	if (!automationActor?.adapter.capabilities.reviewers) {
		return {
			applied: false,
			reviewers: [] as string[],
			reviewerIds: [] as number[],
		};
	}
	const candidates = await listRepositoryReviewerCandidates(repository.id);
	if (candidates.length === 0) {
		return {
			applied: false,
			reviewers: [] as string[],
			reviewerIds: [] as number[],
		};
	}
	const enterpriseProviders = await getEnterpriseProviderMap();
	const automationIdentity = await automationActor.adapter
		.getCurrentUser()
		.catch(() => null);
	const pullRequestAuthorIdentity = pullRequest.author;
	const target = {
		reviewers: new Set<string>(),
		reviewerIds: new Set<number>(),
	};
	for (const candidate of candidates) {
		if (candidate.access.userId === automationActor.userId) {
			continue;
		}
		const candidateAdapter = await createAdapterFromAccount({
			account: candidate.account as GitAccount,
			enterpriseProviders,
		}).catch((error) => {
			log.warn(
				{
					err: error,
					repositoryId: repository.id,
					providerId: repository.providerId,
					userId: candidate.access.userId,
				},
				"Reviewer candidate provider credentials were unavailable.",
			);
			return null;
		});
		if (!candidateAdapter?.capabilities.reviewers) {
			continue;
		}
		const providerActor = await candidateAdapter
			.getCurrentUser()
			.catch(() => null);
		if (!providerActor) {
			continue;
		}
		const providerIdentityKey = getActorIdentityKey(
			providerActor,
			providerType,
		);
		const automationIdentityKey = getActorIdentityKey(
			automationIdentity,
			providerType,
		);
		const pullRequestAuthorIdentityKey = getActorIdentityKey(
			pullRequestAuthorIdentity,
			providerType,
		);
		if (
			providerIdentityKey &&
			automationIdentityKey &&
			providerIdentityKey === automationIdentityKey
		) {
			continue;
		}
		if (
			providerIdentityKey &&
			pullRequestAuthorIdentityKey &&
			providerIdentityKey === pullRequestAuthorIdentityKey
		) {
			continue;
		}
		if (providerType === "github") {
			const login = providerActor.login?.trim();
			if (!login) {
				continue;
			}
			target.reviewers.add(login);
		} else {
			const reviewerId = Number(providerActor.id);
			if (!Number.isInteger(reviewerId) || reviewerId <= 0) {
				continue;
			}
			target.reviewerIds.add(reviewerId);
		}
		if (target.reviewers.size + target.reviewerIds.size >= 3) {
			break;
		}
	}
	const request: NativeReviewerRequest = {
		reviewers: [...target.reviewers],
		reviewerIds: [...target.reviewerIds],
		// FIX #6: teamReviewers populated (empty for now; extend here when
		// team-based reviewer assignment is implemented)
		teamReviewers: [],
	};
	if (request.reviewers?.length === 0) {
		delete request.reviewers;
	}
	if (request.reviewerIds?.length === 0) {
		delete request.reviewerIds;
	}
	if (request.teamReviewers?.length === 0) {
		delete request.teamReviewers;
	}
	if (!request.reviewers && !request.reviewerIds && !request.teamReviewers) {
		return {
			applied: false,
			reviewers: [] as string[],
			reviewerIds: [] as number[],
		};
	}
	await automationActor.adapter.requestPullRequestReviewers({
		repositoryPath: repository.repositoryPath,
		pullRequestNumber: pullRequest.number,
		...request,
	});
	return {
		applied: true,
		reviewers: request.reviewers ?? [],
		reviewerIds: request.reviewerIds ?? [],
	};
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
		log.info("Summary comment publishing skipped — disabled by settings.", {
			kind: dispatch.kind,
			publishPreMergeSummary: settings.statuses.publishPreMergeSummary,
			publishReviewSummary: settings.statuses.publishReviewSummary,
			postSummaryComment: settings.ai.reviewer.postSummaryComment,
		});
		return null;
	}
	log.info("Publishing summary comment to provider.", {
		repositoryPath: repository.repositoryPath,
		pullRequestNumber: pullRequest.number,
		kind: dispatch.kind,
	});
	// LOOP DEFENSE — bot sentinel: append a hidden HTML comment to every review
	// body posted by this bot.  resolveReviewDispatch checks for this marker
	// before any command matching, so even if the login/type checks ever fail
	// (e.g. enterprise installs, renamed accounts, edge-case GitHub API shapes)
	// the bot's own comments are definitively self-identified and ignored.
	const bodyWithSentinel = `${commentMarkdown}\n\n<!-- gitpal-bot -->`;
	const comment = await adapter.createComment({
		repositoryPath: repository.repositoryPath,
		pullRequestNumber: pullRequest.number,
		body: bodyWithSentinel,
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
	files,
}: {
	reviewRunId: string;
	repository: RepositoryRow;
	pullRequest: PullRequestRow;
	settings: WorkspaceSettings;
	adapter: GitProviderAdapter;
	headSha: string | null;
	baseSha: string | null;
	output: RepositoryReviewOutput;
	files: GitPullRequestFile[];
}) {
	for (const finding of output.findings) {
		let providerCommentId: string | null = null;
		const now = new Date();
		const anchor = resolveDiffAnchor(files, finding.filePath, finding.line);
		if (
			settings.ai.reviewer.postInlineFindings &&
			["github", "gitlab"].includes(repository.providerType) &&
			finding.filePath &&
			anchor.line &&
			headSha
		) {
			try {
				const inlineComment = await adapter.createComment({
					repositoryPath: repository.repositoryPath,
					pullRequestNumber: pullRequest.number,
					body: formatFindingBody(finding),
					path: finding.filePath,
					line: anchor.line,
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
			line: anchor.line ?? finding.line,
			startLine: anchor.line ?? finding.line,
			metadata: {
				anchorStatus: anchor.status,
				requestedLine: anchor.originalLine,
				publishedInline: Boolean(providerCommentId),
			},
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
	forcedDispatch = null,
	requestedByUserId = null,
	retryOfRunId = null,
	precreatedRunId = null,
}: {
	repository: RepositoryRow;
	envelope: GitWebhookEnvelope;
	providerType: ProviderType;
	context: PullRequestEventContext;
	forcedDispatch?: ReviewDispatch | null;
	requestedByUserId?: string | null;
	retryOfRunId?: string | null;
	precreatedRunId?: string | null;
}): Promise<WebhookProcessingResult> {
	const automationActor = await getAutomationActorForRepository({
		repositoryId: repository.id,
		providerId: repository.providerId,
	});
	if (!automationActor || !context.pullRequestNumber) {
		return "ignored" as const;
	}
	// NOTE: Bot-comment loop prevention is handled upstream in resolveReviewDispatch
	// via two complementary guards:
	//   1. GitHub App bots are filtered by user.type === "Bot" / login ending in "[bot]"
	//      (in the isCommentEvent block above).
	//   2. PAT-based bots (same login as automation actor) cannot re-trigger a review
	//      because matchesCommandTrigger now only matches the FIRST LINE of a comment,
	//      so bot review bodies (## Summary …) never look like /gitpal commands.
	// A naive identity-equality check was tried here but incorrectly blocked
	// legitimate /gitpal commands typed by the user when they use the same account
	// as the automation actor. DO NOT add that check back.
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
	const dispatch =
		forcedDispatch ??
		resolveReviewDispatch({
			providerType,
			envelope,
			pullRequest,
			settings,
			context,
		});
	if (!dispatch) {
		return "ignored" as const;
	}
	let nativeReviewerRequest: Awaited<
		ReturnType<typeof requestProviderNativeReviewers>
	> | null = null;
	if (
		dispatch.kind === "review" &&
		settings.reviews.behavior.autoAssignReviewers
	) {
		try {
			nativeReviewerRequest = await requestProviderNativeReviewers({
				repository,
				automationActor,
				pullRequest,
				providerType,
			});
		} catch (error) {
			log.warn(
				{
					err: error,
					repositoryId: repository.id,
					repositoryPath: repository.repositoryPath,
					providerId: repository.providerId,
				},
				"Native reviewer assignment failed.",
			);
		}
	}
	if (dispatch.kind !== "pre-merge" && !settings.ai.reviewer.enabled) {
		return dispatch.kind === "review" && nativeReviewerRequest?.applied
			? "processed"
			: "ignored";
	}
	const pullRequestRow = await projectPullRequestSnapshot({
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
		requestedByUserId,
		retryOfRunId,
		precreatedRunId,
	});
	await recordCompletedRunStep({
		reviewRunId: reviewRun.id,
		stepKey: "request-received",
		position: 1,
		title: forcedDispatch ? "Manual review requested" : "Received webhook",
		summary: `${dispatch.trigger} trigger accepted`,
		details: { providerEvent: envelope.event, providerAction: envelope.action },
	});
	await recordCompletedRunStep({
		reviewRunId: reviewRun.id,
		stepKey: "context-synced",
		position: 2,
		title: "Synced pull request context",
		summary: `${pullRequest.sourceBranch} to ${pullRequest.targetBranch}`,
		details: {
			pullRequestNumber: pullRequest.number,
			draft: pullRequest.draft,
		},
	});
	await recordCompletedRunStep({
		reviewRunId: reviewRun.id,
		stepKey: "settings-loaded",
		position: 3,
		title: "Loaded review settings",
		summary: `Using ${settings.ai.reviewer.modelId}`,
	});
	const reviewStartedAt = reviewRun.startedAt?.getTime() ?? Date.now();
	await recordObservabilityEvent({
		userId: automationActor.userId,
		organizationId: repository.organizationId,
		repositoryId: repository.id,
		pullRequestId: pullRequestRow.id,
		reviewRunId: reviewRun.id,
		traceId: reviewRun.id,
		kind: "review",
		action: dispatch.kind,
		status: "running",
		severity: "warning",
		title: `${dispatch.kind} review started`,
		body: `${repository.fullName}#${pullRequest.number}`,
		sourceType: "review-run",
		sourceId: reviewRun.id,
		dedupeKey: `review-run:${reviewRun.id}:started`,
		metadata: {
			trigger: dispatch.trigger,
			providerEvent: envelope.event,
			providerAction: envelope.action,
			modelId: settings.ai.reviewer.modelId,
		},
	});
	try {
		await startRunStep({
			reviewRunId: reviewRun.id,
			stepKey: "context-inspected",
			position: 4,
			title: "Inspected changed files and discussion",
		});
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
		await finishRunStep({
			reviewRunId: reviewRun.id,
			stepKey: "context-inspected",
			summary: `${files.length} files and ${comments.length} comments loaded`,
			details: { fileCount: files.length, commentCount: comments.length },
		});
		const suggestedReviewers = await listSuggestedReviewersForRepository(
			repository.id,
		);
		await startRunStep({
			reviewRunId: reviewRun.id,
			stepKey: "ai-review",
			position: 5,
			title: "Ran AI review",
			summary: `Calling ${settings.ai.reviewer.modelId}`,
		});
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
			organizationId: repository.organizationId,
			repositoryDbId: repository.id,
			pullRequestDbId: pullRequestRow.id,
			reviewRunId: reviewRun.id,
		});
		await finishRunStep({
			reviewRunId: reviewRun.id,
			stepKey: "ai-review",
			summary: `${reviewResult.output.findings.length} findings generated`,
			details: {
				findingCount: reviewResult.output.findings.length,
				stepCount: reviewResult.steps.length,
			},
		});
		await startRunStep({
			reviewRunId: reviewRun.id,
			stepKey: "results-published",
			position: 6,
			title: "Published review results",
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
			files,
		});
		await createPreMergeCheckRecords({
			reviewRunId: reviewRun.id,
			repository,
			pullRequest: pullRequestRow,
			output: reviewResult.output,
		});
		await finishRunStep({
			reviewRunId: reviewRun.id,
			stepKey: "results-published",
			summary: `${reviewResult.output.findings.length} findings and ${reviewResult.output.preMergeChecks.length} checks stored`,
		});
		await finalizeReviewRun({
			reviewRunId: reviewRun.id,
			status: "completed",
			summary: reviewResult.output.summary,
			finalCommentBody: reviewResult.commentMarkdown,
			promptVersion: reviewResult.promptVersion,
			reviewTemplate: reviewResult.reviewTemplate,
			confidence: reviewResult.output.confidence,
			result: {
				output: reviewResult.output,
				commentMarkdown: reviewResult.commentMarkdown,
				poem: reviewResult.poem,
				suggestedReviewers,
				nativeReviewerRequest,
				text: reviewResult.text,
				stepCount: reviewResult.steps.length,
				promptVersion: reviewResult.promptVersion,
				reviewTemplate: reviewResult.reviewTemplate,
				confidence: reviewResult.output.confidence,
			},
		});
		await recordCompletedRunStep({
			reviewRunId: reviewRun.id,
			stepKey: "completed",
			position: 7,
			title: "Completed",
			summary: "Review run completed successfully",
		});
		await recordObservabilityEvent({
			userId: automationActor.userId,
			organizationId: repository.organizationId,
			repositoryId: repository.id,
			pullRequestId: pullRequestRow.id,
			reviewRunId: reviewRun.id,
			traceId: reviewRun.id,
			kind: "review",
			action: dispatch.kind,
			status: "completed",
			severity: "success",
			title: `${dispatch.kind} review completed`,
			body: reviewResult.output.summary,
			sourceType: "review-run",
			sourceId: reviewRun.id,
			dedupeKey: `review-run:${reviewRun.id}:completed`,
			durationMs: Date.now() - reviewStartedAt,
			metadata: {
				trigger: dispatch.trigger,
				providerEvent: envelope.event,
				providerAction: envelope.action,
				stepCount: reviewResult.steps.length,
				commentCount: reviewResult.output.findings.length,
			},
		});
		await sendUserNotification({
			userId: automationActor.userId,
			organizationId: repository.organizationId,
			repositoryId: repository.id,
			type: "review_completed",
			category: "review",
			severity: "success",
			title: "AI review completed",
			body: `${repository.fullName}#${pullRequest.number}: ${pullRequest.title}`,
			actionHref: `/repositories/${repository.id}/pull-requests/${pullRequest.number}`,
			sourceType: "review-run",
			sourceId: reviewRun.id,
			dedupeKey: `review-run:${reviewRun.id}:notification:completed`,
			metadata: {
				trigger: dispatch.trigger,
				reviewKind: dispatch.kind,
				findings: reviewResult.output.findings.length,
			},
		});
		return "processed" as const;
	} catch (error) {
		for (const stepKey of [
			"context-inspected",
			"ai-review",
			"results-published",
		]) {
			await finishRunStep({
				reviewRunId: reviewRun.id,
				stepKey,
				status: "failed",
				summary: error instanceof Error ? error.message : "Review failed",
				errorCode: "review_failed",
			});
		}
		const errorMessage = error instanceof Error ? error.message : String(error);
		const isCredentialError =
			errorMessage.includes("Bad credentials") ||
			errorMessage.includes("Unauthorized") ||
			errorMessage.includes("403") ||
			errorMessage.includes("401");
		if (isCredentialError) {
			log.warn(
				{
					err: error,
					repositoryId: repository.id,
					repositoryPath: repository.repositoryPath,
					providerId: repository.providerId,
				},
				"Review processing skipped due to invalid credentials.",
			);
			await finalizeReviewRun({
				reviewRunId: reviewRun.id,
				status: "ignored",
				summary: null,
				finalCommentBody: null,
				result: { reason: "credential_error" },
			});
			await recordObservabilityEvent({
				userId: automationActor.userId,
				organizationId: repository.organizationId,
				repositoryId: repository.id,
				pullRequestId: pullRequestRow.id,
				reviewRunId: reviewRun.id,
				traceId: reviewRun.id,
				kind: "review",
				action: dispatch.kind,
				status: "ignored",
				severity: "warning",
				title: `${dispatch.kind} review ignored`,
				body: "Provider credentials could not authorize the review.",
				sourceType: "review-run",
				sourceId: reviewRun.id,
				dedupeKey: `review-run:${reviewRun.id}:ignored`,
				durationMs: Date.now() - reviewStartedAt,
				metadata: {
					reason: "credential_error",
					providerEvent: envelope.event,
					providerAction: envelope.action,
				},
			});
			await sendUserNotification({
				userId: automationActor.userId,
				organizationId: repository.organizationId,
				repositoryId: repository.id,
				type: "review_credential_error",
				category: "review",
				severity: "warning",
				title: "Review skipped: provider credentials",
				body: `${repository.fullName}#${pullRequest.number} could not be reviewed because provider credentials were rejected.`,
				actionHref: "/account/api-keys",
				sourceType: "review-run",
				sourceId: reviewRun.id,
				dedupeKey: `review-run:${reviewRun.id}:notification:credential-error`,
				metadata: {
					reviewKind: dispatch.kind,
					providerId: repository.providerId,
				},
			});
			return "ignored" as const;
		}
		await finalizeReviewRun({
			reviewRunId: reviewRun.id,
			status: "failed",
			summary: null,
			finalCommentBody: null,
			result: {
				error: error instanceof Error ? error.message : "review_failed",
			},
		});
		await recordObservabilityEvent({
			userId: automationActor.userId,
			organizationId: repository.organizationId,
			repositoryId: repository.id,
			pullRequestId: pullRequestRow.id,
			reviewRunId: reviewRun.id,
			traceId: reviewRun.id,
			kind: "review",
			action: dispatch.kind,
			status: "failed",
			severity: "error",
			title: `${dispatch.kind} review failed`,
			body: error instanceof Error ? error.message : "Review failed.",
			sourceType: "review-run",
			sourceId: reviewRun.id,
			dedupeKey: `review-run:${reviewRun.id}:failed`,
			durationMs: Date.now() - reviewStartedAt,
			metadata: {
				providerEvent: envelope.event,
				providerAction: envelope.action,
			},
		});
		await sendUserNotification({
			userId: automationActor.userId,
			organizationId: repository.organizationId,
			repositoryId: repository.id,
			type: "review_failed",
			category: "review",
			severity: "error",
			title: "AI review failed",
			body:
				error instanceof Error
					? `${repository.fullName}#${pullRequest.number}: ${error.message}`
					: `${repository.fullName}#${pullRequest.number}: review failed.`,
			actionHref: `/repositories/${repository.id}/pull-requests/${pullRequest.number}`,
			sourceType: "review-run",
			sourceId: reviewRun.id,
			dedupeKey: `review-run:${reviewRun.id}:notification:failed`,
			metadata: {
				reviewKind: dispatch.kind,
				providerEvent: envelope.event,
				providerAction: envelope.action,
			},
		});
		return "failed" as const;
	}
}
async function runWebhookLabeler({
	repository,
	envelope,
	providerType,
	forcedContext = null,
	forcedDispatch = null,
	requestedByUserId = null,
	retryOfRunId = null,
	precreatedRunId = null,
}: {
	repository: RepositoryRow;
	envelope: GitWebhookEnvelope;
	providerType: ProviderType;
	forcedContext?: LabelEventContext | null;
	forcedDispatch?: LabelDispatch | null;
	requestedByUserId?: string | null;
	retryOfRunId?: string | null;
	precreatedRunId?: string | null;
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
	const labelContext =
		forcedContext ?? extractLabelContext(providerType, envelope);
	if (!labelContext?.number) {
		return "ignored" as const;
	}
	const dispatch =
		forcedDispatch ??
		resolveLabelDispatch({
			providerType,
			envelope,
			settings,
			context: labelContext,
		});
	if (!dispatch) {
		return "ignored" as const;
	}
	let repositoryLabels: GitRepositoryLabel[] = [];
	try {
		repositoryLabels = await automationActor.adapter.listRepositoryLabels({
			repositoryPath: repository.repositoryPath,
			limit: 100,
		});
	} catch (error) {
		log.warn(
			{
				err: error,
				repositoryId: repository.id,
				repositoryPath: repository.repositoryPath,
			},
			"Could not fetch repository labels for webhook labeler.",
		);
		return "ignored" as const;
	}
	if (repositoryLabels.length === 0) {
		return "ignored" as const;
	}
	let pullRequestRow: PullRequestRow | null = null;
	let issueRow: IssueRow | null = null;
	let labelFiles: Awaited<
		ReturnType<typeof automationActor.adapter.listPullRequestFiles>
	> = [];
	if (dispatch.kind === "pull_request") {
		const pullRequest = await automationActor.adapter.getPullRequest({
			repositoryPath: repository.repositoryPath,
			pullRequestNumber: labelContext.number,
		});
		pullRequestRow = await projectPullRequestSnapshot({
			repositoryId: repository.id,
			pullRequest,
		});
		labelFiles = await automationActor.adapter.listPullRequestFiles({
			repositoryPath: repository.repositoryPath,
			pullRequestNumber: labelContext.number,
		});
	} else {
		const issue = await automationActor.adapter.getIssue({
			repositoryPath: repository.repositoryPath,
			issueNumber: labelContext.number,
		});
		issueRow = await projectIssueSnapshot({
			repositoryId: repository.id,
			issue,
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
		issue: issueRow,
		requestedByUserId,
		retryOfRunId,
		precreatedRunId,
	});
	await recordCompletedRunStep({
		reviewRunId: labelRun.id,
		stepKey: "request-received",
		position: 1,
		title: forcedDispatch ? "Manual labeler run requested" : "Received webhook",
		summary: `${dispatch.trigger} trigger accepted`,
	});
	await recordCompletedRunStep({
		reviewRunId: labelRun.id,
		stepKey: "context-synced",
		position: 2,
		title: `Synced ${dispatch.kind} context`,
		summary: `${repository.fullName}#${labelContext.number}`,
	});
	await recordCompletedRunStep({
		reviewRunId: labelRun.id,
		stepKey: "labels-loaded",
		position: 3,
		title: "Loaded repository labels",
		summary: `${repositoryLabels.length} labels available`,
	});
	await recordCompletedRunStep({
		reviewRunId: labelRun.id,
		stepKey: "rules-loaded",
		position: 4,
		title: "Loaded labeling rules",
		summary: "Workspace and repository settings resolved",
	});
	const labelerStartedAt = labelRun.startedAt?.getTime() ?? Date.now();
	await recordObservabilityEvent({
		userId: automationActor.userId,
		organizationId: repository.organizationId,
		repositoryId: repository.id,
		pullRequestId: pullRequestRow?.id ?? null,
		issueId: issueRow?.id ?? null,
		reviewRunId: labelRun.id,
		traceId: labelRun.id,
		kind: "review",
		action: "labeler",
		status: "running",
		severity: "warning",
		title: "Labeler started",
		body: `${repository.fullName}#${labelContext.number}`,
		sourceType: "review-run",
		sourceId: labelRun.id,
		dedupeKey: `review-run:${labelRun.id}:started`,
		metadata: {
			trigger: dispatch.trigger,
			providerEvent: envelope.event,
			providerAction: envelope.action,
			modelId: settings.ai.labeler.modelId,
		},
	});
	try {
		await startRunStep({
			reviewRunId: labelRun.id,
			stepKey: "ai-labeler",
			position: 5,
			title: "Ran AI labeler",
			summary: `Calling ${settings.ai.labeler.modelId}`,
		});
		const labelResult = await runRepositoryLabeler({
			userId: automationActor.userId,
			organizationId: repository.organizationId,
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
			repositoryDbId: repository.id,
			pullRequestDbId: pullRequestRow?.id ?? null,
			reviewRunId: labelRun.id,
		});
		if (!labelResult) {
			await finishRunStep({
				reviewRunId: labelRun.id,
				stepKey: "ai-labeler",
				status: "skipped",
				summary: "Labeler is disabled for this target",
			});
			await finalizeReviewRun({
				reviewRunId: labelRun.id,
				status: "ignored",
				summary: null,
				finalCommentBody: null,
				result: { reason: "labeler_disabled" },
			});
			await recordObservabilityEvent({
				userId: automationActor.userId,
				organizationId: repository.organizationId,
				repositoryId: repository.id,
				pullRequestId: pullRequestRow?.id ?? null,
				issueId: issueRow?.id ?? null,
				reviewRunId: labelRun.id,
				traceId: labelRun.id,
				kind: "review",
				action: "labeler",
				status: "ignored",
				severity: "warning",
				title: "Labeler ignored",
				body: "Labeler returned no result.",
				sourceType: "review-run",
				sourceId: labelRun.id,
				dedupeKey: `review-run:${labelRun.id}:ignored`,
				durationMs: Date.now() - labelerStartedAt,
				metadata: {
					reason: "labeler_disabled",
					trigger: dispatch.trigger,
					providerEvent: envelope.event,
					providerAction: envelope.action,
				},
			});
			return "ignored" as const;
		}
		if (issueRow && labelResult.generationId) {
			await db
				.update(aiSchema.aiGeneration)
				.set({ issueId: issueRow.id })
				.where(eq(aiSchema.aiGeneration.id, labelResult.generationId));
		}
		await finishRunStep({
			reviewRunId: labelRun.id,
			stepKey: "ai-labeler",
			summary: `${labelResult.suggestedLabels.length} labels suggested`,
			details: {
				suggestedLabels: labelResult.suggestedLabels,
				appliedLabels: labelResult.appliedLabels,
			},
		});
		await recordCompletedRunStep({
			reviewRunId: labelRun.id,
			stepKey: "labels-applied",
			position: 6,
			title: "Applied labels",
			summary:
				labelResult.appliedLabels.length > 0
					? labelResult.appliedLabels.join(", ")
					: "No provider label changes were required",
			details: { appliedLabels: labelResult.appliedLabels },
		});
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
		await recordCompletedRunStep({
			reviewRunId: labelRun.id,
			stepKey: "completed",
			position: 7,
			title: "Completed",
			summary: "Labeler run completed successfully",
		});
		await recordObservabilityEvent({
			userId: automationActor.userId,
			organizationId: repository.organizationId,
			repositoryId: repository.id,
			pullRequestId: pullRequestRow?.id ?? null,
			issueId: issueRow?.id ?? null,
			reviewRunId: labelRun.id,
			traceId: labelRun.id,
			kind: "review",
			action: "labeler",
			status: "completed",
			severity: "success",
			title: "Labeler completed",
			body: labelResult.summary,
			sourceType: "review-run",
			sourceId: labelRun.id,
			dedupeKey: `review-run:${labelRun.id}:completed`,
			durationMs: Date.now() - labelerStartedAt,
			metadata: {
				trigger: dispatch.trigger,
				suggestedLabels: labelResult.suggestedLabels,
				appliedLabels: labelResult.appliedLabels,
			},
		});
		await sendUserNotification({
			userId: automationActor.userId,
			organizationId: repository.organizationId,
			repositoryId: repository.id,
			type: "labeler_completed",
			category: "review",
			severity: "success",
			title: "AI labeler completed",
			body: `${repository.fullName}#${labelContext.number}: ${labelResult.summary}`,
			actionHref:
				dispatch.kind === "issue"
					? `/repositories/${repository.id}/issues/${labelContext.number}`
					: `/repositories/${repository.id}/pull-requests/${labelContext.number}`,
			sourceType: "review-run",
			sourceId: labelRun.id,
			dedupeKey: `review-run:${labelRun.id}:notification:labeler-completed`,
		});
		return "processed" as const;
	} catch (error) {
		await finishRunStep({
			reviewRunId: labelRun.id,
			stepKey: "ai-labeler",
			status: "failed",
			summary: error instanceof Error ? error.message : "Labeler failed",
			errorCode: "labeler_failed",
		});
		await finalizeReviewRun({
			reviewRunId: labelRun.id,
			status: "failed",
			summary: null,
			finalCommentBody: null,
			result: {
				error: error instanceof Error ? error.message : "labeler_failed",
			},
		});
		await recordObservabilityEvent({
			userId: automationActor.userId,
			organizationId: repository.organizationId,
			repositoryId: repository.id,
			pullRequestId: pullRequestRow?.id ?? null,
			issueId: issueRow?.id ?? null,
			reviewRunId: labelRun.id,
			traceId: labelRun.id,
			kind: "review",
			action: "labeler",
			status: "failed",
			severity: "error",
			title: "Labeler failed",
			body: error instanceof Error ? error.message : "Labeler failed.",
			sourceType: "review-run",
			sourceId: labelRun.id,
			dedupeKey: `review-run:${labelRun.id}:failed`,
			durationMs: Date.now() - labelerStartedAt,
			metadata: {
				trigger: dispatch.trigger,
				providerEvent: envelope.event,
				providerAction: envelope.action,
			},
		});
		await sendUserNotification({
			userId: automationActor.userId,
			organizationId: repository.organizationId,
			repositoryId: repository.id,
			type: "labeler_failed",
			category: "review",
			severity: "error",
			title: "Labeler failed",
			body:
				error instanceof Error
					? `${repository.fullName}#${labelContext.number}: ${error.message}`
					: `${repository.fullName}#${labelContext.number}: labeler failed.`,
			actionHref:
				dispatch.kind === "issue"
					? `/repositories/${repository.id}/issues/${labelContext.number}`
					: `/repositories/${repository.id}/pull-requests/${labelContext.number}`,
			sourceType: "review-run",
			sourceId: labelRun.id,
			dedupeKey: `review-run:${labelRun.id}:notification:labeler-failed`,
			metadata: {
				trigger: dispatch.trigger,
				providerEvent: envelope.event,
				providerAction: envelope.action,
			},
		});
		return "failed" as const;
	}
}
const PULL_REQUEST_LIFECYCLE_EVENTS = new Set([
	// GitHub
	"pull_request",
	"pull_request_review",
	"pull_request_review_comment",
	// GitLab
	"merge_request",
	"note",
]);

/**
 * Real-time analytics projection (Layer 1). Runs on every relevant webhook,
 * independently of whether an AI review or labeler actually fires, so lifecycle
 * data (state, mergedAt, closedAt, ...) and human-review timing stay fresh.
 */
async function projectPullRequestLifecycle({
	repository,
	envelope,
	context,
}: {
	repository: RepositoryRow;
	envelope: GitWebhookEnvelope;
	context: PullRequestEventContext;
}) {
	if (!context.pullRequestNumber) {
		return;
	}
	if (!PULL_REQUEST_LIFECYCLE_EVENTS.has(envelope.event)) {
		return;
	}
	const automationActor = await getAutomationActorForRepository({
		repositoryId: repository.id,
		providerId: repository.providerId,
	});
	if (!automationActor) {
		return;
	}
	let pullRequest: GitPullRequest;
	try {
		pullRequest = await automationActor.adapter.getPullRequest({
			repositoryPath: repository.repositoryPath,
			pullRequestNumber: context.pullRequestNumber,
		});
	} catch (error) {
		log.warn(
			{
				err: error,
				repositoryId: repository.id,
				pullRequestNumber: context.pullRequestNumber,
			},
			"Pull request lifecycle projection skipped — getPullRequest failed.",
		);
		return;
	}
	const pullRequestRow = await projectPullRequestSnapshot({
		repositoryId: repository.id,
		pullRequest,
	});
	await recordPullRequestMetricEvents({
		userId: automationActor.userId,
		repository,
		pullRequest: pullRequestRow,
		source: {
			type: "webhook",
			event: envelope.event,
			action: envelope.action,
		},
	});

	// Human review timing + approval state. Captured in real time only: provider
	// APIs do not expose historical per-review timestamps, so the reconcile worker
	// cannot backfill these. GitHub fires a dedicated `pull_request_review` event
	// whose state is the review decision. (GitLab approvals are not yet mapped
	// here — its merge_request `state` is the MR lifecycle, not a review.)
	if (envelope.event !== "pull_request_review") {
		return;
	}
	const authorType = context.commentAuthorType?.toLowerCase();
	const authorLogin = context.commentAuthorLogin?.toLowerCase() ?? "";
	if (authorType === "bot" || authorLogin.endsWith("[bot]")) {
		return;
	}
	const reviewedAt = toDateOrNull(context.reviewSubmittedAt) ?? new Date();
	const reviewedPullRequestRow = await recordHumanReviewSignal({
		repositoryId: repository.id,
		pullRequestNumber: context.pullRequestNumber,
		reviewedAt,
		isApproval: context.reviewState?.toLowerCase() === "approved",
		approvalState: context.reviewState,
	});
	if (reviewedPullRequestRow) {
		await recordPullRequestMetricEvents({
			userId: automationActor.userId,
			repository,
			pullRequest: reviewedPullRequestRow,
			source: {
				type: "webhook",
				event: envelope.event,
				action: envelope.action,
			},
		});
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
	await updateWebhookReceipt({ receiptId, status: "processing" });
	const context = extractPullRequestContext(target.providerType, envelope);
	let processed = 0;
	let failed = 0;
	for (const repository of repositories) {
		// Keep analytics fresh first — must never be blocked by review/label flow.
		try {
			await projectPullRequestLifecycle({ repository, envelope, context });
		} catch (error) {
			log.warn(
				{ err: error, repositoryId: repository.id },
				"Pull request lifecycle projection failed.",
			);
		}

		let queuedAiWork = false;
		const labelContext = extractLabelContext(target.providerType, envelope);
		if (labelContext?.kind === "issue" && labelContext.number) {
			try {
				const actor = await getAutomationActorForRepository({
					repositoryId: repository.id,
					providerId: repository.providerId,
				});
				if (actor) {
					const issue = await actor.adapter.getIssue({
						repositoryPath: repository.repositoryPath,
						issueNumber: labelContext.number,
					});
					await projectIssueSnapshot({ repositoryId: repository.id, issue });
				}
			} catch (error) {
				log.warn(
					{
						err: error,
						repositoryId: repository.id,
						issueNumber: labelContext.number,
					},
					"Issue lifecycle projection failed.",
				);
			}
		}
		if (labelContext?.number) {
			try {
				await enqueueRepositoryLabelerRunJob({
					source: "webhook",
					receiptId,
					repositoryId: repository.id,
					providerType: target.providerType,
				});
				queuedAiWork = true;
			} catch (error) {
				failed += 1;
				log.warn(
					{ err: error, receiptId, repositoryId: repository.id },
					"Repository labeler workflow could not be queued.",
				);
			}
		}

		if (context.pullRequestNumber) {
			try {
				await enqueueRepositoryReviewRunJob({
					source: "webhook",
					receiptId,
					repositoryId: repository.id,
					providerType: target.providerType,
				});
				queuedAiWork = true;
			} catch (error) {
				failed += 1;
				log.warn(
					{ err: error, receiptId, repositoryId: repository.id },
					"Repository review workflow could not be queued.",
				);
			}
		}

		if (queuedAiWork) {
			processed += 1;
		}
	}
	await updateWebhookReceipt({
		receiptId,
		status: resolveWebhookReceiptStatus({ processed, failed }),
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
async function getRepositoryById(repositoryId: string) {
	const [repository] = await db
		.select()
		.from(dashboardSchema.repository)
		.where(eq(dashboardSchema.repository.id, repositoryId))
		.limit(1);
	return repository ?? null;
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
async function loadDurableAiWebhookContext({
	receiptId,
	repositoryId,
	providerType,
}: {
	receiptId: string;
	repositoryId: string;
	providerType: ProviderType;
}) {
	const [receipt, repository] = await Promise.all([
		getWebhookReceipt(receiptId),
		getRepositoryById(repositoryId),
	]);

	if (!receipt) {
		log.warn({ receiptId }, "AI workflow skipped - webhook receipt missing.");
		return null;
	}

	if (!repository) {
		log.warn({ repositoryId }, "AI workflow skipped - repository missing.");
		return null;
	}

	if (repository.providerType !== providerType) {
		log.warn(
			{
				receiptId,
				repositoryId,
				expected: providerType,
				actual: repository.providerType,
			},
			"AI workflow skipped - provider type mismatch.",
		);
		return null;
	}

	const target = await resolveWebhookTarget(receipt.providerId);
	if (!target || target.providerType !== providerType) {
		log.warn(
			{ receiptId, repositoryId, providerId: receipt.providerId },
			"AI workflow skipped - provider target missing or mismatched.",
		);
		return null;
	}

	return {
		receipt,
		repository,
		target,
		envelope: createWebhookEnvelopeFromReceipt(receipt),
	};
}
export async function processRepositoryReviewRunJob(
	input: RepositoryReviewRunJobData,
) {
	const data = repositoryReviewRunJobSchema.parse(input);
	if (data.source === "manual") {
		try {
			if (data.targetKind && data.targetKind !== "pull_request") {
				await finalizeUnstartedManualRun({
					reviewRunId: data.runId,
					status: "failed",
					reason: "invalid_target_kind",
				});
				return { status: "failed" };
			}
			const repository = await getRepositoryById(data.repositoryId);
			if (!repository || !data.targetNumber) {
				await finalizeUnstartedManualRun({
					reviewRunId: data.runId,
					status: "ignored",
					reason: "target_not_found",
				});
				return { status: "ignored" };
			}
			const result = await runWebhookReview({
				repository,
				envelope: {
					providerId: repository.providerId,
					event: "manual_review",
					action: "requested",
					deliveryId: data.idempotencyKey ?? null,
					repository: null,
					sender: null,
					payload: {},
					headers: {},
					rawBody: "{}",
				},
				providerType: data.providerType,
				context: {
					pullRequestNumber: data.targetNumber,
					labels: [],
					commentBody: null,
					commentAuthorType: null,
					commentAuthorLogin: null,
					reviewState: null,
					reviewSubmittedAt: null,
					headSha: null,
					baseSha: null,
					isPullRequestCommentEvent: false,
				},
				forcedDispatch: { kind: "review", trigger: "manual", manual: true },
				requestedByUserId: data.requestedByUserId ?? null,
				retryOfRunId: data.retryOfRunId ?? null,
				precreatedRunId: data.runId ?? null,
			});
			if (result === "ignored") {
				await finalizeUnstartedManualRun({
					reviewRunId: data.runId,
					status: "ignored",
					reason: "review_not_started",
				});
			}
			return result;
		} catch (error) {
			if (data.runId) {
				await failActiveReviewRun({
					runId: data.runId,
					reason: "review_preflight_failed",
					errorMessage: error instanceof Error ? error.message : String(error),
				});
			}
			return { status: "failed" };
		}
	}
	if (!data.receiptId) return { status: "ignored" };
	const context = await loadDurableAiWebhookContext({
		receiptId: data.receiptId,
		repositoryId: data.repositoryId,
		providerType: data.providerType,
	});
	if (!context) {
		return { status: "ignored" };
	}
	const pullRequestContext = extractPullRequestContext(
		context.target.providerType,
		context.envelope,
	);

	return runWebhookReview({
		repository: context.repository,
		envelope: context.envelope,
		providerType: context.target.providerType,
		context: pullRequestContext,
	});
}
export async function processRepositoryLabelerRunJob(
	input: RepositoryLabelerRunJobData,
) {
	const data = repositoryLabelerRunJobSchema.parse(input);
	if (data.source === "manual") {
		try {
			const repository = await getRepositoryById(data.repositoryId);
			if (!repository || !data.targetNumber) {
				await finalizeUnstartedManualRun({
					reviewRunId: data.runId,
					status: "ignored",
					reason: "target_not_found",
				});
				return { status: "ignored" };
			}
			const automationActor = await getAutomationActorForRepository({
				repositoryId: repository.id,
				providerId: repository.providerId,
			});
			if (!automationActor) {
				await finalizeUnstartedManualRun({
					reviewRunId: data.runId,
					status: "ignored",
					reason: "provider_credentials_unavailable",
				});
				return { status: "ignored" };
			}
			const forcedKind = data.targetKind ?? "issue";
			let forcedContext: LabelEventContext;
			if (forcedKind === "pull_request") {
				const pullRequest = await automationActor.adapter.getPullRequest({
					repositoryPath: repository.repositoryPath,
					pullRequestNumber: data.targetNumber,
				});
				forcedContext = {
					kind: "pull_request",
					number: pullRequest.number,
					title: pullRequest.title,
					body: pullRequest.body,
					labels: [],
					isDraft: pullRequest.draft,
				};
			} else {
				const issue = await automationActor.adapter.getIssue({
					repositoryPath: repository.repositoryPath,
					issueNumber: data.targetNumber,
				});
				forcedContext = {
					kind: "issue",
					number: issue.number,
					title: issue.title,
					body: issue.body,
					labels: issue.labels,
					isDraft: false,
				};
			}
			const result = await runWebhookLabeler({
				repository,
				envelope: {
					providerId: repository.providerId,
					event: "manual_labeler",
					action: "requested",
					deliveryId: data.idempotencyKey ?? null,
					repository: null,
					sender: null,
					payload: {},
					headers: {},
					rawBody: "{}",
				},
				providerType: data.providerType,
				forcedContext,
				forcedDispatch: { kind: forcedKind, trigger: "manual", manual: true },
				requestedByUserId: data.requestedByUserId ?? null,
				retryOfRunId: data.retryOfRunId ?? null,
				precreatedRunId: data.runId ?? null,
			});
			if (result === "ignored") {
				await finalizeUnstartedManualRun({
					reviewRunId: data.runId,
					status: "ignored",
					reason: "labeler_not_started",
				});
			}
			return result;
		} catch (error) {
			if (data.runId) {
				await failActiveReviewRun({
					runId: data.runId,
					reason: "labeler_preflight_failed",
					errorMessage: error instanceof Error ? error.message : String(error),
				});
			}
			return { status: "failed" };
		}
	}
	if (!data.receiptId) return { status: "ignored" };
	const context = await loadDurableAiWebhookContext({
		receiptId: data.receiptId,
		repositoryId: data.repositoryId,
		providerType: data.providerType,
	});
	if (!context) {
		return { status: "ignored" };
	}

	return runWebhookLabeler({
		repository: context.repository,
		envelope: context.envelope,
		providerType: context.target.providerType,
	});
}
export async function processProviderWebhookReceiptJob(
	input: ProviderWebhookJobData,
) {
	const data = providerWebhookJobSchema.parse(input);
	const receipt = await getWebhookReceipt(data.receiptId);
	if (!receipt) {
		log.warn(
			{ receiptId: data.receiptId, providerId: data.providerId },
			"Provider webhook receipt was not found.",
		);
		return;
	}
	if (receipt.providerId !== data.providerId) {
		await updateWebhookReceipt({ receiptId: receipt.id, status: "failed" });
		throw new Error("Provider webhook receipt provider mismatch.");
	}
	const target = await resolveWebhookTarget(receipt.providerId);
	if (!target) {
		await updateWebhookReceipt({ receiptId: receipt.id, status: "failed" });
		throw new Error("Provider webhook target could not be resolved.");
	}
	const repositories = receipt.repositoryPath
		? await findRepositoriesForWebhook({
				providerId: receipt.providerId,
				repositoryPath: receipt.repositoryPath,
			})
		: [];
	if (repositories.length === 0) {
		await updateWebhookReceipt({ receiptId: receipt.id, status: "ignored" });
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
}): Promise<RepositoryWebhookSubscriptionResult> {
	const webhookSecret = target.secret ?? target.signingSecret;
	if (!webhookSecret || !getWebhookBaseUrl()) {
		return {
			status: "skipped" as const,
			error: `${repository.fullName}: webhook base URL or secret is not configured.`,
			severity: "error" as const,
		};
	}
	try {
		const deliveryUrl = normalizeWebhookUrl(buildDeliveryUrl(target));
		const requiredEvents = getRequiredWebhookEvents(target.providerType);
		const existingWebhooks = await adapter.listWebhooks({
			repositoryPath: repository.repositoryPath,
		});
		const matchingWebhooks = existingWebhooks.filter(
			(webhook) => normalizeWebhookUrl(webhook.url) === deliveryUrl,
		);
		const configuredSecretPreview = formatSecretPreview(webhookSecret);
		const matchingWebhookIds = matchingWebhooks.map((webhook) =>
			String(webhook.id),
		);
		const recordedWebhooks = matchingWebhookIds.length
			? await db
					.select({
						providerWebhookId:
							dashboardSchema.repositoryWebhook.providerWebhookId,
						secretPreview: dashboardSchema.repositoryWebhook.secretPreview,
					})
					.from(dashboardSchema.repositoryWebhook)
					.where(
						and(
							eq(dashboardSchema.repositoryWebhook.repositoryId, repository.id),
							eq(
								dashboardSchema.repositoryWebhook.providerId,
								repository.providerId,
							),
							inArray(
								dashboardSchema.repositoryWebhook.providerWebhookId,
								matchingWebhookIds,
							),
						),
					)
			: [];
		const recordedWebhookSecretPreviewById = new Map(
			recordedWebhooks.map((recordedWebhook) => [
				recordedWebhook.providerWebhookId,
				recordedWebhook.secretPreview,
			]),
		);
		const compatibleWebhook = matchingWebhooks.find(
			(webhook) =>
				Boolean(webhook.active) &&
				requiredEvents.every((event) => webhook.events.includes(event)) &&
				recordedWebhookSecretPreviewById.get(String(webhook.id)) ===
					configuredSecretPreview,
		);
		let createdWebhook = false;
		let activeWebhook = compatibleWebhook ?? null;
		const deleteWebhook = async (
			webhook: (typeof matchingWebhooks)[number],
		) => {
			await adapter.deleteWebhook({
				repositoryPath: repository.repositoryPath,
				webhookId: webhook.id,
			});
		};
		const createWebhook = async () => {
			try {
				const webhook = await adapter.createWebhook({
					repositoryPath: repository.repositoryPath,
					url: deliveryUrl,
					events: requiredEvents,
					secret: target.secret ?? undefined,
					signingSecret: target.signingSecret ?? undefined,
					active: true,
				});
				createdWebhook = true;
				return webhook;
			} catch (error) {
				if (
					target.providerType === "github" &&
					isGitHubDuplicateWebhookError(error)
				) {
					// GitHub can surface "hook already exists" when a stale duplicate
					// webhook is still present or another sync created the hook between
					// our list and create calls. Re-list and adopt the existing hook so
					// sync stays idempotent instead of failing the whole job.
					const recovered = await findWebhookAfterDuplicate({
						listWebhooks: () =>
							adapter.listWebhooks({
								repositoryPath: repository.repositoryPath,
							}),
						isMatch: (webhook) =>
							normalizeWebhookUrl(webhook.url) === deliveryUrl &&
							Boolean(webhook.active) &&
							requiredEvents.every((event) => webhook.events.includes(event)),
					});
					if (recovered) {
						const refreshedMatchingWebhooks = recovered.webhooks.filter(
							(webhook) => normalizeWebhookUrl(webhook.url) === deliveryUrl,
						);
						for (const webhook of refreshedMatchingWebhooks) {
							if (webhook.id !== recovered.webhook.id) {
								await deleteWebhook(webhook);
							}
						}
						createdWebhook = false;
						return recovered.webhook;
					}
				}
				throw error;
			}
		};
		if (activeWebhook) {
			for (const webhook of matchingWebhooks) {
				if (webhook.id !== activeWebhook.id) {
					await deleteWebhook(webhook);
				}
			}
		} else {
			for (const webhook of matchingWebhooks) {
				await deleteWebhook(webhook);
			}
			activeWebhook = await createWebhook();
		}
		const now = new Date();
		await db
			.delete(dashboardSchema.repositoryWebhook)
			.where(
				and(
					eq(dashboardSchema.repositoryWebhook.repositoryId, repository.id),
					eq(
						dashboardSchema.repositoryWebhook.providerId,
						repository.providerId,
					),
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
				secretPreview: configuredSecretPreview,
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
					secretPreview: configuredSecretPreview,
					updatedAt: now,
				},
			});
		return {
			status: createdWebhook ? ("created" as const) : ("existing" as const),
			error: null,
			severity: null,
		};
	} catch (error) {
		if (isGitHubRepositoryWebhookAccessError(error)) {
			return {
				status: "skipped" as const,
				error: buildGitHubRepositoryWebhookAccessMessage(repository.fullName),
				severity: "warning" as const,
			};
		}
		throw error;
	}
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
		.select({ repository: dashboardSchema.repository })
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
		warnings: [],
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
		const accountAdapter = await createAdapterFromAccount({
			account: account as GitAccount,
			enterpriseProviders,
			webhookSecrets: target.secret ? [target.secret] : [],
			webhookSigningSecrets: target.signingSecret ? [target.signingSecret] : [],
		});
		const webhookAdapter =
			repository.providerId === "github"
				? await createAppAdapterForRepository({
						repository,
					}).catch((error) => {
						log.debug(
							{
								err: error,
								repositoryId: repository.id,
								providerId: repository.providerId,
							},
							"GitHub App installation adapter could not be created for webhook sync.",
						);
						return null;
					})
				: null;
		const adapter = webhookAdapter ?? accountAdapter;
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
					if (syncResult.severity === "warning") {
						result.warnings.push(syncResult.error);
					} else {
						result.errors.push(syncResult.error);
					}
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
			body: { ok: false, error: "provider_not_found" },
		};
	}
	log.info(
		{
			label: target.label,
			id: target.providerId,
		},
		"Webhook Target",
	);
	const verifier = createWebhookVerifier(target);
	const hasSecret = Boolean(target.secret || target.signingSecret);
	try {
		const verified = await verifier.verify({ headers, rawBody });
		if (!verified) {
			const decision = getUnverifiedWebhookDecision({
				hasSecret,
				isProduction: env.NODE_ENV === "production",
			});
			if (decision === "invalid_signature") {
				log.warn(
					{
						providerId,
						verificationStrength: verifier.verificationStrength,
					},
					"Webhook signature verification failed; rejecting payload.",
				);
				return {
					status: 401,
					body: { ok: false, error: "invalid_signature" },
				};
			}
			if (decision === "secret_not_configured") {
				log.error(
					{ providerId },
					"Webhook secret is missing in production; rejecting payload.",
				);
				return {
					status: 503,
					body: { ok: false, error: "webhook_secret_not_configured" },
				};
			}
			log.warn(
				{ providerId },
				"Webhook secret is not configured; processing payload WITHOUT verification.",
			);
		}
		const envelope = verifier.parse({ headers, rawBody });
		log.info(envelope.action, "Envelope parsed");
		const repositoryPath = envelope.repository?.repositoryPath ?? null;
		const repositories = repositoryPath
			? await findRepositoriesForWebhook({ providerId, repositoryPath })
			: [];
		const receipt = await createWebhookReceipt({
			providerId,
			deliveryId: envelope.deliveryId,
			repositoryId: repositories[0]?.id ?? null,
			repositoryPath,
			event: envelope.event,
			action: envelope.action,
			payload: asRecord(envelope.payload) ?? { payload: envelope.payload },
		});
		if (receipt.duplicate) {
			return {
				status: 200,
				body: { ok: true, deduplicated: true },
			};
		}
		if (repositories.length === 0) {
			await updateWebhookReceipt({
				receiptId: receipt.receiptId,
				status: "ignored",
			});
			return {
				status: 202,
				body: { ok: true, queued: false, matchedRepositories: 0 },
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
				{ err: error, providerId, receiptId: receipt.receiptId },
				"Provider webhook receipt could not be queued.",
			);
			await updateWebhookReceipt({
				receiptId: receipt.receiptId,
				status: "failed",
			});
			return {
				status: 503,
				body: { ok: false, error: "webhook_queue_unavailable" },
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
		log.warn(
			{
				err: error,
				providerId,
			},
			"Provider webhook payload could not be accepted.",
		);
		return {
			status: 400,
			body: {
				ok: false,
				error:
					error instanceof SyntaxError
						? "invalid_payload"
						: "webhook_processing_failed",
			},
		};
	}
}
