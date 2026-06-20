import { GitProviderConfigurationError } from "./errors";

export type GitProviderId = string;

// --- AUTHENTICATION ABSTRACTION ---
export type GitTokenAuth = {
	type: "token";
	token: string;
	tokenType?: "bearer" | "private-token" | "basic";
};

export type GitHubAppAuth = {
	type: "github-app";
	appId: string;
	privateKey: string;
	installationId: number;
	clientId?: string;
	clientSecret?: string;
};

export type GitLabOAuth = {
	type: "gitlab-oauth";
	token: string;
	refreshToken?: string;
	clientId?: string;
	clientSecret?: string;
};

export type GitProviderAuth = GitTokenAuth | GitHubAppAuth | GitLabOAuth;

export type GitRepositoryRef = {
	repositoryPath: string;
};

export type GitPullRequestState = "all" | "open" | "closed" | "merged";
export type GitIssueState = "all" | "open" | "closed";
export type GitMergeMethod = "merge" | "squash" | "rebase";

export type GitActor = {
	id: string;
	login: string | null;
	name: string | null;
	email: string | null;
	avatarUrl: string | null;
	htmlUrl: string | null;
	kind?: "user" | "organization" | "group" | "bot" | null;
};

export type GitWorkspaceScope = "personal" | "organization" | "group";

export type GitWorkspaceRef = {
	providerOwnerId: string;
	providerOwnerPath: string;
	providerOwnerName: string;
	providerOwnerAvatarUrl: string | null;
	providerOwnerHtmlUrl: string | null;
	scope: GitWorkspaceScope;
};

export type GitWorkspaceMember = {
	id: string;
	login: string | null;
	name: string | null;
	email: string | null;
	avatarUrl: string | null;
	htmlUrl: string | null;
	role: string;
};

export type GitRepository = {
	providerId: GitProviderId;
	repositoryPath: string;
	repositoryId: string;
	name: string;
	fullName: string;
	htmlUrl: string;
	defaultBranch: string;
	private: boolean;
	description: string | null;
	owner: GitActor | null;
	workspace: GitWorkspaceRef | null;
};

export type GitPullRequest = {
	providerId: GitProviderId;
	repositoryPath: string;
	number: number;
	id: string;
	title: string;
	body: string | null;
	state: Exclude<GitPullRequestState, "all">;
	draft: boolean;
	htmlUrl: string;
	sourceBranch: string;
	targetBranch: string;
	author: GitActor | null;
	createdAt: string;
	updatedAt: string;
	mergedAt: string | null;
	closedAt: string | null;
	mergeCommitSha: string | null;
};

export type GitPullRequestFileStatus =
	| "added"
	| "modified"
	| "removed"
	| "renamed"
	| "copied"
	| "changed";

export type GitPullRequestFile = {
	providerId: GitProviderId;
	repositoryPath: string;
	pullRequestNumber: number;
	path: string;
	previousPath: string | null;
	status: GitPullRequestFileStatus;
	additions: number;
	deletions: number;
	patch: string | null;
	htmlUrl: string | null;
};

export type GitComment = {
	providerId: GitProviderId;
	repositoryPath: string;
	pullRequestNumber: number;
	id: string;
	body: string;
	htmlUrl: string | null;
	path: string | null;
	line: number | null;
	side: "LEFT" | "RIGHT" | null;
	author: GitActor | null;
	createdAt: string;
	updatedAt: string;
};

export type GitPullRequestReviewState =
	| "approved"
	| "changes_requested"
	| "commented"
	| "dismissed"
	| "pending"
	| "unknown";

/**
 * A submitted review on a pull/merge request.
 *
 * GitHub maps 1:1 to its native review resource. GitLab has no review resource,
 * so adapters derive reviews from approval system notes (which carry a
 * timestamp) unioned with the current approval state (which does not).
 */
export type GitPullRequestReview = {
	providerId: string;
	repositoryPath: string;
	pullRequestNumber: number;
	id: string;
	state: GitPullRequestReviewState;
	body: string | null;
	author: GitActor | null;
	/** ISO-8601 timestamp, or null when the provider does not expose one. */
	submittedAt: string | null;
	htmlUrl: string | null;
};

export type GitRepositoryFile = {
	providerId: GitProviderId;
	repositoryPath: string;
	path: string;
	ref: string | null;
	content: string;
	size: number | null;
	sha: string | null;
	encoding: "utf-8" | "base64" | "unknown";
};

export type GitRepositorySearchKind = "issue" | "pull_request";

export type GitRepositorySearchResult = {
	providerId: GitProviderId;
	repositoryPath: string;
	kind: GitRepositorySearchKind;
	id: string;
	number: number;
	title: string;
	body: string | null;
	state: string;
	htmlUrl: string;
	author: GitActor | null;
	createdAt: string;
	updatedAt: string;
};

export type GitIssue = {
	providerId: GitProviderId;
	repositoryPath: string;
	number: number;
	id: string;
	title: string;
	body: string | null;
	state: string;
	htmlUrl: string;
	author: GitActor | null;
	labels: string[];
	createdAt: string;
	updatedAt: string;
	closedAt: string | null;
};

export type GitRepositoryLabel = {
	providerId: GitProviderId;
	repositoryPath: string;
	name: string;
	description: string | null;
	color: string | null;
};

export type GitWebhookSubscription = {
	providerId: GitProviderId;
	repositoryPath: string;
	id: string;
	url: string;
	active: boolean;
	events: string[];
	secretConfigured: boolean;
	createdAt: string | null;
	updatedAt: string | null;
};

export type GitWebhookEnvelope<TPayload = unknown> = {
	providerId: GitProviderId;
	event: string;
	action: string | null;
	deliveryId: string | null;
	repository: GitRepository | null;
	sender: GitActor | null;
	payload: TPayload;
	headers: Record<string, string>;
	rawBody: string;
};

// --- NEW CAPABILITY TYPES ---
export type GitCommitState = "pending" | "success" | "error" | "failure";

export type GitCommitStatusInput = {
	repositoryPath: string;
	commitSha: string;
	state: GitCommitState;
	targetUrl?: string;
	description?: string;
	context?: string;
};

export type GitCommentInput = {
	repositoryPath: string;
	pullRequestNumber: number;
	body: string;
	path?: string;
	line?: number;
	side?: "LEFT" | "RIGHT";
	commitSha?: string;
	baseSha?: string;
	headSha?: string;
	startSha?: string;
};

export type GitPullRequestCreateInput = {
	repositoryPath: string;
	title: string;
	headBranch: string;
	baseBranch: string;
	body?: string;
	draft?: boolean;
};

export type GitWebhookCreateInput = {
	repositoryPath: string;
	url: string;
	events?: string[];
	/**
	 * Legacy provider webhook secret.
	 *
	 * GitHub uses this to sign `X-Hub-Signature-256`. GitLab sends this value in
	 * `X-Gitlab-Token`, which authenticates the sender but does not protect body
	 * integrity.
	 */
	secret?: string;
	/**
	 * Provider HMAC signing secret where supported.
	 *
	 * Currently used by GitLab's Standard Webhooks-compatible signing token
	 * (`whsec_<base64>`), which produces `webhook-signature`.
	 */
	signingSecret?: string;
	active?: boolean;
};

export type GitWebhookDeleteInput = {
	repositoryPath: string;
	webhookId: string | number;
};

export type GitProviderCapabilities = {
	repositories: true;
	pullRequests: true;
	comments: true;
	reviewers: true;
	webhooks: true;
	commitStatuses: boolean;
	appAuthentication: boolean;
};

export type GitWebhookVerificationInput = {
	headers: Headers | Record<string, string | null | undefined>;
	rawBody: string;
};

export interface GitWebhookAdapter {
	readonly providerId: string;
	/**
	 * Describes the cryptographic strength of `verify()` so trust-sensitive
	 * callers can reason about what a `true` result actually guarantees:
	 * - "hmac": signature is an HMAC over the raw body (proves secret knowledge
	 *   AND body integrity). Used by GitHub.
	 * - "shared-token": a static shared token is compared (proves secret
	 *   knowledge only, NOT body integrity). Used by legacy GitLab webhooks.
	 * - "hmac-or-shared-token": HMAC is verified when present, with a legacy
	 *   shared-token fallback for migration.
	 */
	readonly verificationStrength:
		| "hmac"
		| "shared-token"
		| "hmac-or-shared-token";
	verify(input: GitWebhookVerificationInput): Promise<boolean> | boolean;
	parse(input: GitWebhookVerificationInput): GitWebhookEnvelope;
}

export interface GitProviderAdapter {
	readonly providerId: string;
	readonly label: string;
	readonly baseUrl: string;
	readonly apiBaseUrl: string;
	readonly capabilities: GitProviderCapabilities;
	readonly webhooks: GitWebhookAdapter;

	getCurrentUser(): Promise<GitActor>;
	listRepositories(): Promise<GitRepository[]>;
	listWorkspaceMembers(input: GitWorkspaceRef): Promise<GitWorkspaceMember[]>;
	getRepository(input: GitRepositoryRef): Promise<GitRepository>;
	listPullRequests(
		input: GitRepositoryRef & { state?: GitPullRequestState },
	): Promise<GitPullRequest[]>;
	getPullRequest(
		input: GitRepositoryRef & { pullRequestNumber: number },
	): Promise<GitPullRequest>;
	listIssues(
		input: GitRepositoryRef & { state?: GitIssueState },
	): Promise<GitIssue[]>;
	getIssue(
		input: GitRepositoryRef & { issueNumber: number },
	): Promise<GitIssue>;
	listPullRequestFiles(
		input: GitRepositoryRef & { pullRequestNumber: number },
	): Promise<GitPullRequestFile[]>;
	listPullRequestComments(
		input: GitRepositoryRef & { pullRequestNumber: number },
	): Promise<GitComment[]>;
	listPullRequestReviews(
		input: GitRepositoryRef & { pullRequestNumber: number },
	): Promise<GitPullRequestReview[]>;
	getFileContent(
		input: GitRepositoryRef & { filePath: string; ref?: string },
	): Promise<GitRepositoryFile>;
	searchRepository(
		input: GitRepositoryRef & {
			query?: string;
			kind?: GitRepositorySearchKind[];
			limit?: number;
		},
	): Promise<GitRepositorySearchResult[]>;
	listRepositoryLabels(
		input: GitRepositoryRef & {
			query?: string;
			limit?: number;
		},
	): Promise<GitRepositoryLabel[]>;

	createPullRequest(input: GitPullRequestCreateInput): Promise<GitPullRequest>;
	createComment(input: GitCommentInput): Promise<GitComment>;
	addIssueLabels(
		input: GitRepositoryRef & { issueNumber: number; labels: string[] },
	): Promise<void>;
	addPullRequestLabels(
		input: GitRepositoryRef & { pullRequestNumber: number; labels: string[] },
	): Promise<void>;
	requestPullRequestReviewers(
		input: GitRepositoryRef & {
			pullRequestNumber: number;
			reviewers?: string[];
			reviewerIds?: number[];
			teamReviewers?: string[];
		},
	): Promise<void>;
	mergePullRequest(
		input: GitRepositoryRef & {
			pullRequestNumber: number;
			mergeMethod?: GitMergeMethod;
			title?: string;
			message?: string;
			// When true, the source branch is deleted after a successful merge.
			// Defaults to false on every provider so the unified API behaves
			// identically (GitHub historically never deleted; GitLab used to always
			// delete). Opt in explicitly for branch cleanup.
			removeSourceBranch?: boolean;
		},
	): Promise<GitPullRequest>;

	createCommitStatus(input: GitCommitStatusInput): Promise<void>;

	listWebhooks(input: GitRepositoryRef): Promise<GitWebhookSubscription[]>;
	createWebhook(input: GitWebhookCreateInput): Promise<GitWebhookSubscription>;
	deleteWebhook(input: GitWebhookDeleteInput): Promise<void>;
}

export function normalizeBaseUrl(value: string) {
	return value.replace(/\/+$/, "");
}

export function normalizeGitHostUrl(value: string) {
	const raw = value.includes("://") ? value : `https://${value}`;
	const url = new URL(raw);

	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new Error("Host URL must use http or https.");
	}

	url.hostname = url.hostname.toLowerCase();
	url.pathname = "";
	url.search = "";
	url.hash = "";

	return normalizeBaseUrl(url.toString());
}

export function getGitApiBaseUrl(
	provider: "github" | "gitlab",
	baseUrl: string,
) {
	const normalized = normalizeGitHostUrl(baseUrl);
	return provider === "github"
		? `${normalized}/api/v3`
		: `${normalized}/api/v4`;
}

export function getGitProviderLabel(provider: string) {
	if (provider === "github") {
		return "GitHub";
	}

	if (provider === "gitlab") {
		return "GitLab";
	}

	return provider;
}

export function splitRepositoryPath(repositoryPath: string) {
	const segments = repositoryPath.split("/").filter(Boolean);

	if (segments.length < 2) {
		throw new GitProviderConfigurationError(
			"Repository path must include at least two path segments.",
		);
	}

	const [owner, ...rest] = segments;

	if (!owner) {
		throw new GitProviderConfigurationError(
			"Repository path must include at least two path segments.",
		);
	}

	return {
		owner,
		repo: rest.join("/"),
	};
}

export function getHeaderValue(
	headers: Headers | Record<string, string | null | undefined>,
	headerName: string,
) {
	const normalizedName = headerName.toLowerCase();

	if (headers instanceof Headers) {
		return headers.get(headerName) ?? headers.get(normalizedName) ?? null;
	}

	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === normalizedName && typeof value === "string") {
			return value;
		}
	}

	return null;
}

export function normalizeHeaderRecord(
	headers: Headers | Record<string, string | null | undefined>,
) {
	if (headers instanceof Headers) {
		return Object.fromEntries(
			[...headers.entries()].map(([key, value]) => [key.toLowerCase(), value]),
		);
	}

	return Object.fromEntries(
		Object.entries(headers)
			.filter(([, value]) => typeof value === "string")
			.map(([key, value]) => [key.toLowerCase(), value as string]),
	);
}

export class GitProviderRegistry {
	private readonly adapters = new Map<string, GitProviderAdapter>();

	constructor(adapters: GitProviderAdapter[] = []) {
		for (const adapter of adapters) {
			this.adapters.set(adapter.providerId, adapter);
		}
	}

	register(adapter: GitProviderAdapter) {
		this.adapters.set(adapter.providerId, adapter);
		return this;
	}

	get(providerId: string) {
		return this.adapters.get(providerId) ?? null;
	}

	has(providerId: string) {
		return this.adapters.has(providerId);
	}

	list() {
		return [...this.adapters.values()];
	}
}

export function createGitProviderRegistry(adapters: GitProviderAdapter[] = []) {
	return new GitProviderRegistry(adapters);
}
