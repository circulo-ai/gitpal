import { verify, verifyWithFallback } from "@octokit/webhooks-methods";
import { Octokit } from "octokit";

import {
	type GitActor,
	type GitComment,
	type GitCommentInput,
	type GitMergeMethod,
	type GitProviderAdapter,
	type GitProviderCapabilities,
	type GitPullRequest,
	type GitPullRequestFile,
	type GitPullRequestFileStatus,
	type GitPullRequestCreateInput,
	type GitPullRequestState,
	type GitRepository,
	type GitRepositoryFile,
	type GitRepositoryRef,
	type GitRepositorySearchKind,
	type GitRepositorySearchResult,
	type GitWorkspaceRef,
	type GitWebhookAdapter,
	type GitWebhookCreateInput,
	type GitWebhookDeleteInput,
	getGitProviderLabel,
	getHeaderValue,
	normalizeBaseUrl,
	normalizeHeaderRecord,
	splitRepositoryPath,
} from "./core";
import { GitProviderConfigurationError } from "./errors";

type GitHubAdapterOptions = {
	providerId?: string;
	label?: string;
	authBaseUrl?: string;
	apiBaseUrl?: string;
	token?: string;
	userAgent?: string;
	webhookSecrets?: string[];
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
	webhooks: true,
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

function splitGitHubRepositoryPath(repositoryPath: string) {
	const { owner, repo } = splitRepositoryPath(repositoryPath);
	return { owner, repo };
}

function createGitHubWebhookVerifier(
	providerId: string,
	webhookSecrets: string[] = [],
): GitWebhookAdapter {
	return {
		providerId,
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
	token,
	userAgent = "GitPal",
	webhookSecrets = [],
}: GitHubAdapterOptions = {}): GitProviderAdapter {
	const octokit = new Octokit({
		auth: token,
		baseUrl: normalizeBaseUrl(apiBaseUrl),
		userAgent,
	});

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
			typeof file.content === "string"
				? file.content.replace(/\n/g, "")
				: "";
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

	async function mergePullRequest(
		input: GitRepositoryRef & {
			pullRequestNumber: number;
			mergeMethod?: GitMergeMethod;
			title?: string;
			message?: string;
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

		return getPullRequest(input);
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
		getRepository,
		listPullRequests,
		getPullRequest,
		listPullRequestFiles,
		listPullRequestComments,
		getFileContent,
		searchRepository,
		createPullRequest,
		createComment,
		mergePullRequest,
		listWebhooks,
		createWebhook,
		deleteWebhook,
	};
}
