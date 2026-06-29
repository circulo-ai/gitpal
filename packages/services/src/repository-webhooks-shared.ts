import { decryptSecret } from "@gitpal/auth";
import { env } from "@gitpal/env/server";
import {
	createGitHubAdapter,
	createGitLabAdapter,
	type GitWebhookEnvelope,
	isGitLabWebhookSigningToken,
} from "@gitpal/git";
import type { EnterpriseProvider } from "./git-provider-access";
import { getEnterpriseProviderMap } from "./git-provider-access";

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

export type WebhookReceiptStatus =
	| "received"
	| "processing"
	| "processed"
	| "processed_with_errors"
	| "ignored"
	| "failed";

export type ProviderType = "github" | "gitlab";

export type ProviderWebhookTarget = {
	providerId: string;
	providerType: ProviderType;
	label: string;
	baseUrl: string | null;
	apiBaseUrl: string | null;
	secret: string | null;
	signingSecret: string | null;
	routePath: string;
};

export type PullRequestEventContext = {
	pullRequestNumber: number | null;
	labels: string[];
	commentBody: string | null;
	// GitHub sets comment.user.type = "Bot" for app/bot users and login ends in
	// "[bot]"; GitLab does not expose an equivalent, so we keep it nullable.
	commentAuthorType: string | null;
	commentAuthorLogin: string | null;
	reviewState: string | null;
	reviewSubmittedAt: string | null;
	headSha: string | null;
	baseSha: string | null;
	isPullRequestCommentEvent: boolean;
};

export type LabelEventContext = {
	kind: "issue" | "pull_request";
	number: number | null;
	title: string;
	body: string | null;
	labels: string[];
	isDraft: boolean;
};

const REQUIRED_WEBHOOK_EVENTS_BY_PROVIDER = {
	github: GITHUB_WEBHOOK_EVENTS,
	gitlab: GITLAB_WEBHOOK_EVENTS,
} satisfies Record<ProviderType, readonly string[]>;

export function normalizeWebhookUrl(url: string) {
	return url.trim().replace(/\/+$/, "");
}

export function normalizeText(value: string) {
	return value.trim().toLowerCase();
}

export function toDateOrNull(value: string | null | undefined) {
	if (!value) {
		return null;
	}
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

export function asString(value: unknown) {
	return typeof value === "string" ? value : null;
}

export function asNumber(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getWebhookBaseUrl() {
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

export function buildGitHubRepositoryWebhookAccessMessage(
	repositoryFullName: string,
) {
	return `${repositoryFullName}: GitHub blocked repository webhook access for this repository. Reauthorize the connected account or installation with repository webhook permission, then sync again.`;
}

export function formatSecretPreview(secret: string) {
	if (secret.length <= 6) {
		return "*".repeat(secret.length);
	}
	return `${secret.slice(0, 4)}...${secret.slice(-2)}`;
}

export function getRequiredWebhookEvents(providerType: ProviderType) {
	return [...REQUIRED_WEBHOOK_EVENTS_BY_PROVIDER[providerType]];
}

export function isCommentWebhookEvent(event: string) {
	return COMMENT_WEBHOOK_EVENTS.has(event);
}

export function isPullRequestOpenAction(action: string) {
	return PULL_REQUEST_OPEN_ACTIONS.has(action);
}

export function isPullRequestPushAction(action: string) {
	return PULL_REQUEST_PUSH_ACTIONS.has(action);
}

export function resolveWebhookReceiptStatus({
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

export function buildDeliveryUrl(target: ProviderWebhookTarget) {
	return new URL(target.routePath, getWebhookBaseUrl()).toString();
}

export function createWebhookVerifier(target: ProviderWebhookTarget) {
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

export async function resolveWebhookTarget(
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
	// the PR but not the number directly. We fall back to payload.number for
	// unusual event shapes.
	const pullRequestNumber =
		asNumber(pullRequest?.number) ??
		(issuePullRequest ? asNumber(issue?.number) : null) ??
		asNumber(payload.number) ??
		null;
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

export function extractPullRequestContext(
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
	// Ignore issue_comment events that happen to carry an issue with a PR link.
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

export function extractLabelContext(
	providerType: ProviderType,
	envelope: GitWebhookEnvelope,
): LabelEventContext | null {
	const payload = asRecord(envelope.payload) ?? {};
	return providerType === "github"
		? extractGitHubLabelContext(payload, envelope.event)
		: extractGitLabLabelContext(payload, envelope.event);
}
