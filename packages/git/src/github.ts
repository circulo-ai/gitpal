import { createLogger } from "@gitpal/logger";
import { createAppAuth } from "@octokit/auth-app";
import { verify, verifyWithFallback } from "@octokit/webhooks-methods";
import { Octokit } from "octokit";
import {
	type GitActor,
	type GitComment,
	type GitCommentInput,
	type GitCommitStatusInput,
	type GitMergeMethod,
	type GitProviderAdapter,
	type GitProviderAuth,
	type GitProviderCapabilities,
	type GitPullRequest,
	type GitPullRequestCreateInput,
	type GitPullRequestFile,
	type GitPullRequestFileStatus,
	type GitPullRequestReview,
	type GitPullRequestState,
	type GitRepository,
	type GitRepositoryFile,
	type GitRepositoryLabel,
	type GitRepositoryRef,
	type GitRepositorySearchKind,
	type GitRepositorySearchResult,
	type GitWebhookAdapter,
	type GitWebhookCreateInput,
	type GitWebhookDeleteInput,
	type GitWorkspaceRef,
	getGitProviderLabel,
	getHeaderValue,
	normalizeBaseUrl,
	normalizeHeaderRecord,
	splitRepositoryPath,
} from "./core";
import { GitProviderConfigurationError } from "./errors";

const log = createLogger("github");

type GitHubAdapterOptions = {
	providerId?: string;
	label?: string;
	authBaseUrl?: string;
	apiBaseUrl?: string;
	auth?: GitProviderAuth;
	userAgent?: string;
	webhookSecrets?: string[];
};

type GitHubAppInstallationAdapterOptions = Omit<
	GitHubAdapterOptions,
	"auth"
> & {
	appId: string;
	privateKey: string;
	installationId?: number;
	repositoryPath?: string;
	clientId?: string;
	clientSecret?: string;
};

type GitHubWebhookPayload = {
	action?: string;
	repository?: Record<string, unknown> | null;
	sender?: Record<string, unknown> | null;
};

const capabilities: GitProviderCapabilities = {
	repositories: true,
	pullRequests: true,
	comments: true,
	reviewers: true,
	webhooks: true,
	commitStatuses: true,
	appAuthentication: true,
};

function mapActor(
	actor: Record<string, unknown> | null | undefined,
): GitActor | null {
	if (!actor) {
		return null;
	}

	return {
		id: String(actor.id ?? actor.node_id ?? actor.login ?? "unknown"),
		login: typeof actor.login === "string" ? actor.login : null,
		name:
			typeof actor.name === "string"
				? actor.name
				: typeof actor.login === "string"
					? actor.login
					: null,
		email: typeof actor.email === "string" ? actor.email : null,
		avatarUrl: typeof actor.avatar_url === "string" ? actor.avatar_url : null,
		htmlUrl: typeof actor.html_url === "string" ? actor.html_url : null,
		kind:
			actor.type === "Organization"
				? "organization"
				: actor.type === "User"
					? "user"
					: actor.type === "Bot"
						? "bot"
						: null,
	};
}

function mapWorkspace(
	repository: Record<string, unknown>,
	repositoryPath: string,
): GitWorkspaceRef | null {
	const owner =
		typeof repository.owner === "object" && repository.owner !== null
			? (repository.owner as Record<string, unknown>)
			: null;
	const fallbackOwner = splitRepositoryPath(repositoryPath).owner;
	const ownerPath =
		typeof owner?.login === "string" && owner.login.trim()
			? owner.login
			: fallbackOwner;
	const ownerId =
		owner?.id !== undefined || owner?.node_id !== undefined
			? String(owner.id ?? owner.node_id)
			: ownerPath;

	if (!ownerPath) {
		return null;
	}

	const scope = owner?.type === "Organization" ? "organization" : "personal";

	return {
		providerOwnerId: ownerId,
		providerOwnerPath: ownerPath,
		providerOwnerName:
			typeof owner?.login === "string" && owner.login.trim()
				? owner.login
				: ownerPath,
		providerOwnerAvatarUrl:
			typeof owner?.avatar_url === "string" ? owner.avatar_url : null,
		providerOwnerHtmlUrl:
			typeof owner?.html_url === "string" ? owner.html_url : null,
		scope,
	};
}

function mapRepository(
	repository: Record<string, unknown>,
	providerId: string,
	repositoryPath: string,
): GitRepository {
	return {
		providerId,
		repositoryPath,
		repositoryId: String(repository.id ?? repository.node_id ?? repositoryPath),
		name:
			typeof repository.name === "string"
				? repository.name
				: splitRepositoryPath(repositoryPath).repo,
		fullName:
			typeof repository.full_name === "string"
				? repository.full_name
				: repositoryPath,
		htmlUrl:
			typeof repository.html_url === "string"
				? repository.html_url
				: normalizeBaseUrl(String(repository.url ?? "")),
		defaultBranch:
			typeof repository.default_branch === "string"
				? repository.default_branch
				: "main",
		private: Boolean(repository.private),
		description:
			typeof repository.description === "string"
				? repository.description
				: null,
		owner: mapActor(
			typeof repository.owner === "object" && repository.owner !== null
				? (repository.owner as Record<string, unknown>)
				: null,
		),
		workspace: mapWorkspace(repository, repositoryPath),
	};
}

function mapPullRequest(
	pullRequest: Record<string, unknown>,
	providerId: string,
	repositoryPath: string,
): GitPullRequest {
	const mergedAt =
		typeof pullRequest.merged_at === "string" ? pullRequest.merged_at : null;
	const state =
		mergedAt || pullRequest.merged === true
			? ("merged" as const)
			: pullRequest.state === "closed"
				? ("closed" as const)
				: ("open" as const);

	return {
		providerId,
		repositoryPath,
		number: Number(pullRequest.number ?? 0),
		id: String(pullRequest.id ?? pullRequest.node_id ?? pullRequest.number),
		title: String(pullRequest.title ?? ""),
		body: typeof pullRequest.body === "string" ? pullRequest.body : null,
		state,
		draft: Boolean(pullRequest.draft),
		htmlUrl:
			typeof pullRequest.html_url === "string" ? pullRequest.html_url : "",
		sourceBranch:
			typeof pullRequest.head === "object" &&
			pullRequest.head !== null &&
			typeof (pullRequest.head as Record<string, unknown>).ref === "string"
				? ((pullRequest.head as Record<string, unknown>).ref as string)
				: "",
		targetBranch:
			typeof pullRequest.base === "object" &&
			pullRequest.base !== null &&
			typeof (pullRequest.base as Record<string, unknown>).ref === "string"
				? ((pullRequest.base as Record<string, unknown>).ref as string)
				: "",
		author: mapActor(
			typeof pullRequest.user === "object" && pullRequest.user !== null
				? (pullRequest.user as Record<string, unknown>)
				: null,
		),
		createdAt: String(pullRequest.created_at ?? new Date().toISOString()),
		updatedAt: String(pullRequest.updated_at ?? new Date().toISOString()),
		mergedAt,
		closedAt:
			typeof pullRequest.closed_at === "string" ? pullRequest.closed_at : null,
		mergeCommitSha:
			typeof pullRequest.merge_commit_sha === "string"
				? pullRequest.merge_commit_sha
				: null,
	};
}

function normalizeGitHubReviewState(
	state: string | null,
): GitPullRequestReview["state"] {
	switch ((state ?? "").toUpperCase()) {
		case "APPROVED":
			return "approved";
		case "CHANGES_REQUESTED":
			return "changes_requested";
		case "COMMENTED":
			return "commented";
		case "DISMISSED":
			return "dismissed";
		case "PENDING":
			return "pending";
		default:
			return "unknown";
	}
}

function mapPullRequestReview(
	review: Record<string, unknown>,
	providerId: string,
	repositoryPath: string,
	pullRequestNumber: number,
): GitPullRequestReview {
	return {
		providerId,
		repositoryPath,
		pullRequestNumber,
		id: String(review.id ?? review.node_id ?? ""),
		state: normalizeGitHubReviewState(
			typeof review.state === "string" ? review.state : null,
		),
		body:
			typeof review.body === "string" && review.body.length > 0
				? review.body
				: null,
		author: mapActor(
			typeof review.user === "object" && review.user !== null
				? (review.user as Record<string, unknown>)
				: null,
		),
		submittedAt:
			typeof review.submitted_at === "string" ? review.submitted_at : null,
		htmlUrl: typeof review.html_url === "string" ? review.html_url : null,
	};
}

function mapComment(
	comment: Record<string, unknown>,
	providerId: string,
	repositoryPath: string,
	pullRequestNumber: number,
): GitComment {
	return {
		providerId,
		repositoryPath,
		pullRequestNumber,
		id: String(comment.id ?? comment.node_id ?? ""),
		body: String(comment.body ?? ""),
		htmlUrl:
			typeof comment.html_url === "string"
				? comment.html_url
				: typeof comment.url === "string"
					? comment.url
					: null,
		path: typeof comment.path === "string" ? comment.path : null,
		line:
			typeof comment.line === "number"
				? comment.line
				: typeof comment.original_line === "number"
					? comment.original_line
					: null,
		side:
			comment.side === "LEFT" || comment.side === "RIGHT" ? comment.side : null,
		author: mapActor(
			typeof comment.user === "object" && comment.user !== null
				? (comment.user as Record<string, unknown>)
				: null,
		),
		createdAt: String(comment.created_at ?? new Date().toISOString()),
		updatedAt: String(comment.updated_at ?? new Date().toISOString()),
	};
}

function normalizePullRequestFileStatus(
	status: string | null | undefined,
): GitPullRequestFileStatus {
	switch (status) {
		case "added":
		case "modified":
		case "removed":
		case "renamed":
		case "copied":
			return status;
		default:
			return "changed";
	}
}

function mapPullRequestFile(
	file: Record<string, unknown>,
	providerId: string,
	repositoryPath: string,
	pullRequestNumber: number,
): GitPullRequestFile {
	return {
		providerId,
		repositoryPath,
		pullRequestNumber,
		path: String(file.filename ?? ""),
		previousPath:
			typeof file.previous_filename === "string"
				? file.previous_filename
				: null,
		status: normalizePullRequestFileStatus(
			typeof file.status === "string" ? file.status : null,
		),
		additions: Number(file.additions ?? 0),
		deletions: Number(file.deletions ?? 0),
		patch: typeof file.patch === "string" ? file.patch : null,
		htmlUrl:
			typeof file.blob_url === "string"
				? file.blob_url
				: typeof file.raw_url === "string"
					? file.raw_url
					: null,
	};
}

function mapSearchResult(
	item: Record<string, unknown>,
	providerId: string,
	repositoryPath: string,
): GitRepositorySearchResult {
	return {
		providerId,
		repositoryPath,
		kind: item.pull_request ? "pull_request" : "issue",
		id: String(item.id ?? item.node_id ?? item.number ?? ""),
		number: Number(item.number ?? 0),
		title: String(item.title ?? ""),
		body: typeof item.body === "string" ? item.body : null,
		state: typeof item.state === "string" ? item.state : "open",
		htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
		author: mapActor(
			typeof item.user === "object" && item.user !== null
				? (item.user as Record<string, unknown>)
				: null,
		),
		createdAt: String(item.created_at ?? new Date().toISOString()),
		updatedAt: String(item.updated_at ?? new Date().toISOString()),
	};
}

function mapRepositoryLabel(
	label: Record<string, unknown>,
	providerId: string,
	repositoryPath: string,
): GitRepositoryLabel {
	return {
		providerId,
		repositoryPath,
		name: String(label.name ?? ""),
		description:
			typeof label.description === "string" ? label.description : null,
		color: typeof label.color === "string" ? label.color : null,
	};
}

function splitGitHubRepositoryPath(repositoryPath: string) {
	const { owner, repo } = splitRepositoryPath(repositoryPath);
	return { owner, repo };
}

async function resolveGitHubRepositoryInstallationId({
	appId,
	privateKey,
	clientId,
	clientSecret,
	apiBaseUrl,
	userAgent,
	repositoryPath,
}: {
	appId: string;
	privateKey: string;
	clientId?: string;
	clientSecret?: string;
	apiBaseUrl: string;
	userAgent: string;
	repositoryPath: string;
}) {
	const { owner, repo } = splitGitHubRepositoryPath(repositoryPath);
	const appOctokit = new Octokit({
		baseUrl: normalizeBaseUrl(apiBaseUrl),
		userAgent,
		authStrategy: createAppAuth,
		auth: {
			appId,
			privateKey,
			clientId,
			clientSecret,
		},
	});
	const response = await appOctokit.request(
		"GET /repos/{owner}/{repo}/installation",
		{
			owner,
			repo,
		},
	);
	const installationId = Number(response.data.id);
	if (!Number.isInteger(installationId) || installationId <= 0) {
		throw new GitProviderConfigurationError(
			"GitHub App installation id could not be resolved for repository.",
			"github",
		);
	}
	return installationId;
}

function createGitHubWebhookVerifier(
	providerId: string,
	webhookSecrets: string[] = [],
): GitWebhookAdapter {
	return {
		providerId,
		// GitHub signs the raw body with an HMAC-SHA256 signature, so a successful
		// verify proves both secret knowledge AND body integrity.
		verificationStrength: "hmac",
		verify: async ({ headers, rawBody }) => {
			const signature = getHeaderValue(headers, "x-hub-signature-256");

			if (!signature || webhookSecrets.length === 0) {
				return false;
			}

			if (webhookSecrets.length > 1) {
				return verifyWithFallback(
					webhookSecrets[0] ?? "",
					rawBody,
					signature,
					webhookSecrets.slice(1),
				);
			}

			return verify(webhookSecrets[0] ?? "", rawBody, signature);
		},
		parse: ({ headers, rawBody }) => {
			const payload = JSON.parse(rawBody) as GitHubWebhookPayload;
			const repositoryPayload =
				payload.repository && typeof payload.repository === "object"
					? payload.repository
					: null;
			const repositoryPath = String(
				repositoryPayload?.full_name ?? "unknown/unknown",
			);

			return {
				providerId,
				event: getHeaderValue(headers, "x-github-event") ?? "unknown",
				action: payload.action ?? null,
				deliveryId: getHeaderValue(headers, "x-github-delivery"),
				repository: repositoryPayload
					? mapRepository(repositoryPayload, providerId, repositoryPath)
					: null,
				sender:
					payload.sender && typeof payload.sender === "object"
						? mapActor(payload.sender)
						: null,
				payload: payload as GitHubWebhookPayload,
				headers: normalizeHeaderRecord(headers),
				rawBody,
			};
		},
	};
}

export function createGitHubAdapter({
	providerId = "github",
	label = getGitProviderLabel("github"),
	authBaseUrl = "https://github.com",
	apiBaseUrl = "https://api.github.com",
	auth,
	userAgent = "GitPal",
	webhookSecrets = [],
}: GitHubAdapterOptions = {}): GitProviderAdapter {
	const octokitOptions: ConstructorParameters<typeof Octokit>[0] = {
		baseUrl: normalizeBaseUrl(apiBaseUrl),
		userAgent,
	};

	if (auth) {
		if (auth.type === "github-app") {
			octokitOptions.authStrategy = createAppAuth;
			octokitOptions.auth = {
				appId: auth.appId,
				privateKey: auth.privateKey,
				installationId: auth.installationId,
				clientId: auth.clientId,
				clientSecret: auth.clientSecret,
			};
		} else if (auth.type === "token") {
			octokitOptions.auth = auth.token;
		} else {
			throw new GitProviderConfigurationError(
				`Unsupported auth type '${auth.type}' for GitHub provider.`,
				providerId,
			);
		}
	}

	const octokit = new Octokit(octokitOptions);

	async function listRepositories(): Promise<GitRepository[]> {
		const response = await octokit.paginate(
			octokit.rest.repos.listForAuthenticatedUser,
			{
				affiliation: "owner,collaborator,organization_member",
				per_page: 100,
				sort: "updated",
			},
		);

		return response.map((repository) =>
			mapRepository(
				repository as Record<string, unknown>,
				providerId,
				String(repository.full_name ?? repository.name ?? "unknown/unknown"),
			),
		);
	}

	async function getCurrentUser(): Promise<GitActor> {
		const response = await octokit.rest.users.getAuthenticated();
		return (
			mapActor(response.data as Record<string, unknown>) ?? {
				id: String(response.data.id ?? "unknown"),
				login: response.data.login ?? null,
				name: response.data.name ?? response.data.login ?? null,
				email: response.data.email ?? null,
				avatarUrl: response.data.avatar_url ?? null,
				htmlUrl: response.data.html_url ?? null,
				kind: "user",
			}
		);
	}

	async function getRepository(
		input: GitRepositoryRef,
	): Promise<GitRepository> {
		const { owner, repo } = splitGitHubRepositoryPath(input.repositoryPath);
		const response = await octokit.rest.repos.get({
			owner,
			repo,
		});

		return mapRepository(
			response.data as Record<string, unknown>,
			providerId,
			input.repositoryPath,
		);
	}

	async function listPullRequests(
		input: GitRepositoryRef & { state?: GitPullRequestState },
	) {
		const { owner, repo } = splitGitHubRepositoryPath(input.repositoryPath);
		const requestedState = input.state ?? "open";
		const state = requestedState === "merged" ? "closed" : requestedState;
		const response = await octokit.paginate(octokit.rest.pulls.list, {
			owner,
			repo,
			state,
			per_page: 100,
		});

		const mapped = response.map((pullRequest) =>
			mapPullRequest(
				pullRequest as Record<string, unknown>,
				providerId,
				input.repositoryPath,
			),
		);

		if (requestedState === "merged") {
			return mapped.filter((pullRequest) => pullRequest.state === "merged");
		}

		return mapped;
	}

	async function getPullRequest(
		input: GitRepositoryRef & { pullRequestNumber: number },
	) {
		const { owner, repo } = splitGitHubRepositoryPath(input.repositoryPath);
		const response = await octokit.rest.pulls.get({
			owner,
			repo,
			pull_number: input.pullRequestNumber,
		});

		return mapPullRequest(
			response.data as Record<string, unknown>,
			providerId,
			input.repositoryPath,
		);
	}

	async function listPullRequestFiles(
		input: GitRepositoryRef & { pullRequestNumber: number },
	) {
		const { owner, repo } = splitGitHubRepositoryPath(input.repositoryPath);
		const response = await octokit.paginate(octokit.rest.pulls.listFiles, {
			owner,
			repo,
			pull_number: input.pullRequestNumber,
			per_page: 100,
		});

		return response.map((file) =>
			mapPullRequestFile(
				file as Record<string, unknown>,
				providerId,
				input.repositoryPath,
				input.pullRequestNumber,
			),
		);
	}

	async function listPullRequestComments(
		input: GitRepositoryRef & { pullRequestNumber: number },
	) {
		const { owner, repo } = splitGitHubRepositoryPath(input.repositoryPath);
		const [issueComments, reviewComments] = await Promise.all([
			octokit.paginate(octokit.rest.issues.listComments, {
				owner,
				repo,
				issue_number: input.pullRequestNumber,
				per_page: 100,
			}),
			octokit.paginate(octokit.rest.pulls.listReviewComments, {
				owner,
				repo,
				pull_number: input.pullRequestNumber,
				per_page: 100,
			}),
		]);

		return [...issueComments, ...reviewComments]
			.map((comment) =>
				mapComment(
					comment as Record<string, unknown>,
					providerId,
					input.repositoryPath,
					input.pullRequestNumber,
				),
			)
			.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
	}

	async function listPullRequestReviews(
		input: GitRepositoryRef & { pullRequestNumber: number },
	): Promise<GitPullRequestReview[]> {
		const { owner, repo } = splitGitHubRepositoryPath(input.repositoryPath);
		const response = await octokit.paginate(octokit.rest.pulls.listReviews, {
			owner,
			repo,
			pull_number: input.pullRequestNumber,
			per_page: 100,
		});

		return response
			.map((review) =>
				mapPullRequestReview(
					review as Record<string, unknown>,
					providerId,
					input.repositoryPath,
					input.pullRequestNumber,
				),
			)
			.sort((left, right) =>
				(left.submittedAt ?? "").localeCompare(right.submittedAt ?? ""),
			);
	}

	async function getFileContent(
		input: GitRepositoryRef & { filePath: string; ref?: string },
	) {
		const { owner, repo } = splitGitHubRepositoryPath(input.repositoryPath);
		const response = await octokit.rest.repos.getContent({
			owner,
			repo,
			path: input.filePath,
			...(input.ref ? { ref: input.ref } : {}),
		});
		const file = response.data as Record<string, unknown>;

		if (Array.isArray(response.data)) {
			throw new GitProviderConfigurationError(
				"Expected a file but received a directory listing.",
				providerId,
			);
		}

		const content =
			typeof file.content === "string" ? file.content.replace(/\n/g, "") : "";
		const encoding =
			file.encoding === "base64"
				? "base64"
				: file.encoding === "utf-8"
					? "utf-8"
					: "unknown";

		return {
			providerId,
			repositoryPath: input.repositoryPath,
			path: input.filePath,
			ref: input.ref ?? null,
			content:
				encoding === "base64"
					? Buffer.from(content, "base64").toString("utf8")
					: content,
			size: typeof file.size === "number" ? file.size : null,
			sha: typeof file.sha === "string" ? file.sha : null,
			encoding,
		} satisfies GitRepositoryFile;
	}

	async function searchRepository(
		input: GitRepositoryRef & {
			query?: string;
			kind?: GitRepositorySearchKind[];
			limit?: number;
		},
	) {
		const { owner, repo } = splitGitHubRepositoryPath(input.repositoryPath);
		const requestedKinds = input.kind ?? ["issue", "pull_request"];
		const limit = Math.min(Math.max(input.limit ?? 10, 1), 20);
		const query = input.query?.trim();

		if (!query) {
			const response = await octokit.paginate(octokit.rest.issues.listForRepo, {
				owner,
				repo,
				state: "all",
				sort: "updated",
				direction: "desc",
				per_page: limit,
			});

			return response
				.map((item) =>
					mapSearchResult(
						item as Record<string, unknown>,
						providerId,
						input.repositoryPath,
					),
				)
				.filter((item) => requestedKinds.includes(item.kind))
				.slice(0, limit);
		}

		const qualifier =
			requestedKinds.length === 1
				? requestedKinds[0] === "issue"
					? " is:issue"
					: " is:pr"
				: "";
		const response = await octokit.rest.search.issuesAndPullRequests({
			q: `repo:${owner}/${repo}${qualifier} ${query}`.trim(),
			per_page: limit,
		});

		return response.data.items
			.map((item) =>
				mapSearchResult(
					item as Record<string, unknown>,
					providerId,
					input.repositoryPath,
				),
			)
			.filter((item) => requestedKinds.includes(item.kind))
			.slice(0, limit);
	}

	async function listRepositoryLabels(
		input: GitRepositoryRef & { query?: string; limit?: number },
	) {
		const { owner, repo } = splitGitHubRepositoryPath(input.repositoryPath);
		const limit = Math.min(Math.max(input.limit ?? 100, 1), 100);
		const query = input.query?.trim().toLowerCase() ?? "";
		const response = await octokit.paginate(
			octokit.rest.issues.listLabelsForRepo,
			{
				owner,
				repo,
				per_page: 100,
			},
		);

		return response
			.map((label) =>
				mapRepositoryLabel(
					label as Record<string, unknown>,
					providerId,
					input.repositoryPath,
				),
			)
			.filter((label) => {
				if (!query) {
					return true;
				}

				return (
					label.name.toLowerCase().includes(query) ||
					(label.description ?? "").toLowerCase().includes(query)
				);
			})
			.slice(0, limit);
	}

	async function createPullRequest(input: GitPullRequestCreateInput) {
		const { owner, repo } = splitGitHubRepositoryPath(input.repositoryPath);
		const response = await octokit.rest.pulls.create({
			owner,
			repo,
			title: input.title,
			head: input.headBranch,
			base: input.baseBranch,
			body: input.body,
			draft: input.draft,
		});

		return mapPullRequest(
			response.data as Record<string, unknown>,
			providerId,
			input.repositoryPath,
		);
	}

	async function createComment(input: GitCommentInput) {
		const { owner, repo } = splitGitHubRepositoryPath(input.repositoryPath);

		if (input.path && input.line && (input.commitSha ?? input.headSha)) {
			const commitSha = input.commitSha ?? input.headSha;

			if (!commitSha) {
				return mapComment(
					await octokit.rest.issues
						.createComment({
							owner,
							repo,
							issue_number: input.pullRequestNumber,
							body: input.body,
						})
						.then((response) => response.data as Record<string, unknown>),
					providerId,
					input.repositoryPath,
					input.pullRequestNumber,
				);
			}

			const response = await octokit.rest.pulls.createReviewComment({
				owner,
				repo,
				pull_number: input.pullRequestNumber,
				body: input.body,
				path: input.path,
				line: input.line,
				side: input.side ?? "RIGHT",
				commit_id: commitSha,
			});

			return mapComment(
				response.data as Record<string, unknown>,
				providerId,
				input.repositoryPath,
				input.pullRequestNumber,
			);
		}

		const response = await octokit.rest.issues.createComment({
			owner,
			repo,
			issue_number: input.pullRequestNumber,
			body: input.body,
		});

		return mapComment(
			response.data as Record<string, unknown>,
			providerId,
			input.repositoryPath,
			input.pullRequestNumber,
		);
	}

	async function addIssueLabels(
		input: GitRepositoryRef & { issueNumber: number; labels: string[] },
	) {
		if (input.labels.length === 0) {
			return;
		}

		const { owner, repo } = splitGitHubRepositoryPath(input.repositoryPath);
		await octokit.rest.issues.addLabels({
			owner,
			repo,
			issue_number: input.issueNumber,
			labels: input.labels,
		});
	}

	async function addPullRequestLabels(
		input: GitRepositoryRef & { pullRequestNumber: number; labels: string[] },
	) {
		if (input.labels.length === 0) {
			return;
		}

		await addIssueLabels({
			repositoryPath: input.repositoryPath,
			issueNumber: input.pullRequestNumber,
			labels: input.labels,
		});
	}

	async function requestPullRequestReviewers(
		input: GitRepositoryRef & {
			pullRequestNumber: number;
			reviewers?: string[];
			reviewerIds?: number[];
			teamReviewers?: string[];
		},
	) {
		const reviewers = input.reviewers ?? [];
		const teamReviewers = input.teamReviewers ?? [];

		if (reviewers.length === 0 && teamReviewers.length === 0) {
			return;
		}

		const { owner, repo } = splitGitHubRepositoryPath(input.repositoryPath);
		await octokit.rest.pulls.requestReviewers({
			owner,
			repo,
			pull_number: input.pullRequestNumber,
			...(reviewers.length > 0 ? { reviewers } : {}),
			...(teamReviewers.length > 0 ? { team_reviewers: teamReviewers } : {}),
		});
	}

	async function mergePullRequest(
		input: GitRepositoryRef & {
			pullRequestNumber: number;
			mergeMethod?: GitMergeMethod;
			title?: string;
			message?: string;
			removeSourceBranch?: boolean;
		},
	) {
		const { owner, repo } = splitGitHubRepositoryPath(input.repositoryPath);

		await octokit.rest.pulls.merge({
			owner,
			repo,
			pull_number: input.pullRequestNumber,
			merge_method: input.mergeMethod,
			commit_title: input.title,
			commit_message: input.message,
		});

		// GitHub does not delete the source branch as part of merging. When the
		// caller opts in (parity with GitLab's should_remove_source_branch), delete
		// the head ref explicitly. Best-effort: a failure here (e.g. protected or
		// already-deleted branch, or a fork) must not fail the merge itself.
		if (input.removeSourceBranch) {
			try {
				const pullRequest = await octokit.rest.pulls.get({
					owner,
					repo,
					pull_number: input.pullRequestNumber,
				});
				const headRef = pullRequest.data.head?.ref;
				const sameRepo =
					pullRequest.data.head?.repo?.full_name ===
					pullRequest.data.base?.repo?.full_name;
				// Only delete when the head branch lives in the same repo; deleting a
				// fork's branch is neither possible nor desirable.
				if (headRef && sameRepo) {
					await octokit.rest.git.deleteRef({
						owner,
						repo,
						ref: `heads/${headRef}`,
					});
				}
			} catch (error) {
				log.warn(
					{ err: error, providerId, repositoryPath: input.repositoryPath },
					"Pull request merged but source branch could not be deleted.",
				);
			}
		}

		return getPullRequest(input);
	}

	async function createCommitStatus(input: GitCommitStatusInput) {
		const { owner, repo } = splitGitHubRepositoryPath(input.repositoryPath);
		await octokit.rest.repos.createCommitStatus({
			owner,
			repo,
			sha: input.commitSha,
			state: input.state,
			target_url: input.targetUrl,
			description: input.description,
			context: input.context ?? "default",
		});
	}

	async function listWebhooks(input: GitRepositoryRef) {
		const { owner, repo } = splitGitHubRepositoryPath(input.repositoryPath);
		const response = (await octokit.paginate(octokit.rest.repos.listWebhooks, {
			owner,
			repo,
			per_page: 100,
		})) as Array<{
			id: number;
			config: {
				url?: string;
				secret?: string;
			};
			active: boolean;
			events?: string[];
			created_at?: string;
			updated_at?: string;
		}>;

		return response.map((webhook) => ({
			providerId,
			repositoryPath: input.repositoryPath,
			id: String(webhook.id),
			url: webhook.config.url ?? "",
			active: Boolean(webhook.active),
			events: webhook.events ?? [],
			secretConfigured: Boolean(webhook.config.secret),
			createdAt: webhook.created_at ?? null,
			updatedAt: webhook.updated_at ?? null,
		}));
	}

	async function createWebhook(input: GitWebhookCreateInput) {
		const { owner, repo } = splitGitHubRepositoryPath(input.repositoryPath);
		const response = await octokit.rest.repos.createWebhook({
			owner,
			repo,
			config: {
				url: input.url,
				content_type: "json",
				secret: input.secret,
				insecure_ssl: "0",
			},
			events: input.events ?? ["push", "pull_request"],
			active: input.active ?? true,
		});

		const webhook = response.data;

		return {
			providerId,
			repositoryPath: input.repositoryPath,
			id: String(webhook.id),
			url: webhook.config.url ?? "",
			active: Boolean(webhook.active),
			events: webhook.events ?? [],
			secretConfigured: Boolean(webhook.config.secret),
			createdAt: webhook.created_at ?? null,
			updatedAt: webhook.updated_at ?? null,
		};
	}

	async function deleteWebhook(input: GitWebhookDeleteInput) {
		const { owner, repo } = splitGitHubRepositoryPath(input.repositoryPath);
		const webhookId = Number(input.webhookId);

		if (!Number.isFinite(webhookId)) {
			throw new GitProviderConfigurationError(
				"GitHub webhook IDs must be numeric.",
				providerId,
			);
		}

		await octokit.rest.repos.deleteWebhook({
			owner,
			repo,
			hook_id: webhookId,
		});
	}

	return {
		providerId,
		label,
		baseUrl: normalizeBaseUrl(authBaseUrl),
		apiBaseUrl: normalizeBaseUrl(apiBaseUrl),
		capabilities,
		webhooks: createGitHubWebhookVerifier(providerId, webhookSecrets),
		listRepositories,
		getCurrentUser,
		getRepository,
		listPullRequests,
		getPullRequest,
		listPullRequestFiles,
		listPullRequestComments,
		listPullRequestReviews,
		getFileContent,
		searchRepository,
		listRepositoryLabels,
		createPullRequest,
		createComment,
		addIssueLabels,
		addPullRequestLabels,
		requestPullRequestReviewers,
		mergePullRequest,
		createCommitStatus,
		listWebhooks,
		createWebhook,
		deleteWebhook,
	};
}

export async function createGitHubAppInstallationAdapter({
	providerId = "github",
	label = getGitProviderLabel("github"),
	authBaseUrl = "https://github.com",
	apiBaseUrl = "https://api.github.com",
	appId,
	privateKey,
	installationId,
	repositoryPath,
	clientId,
	clientSecret,
	userAgent = "GitPal",
	webhookSecrets = [],
}: GitHubAppInstallationAdapterOptions): Promise<GitProviderAdapter> {
	const resolvedInstallationId =
		installationId ??
		(repositoryPath
			? await resolveGitHubRepositoryInstallationId({
					appId,
					privateKey,
					clientId,
					clientSecret,
					apiBaseUrl,
					userAgent,
					repositoryPath,
				})
			: null);

	if (!resolvedInstallationId) {
		throw new GitProviderConfigurationError(
			"GitHub App authentication requires an installation id or repository path.",
			providerId,
		);
	}

	return createGitHubAdapter({
		providerId,
		label,
		authBaseUrl,
		apiBaseUrl,
		auth: {
			type: "github-app",
			appId,
			privateKey,
			installationId: resolvedInstallationId,
			clientId,
			clientSecret,
		},
		userAgent,
		webhookSecrets,
	});
}
