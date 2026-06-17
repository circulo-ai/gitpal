import { z } from "zod";
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
	type GitRepositoryLabel,
	type GitRepositoryFile,
	type GitRepositoryRef,
	type GitRepositorySearchKind,
	type GitRepositorySearchResult,
	type GitWorkspaceRef,
	type GitWebhookCreateInput,
	type GitWebhookDeleteInput,
	type GitWebhookSubscription,
	getGitProviderLabel,
	getHeaderValue,
	normalizeBaseUrl,
	normalizeGitHostUrl,
	normalizeHeaderRecord,
} from "./core";
import { requestJson } from "./request";

type GitLabAdapterOptions = {
	providerId?: string;
	label?: string;
	baseUrl?: string;
	apiBaseUrl?: string;
	token?: string;
	tokenType?: "bearer" | "private-token";
	webhookSecrets?: string[];
};

type GitLabProject = {
	id: number;
	path_with_namespace: string;
	web_url: string;
	default_branch?: string | null;
	name: string;
	description?: string | null;
	visibility?: string;
	created_at?: string;
	last_activity_at?: string;
	namespace?: {
		id?: number;
		full_path?: string;
		path?: string;
		kind?: string;
		web_url?: string;
		name?: string;
		avatar_url?: string | null;
	} | null;
	owner?: {
		id?: number;
		username?: string;
		name?: string;
		public_email?: string | null;
		avatar_url?: string | null;
		web_url?: string | null;
	} | null;
};

type GitLabMergeRequest = {
	id: number;
	iid: number;
	project_id?: number;
	title: string;
	description?: string | null;
	state: string;
	draft?: boolean;
	web_url: string;
	source_branch: string;
	target_branch: string;
	author?: {
		id?: number;
		username?: string;
		name?: string;
		public_email?: string | null;
		avatar_url?: string | null;
		web_url?: string | null;
	} | null;
	created_at: string;
	updated_at: string;
	merged_at?: string | null;
	closed_at?: string | null;
	merge_commit_sha?: string | null;
};

type GitLabIssue = {
	id: number;
	iid: number;
	title: string;
	description?: string | null;
	state: string;
	web_url: string;
	author?: {
		id?: number;
		username?: string;
		name?: string | null;
		public_email?: string | null;
		avatar_url?: string | null;
		web_url?: string | null;
	} | null;
	created_at: string;
	updated_at: string;
};

type GitLabNote = {
	id: number;
	body: string;
	web_url?: string | null;
	path?: string | null;
	line?: number | null;
	position?: {
		position_type?: string | null;
		old_path?: string | null;
		new_path?: string | null;
		old_line?: number | null;
		new_line?: number | null;
	} | null;
	author?: {
		id?: number;
		username?: string;
		name?: string;
		public_email?: string | null;
		avatar_url?: string | null;
		web_url?: string | null;
	} | null;
	created_at?: string;
	updated_at?: string;
};

type GitLabMergeRequestChangesResponse = {
	changes?: Array<{
		old_path?: string;
		new_path?: string;
		diff?: string | null;
		new_file?: boolean;
		renamed_file?: boolean;
		deleted_file?: boolean;
	}> | null;
};

type GitLabHook = {
	id: number;
	url: string;
	active: boolean;
	created_at?: string;
	updated_at?: string;
	push_events?: boolean;
	merge_requests_events?: boolean;
	tag_push_events?: boolean;
	note_events?: boolean;
	issues_events?: boolean;
	confidential_issues_events?: boolean;
	pipeline_events?: boolean;
	job_events?: boolean;
	wiki_page_events?: boolean;
	deployments_events?: boolean;
	releases_events?: boolean;
	feature_flag_events?: boolean;
	confidential_note_events?: boolean;
};

type GitLabWebhookPayload = {
	object_kind?: string;
	event_type?: string;
	object_attributes?: Record<string, unknown> | null;
	project?: Record<string, unknown> | null;
	user?: Record<string, unknown> | null;
	user_username?: string | null;
	repository?: Record<string, unknown> | null;
};

const capabilities: GitProviderCapabilities = {
	repositories: true,
	pullRequests: true,
	comments: true,
	webhooks: true,
};

const gitlabProjectSchema = z.object({
	id: z.number(),
	path_with_namespace: z.string(),
	web_url: z.string(),
	default_branch: z.string().nullable().optional(),
	name: z.string(),
	description: z.string().nullable().optional(),
	created_at: z.string().optional(),
	last_activity_at: z.string().optional(),
	namespace: z
		.object({
			id: z.number().optional(),
			full_path: z.string().optional(),
			path: z.string().optional(),
			kind: z.string().optional(),
			web_url: z.string().optional(),
			name: z.string().optional(),
			avatar_url: z.string().nullable().optional(),
		})
		.nullable()
		.optional(),
	owner: z
		.object({
			id: z.number().optional(),
			username: z.string().optional(),
			name: z.string().optional(),
			public_email: z.string().nullable().optional(),
			avatar_url: z.string().nullable().optional(),
			web_url: z.string().nullable().optional(),
		})
		.nullable()
		.optional(),
});

const gitlabMergeRequestSchema = z.object({
	id: z.number(),
	iid: z.number(),
	project_id: z.number().optional(),
	title: z.string(),
	description: z.string().nullable().optional(),
	state: z.string(),
	draft: z.boolean().optional(),
	web_url: z.string(),
	source_branch: z.string(),
	target_branch: z.string(),
	author: z
		.object({
			id: z.number().optional(),
			username: z.string().optional(),
			name: z.string().optional(),
			public_email: z.string().nullable().optional(),
			avatar_url: z.string().nullable().optional(),
			web_url: z.string().nullable().optional(),
		})
		.nullable()
		.optional(),
	created_at: z.string(),
	updated_at: z.string(),
	merged_at: z.string().nullable().optional(),
	closed_at: z.string().nullable().optional(),
	merge_commit_sha: z.string().nullable().optional(),
});

const gitlabIssueSchema = z.object({
	id: z.number(),
	iid: z.number(),
	title: z.string(),
	description: z.string().nullable().optional(),
	state: z.string(),
	web_url: z.string(),
	author: z
		.object({
			id: z.number().optional(),
			username: z.string().optional(),
			name: z.string().nullable().optional(),
			public_email: z.string().nullable().optional(),
			avatar_url: z.string().nullable().optional(),
			web_url: z.string().nullable().optional(),
		})
		.nullable()
		.optional(),
	created_at: z.string(),
	updated_at: z.string(),
});

const gitlabNoteSchema = z.object({
	id: z.number(),
	body: z.string(),
	web_url: z.string().nullable().optional(),
	path: z.string().nullable().optional(),
	line: z.number().nullable().optional(),
	position: z
		.object({
			position_type: z.string().nullable().optional(),
			old_path: z.string().nullable().optional(),
			new_path: z.string().nullable().optional(),
			old_line: z.number().nullable().optional(),
			new_line: z.number().nullable().optional(),
		})
		.nullable()
		.optional(),
	author: z
		.object({
			id: z.number().optional(),
			username: z.string().optional(),
			name: z.string().optional(),
			public_email: z.string().nullable().optional(),
			avatar_url: z.string().nullable().optional(),
			web_url: z.string().nullable().optional(),
		})
		.nullable()
		.optional(),
	created_at: z.string().optional(),
	updated_at: z.string().optional(),
});

const gitlabHookSchema = z.object({
	id: z.number(),
	url: z.string(),
	active: z.boolean(),
	created_at: z.string().optional(),
	updated_at: z.string().optional(),
	push_events: z.boolean().optional(),
	merge_requests_events: z.boolean().optional(),
	tag_push_events: z.boolean().optional(),
	note_events: z.boolean().optional(),
	issues_events: z.boolean().optional(),
	confidential_issues_events: z.boolean().optional(),
	pipeline_events: z.boolean().optional(),
	job_events: z.boolean().optional(),
	wiki_page_events: z.boolean().optional(),
	deployments_events: z.boolean().optional(),
	releases_events: z.boolean().optional(),
	feature_flag_events: z.boolean().optional(),
	confidential_note_events: z.boolean().optional(),
});

const gitlabLabelSchema = z.object({
	name: z.string(),
	description: z.string().nullable().optional(),
	color: z.string().nullable().optional(),
});

function mapActor(
	actor:
		| {
				id?: number;
				username?: string;
				name?: string | null;
				public_email?: string | null;
				avatar_url?: string | null;
				web_url?: string | null;
		  }
		| null
		| undefined,
): GitActor | null {
	if (!actor) {
		return null;
	}

	const login = actor.username ?? null;
	const name = actor.name ?? login;

	return {
		id: String(actor.id ?? login ?? name ?? "unknown"),
		login,
		name,
		email: actor.public_email ?? null,
		avatarUrl: actor.avatar_url ?? null,
		htmlUrl: actor.web_url ?? null,
		kind: "user",
	};
}

function mapWorkspace(
	project: GitLabProject,
	repositoryPath: string,
): GitWorkspaceRef | null {
	const namespace = project.namespace ?? null;
	const ownerPath =
		namespace?.full_path?.trim() ||
		namespace?.path?.trim() ||
		repositoryPath.split("/").filter(Boolean)[0] ||
		"";

	if (!ownerPath) {
		return null;
	}

	const scope = namespace?.kind === "group" ? "group" : "personal";
	const ownerId = namespace?.id ? String(namespace.id) : ownerPath;

	return {
		providerOwnerId: ownerId,
		providerOwnerPath: ownerPath,
		providerOwnerName: namespace?.name?.trim() || ownerPath,
		providerOwnerAvatarUrl:
			namespace?.avatar_url ?? project.owner?.avatar_url ?? null,
		providerOwnerHtmlUrl: namespace?.web_url ?? project.owner?.web_url ?? null,
		scope,
	};
}

function mapRepository(
	project: GitLabProject,
	providerId: string,
): GitRepository {
	const repositoryPath =
		project.path_with_namespace.trim() || "unknown/unknown";

	return {
		providerId,
		repositoryPath,
		repositoryId: String(project.id),
		name: project.name || repositoryPath.split("/").at(-1) || "unknown",
		fullName: repositoryPath,
		htmlUrl: project.web_url,
		defaultBranch: project.default_branch ?? "main",
		private: project.visibility ? project.visibility !== "public" : true,
		description: project.description ?? null,
		owner: mapActor(project.owner ?? undefined),
		workspace: mapWorkspace(project, repositoryPath),
	};
}

function mapPullRequest(
	mergeRequest: GitLabMergeRequest,
	providerId: string,
	repositoryPath: string,
): GitPullRequest {
	const mergedAt = mergeRequest.merged_at ?? null;

	return {
		providerId,
		repositoryPath,
		number: mergeRequest.iid,
		id: String(mergeRequest.id),
		title: mergeRequest.title,
		body: mergeRequest.description ?? null,
		state:
			mergedAt || mergeRequest.state === "merged"
				? "merged"
				: mergeRequest.state === "closed"
					? "closed"
					: "open",
		draft: Boolean(mergeRequest.draft),
		htmlUrl: mergeRequest.web_url,
		sourceBranch: mergeRequest.source_branch,
		targetBranch: mergeRequest.target_branch,
		author: mapActor(mergeRequest.author ?? undefined),
		createdAt: mergeRequest.created_at,
		updatedAt: mergeRequest.updated_at,
		mergedAt,
		closedAt: mergeRequest.closed_at ?? null,
	mergeCommitSha: mergeRequest.merge_commit_sha ?? null,
	};
}

function getGitLabFileStatus(change: {
	new_file?: boolean;
	renamed_file?: boolean;
	deleted_file?: boolean;
}): GitPullRequestFileStatus {
	if (change.deleted_file) {
		return "removed";
	}

	if (change.renamed_file) {
		return "renamed";
	}

	if (change.new_file) {
		return "added";
	}

	return "modified";
}

function mapComment(
	note: GitLabNote,
	providerId: string,
	repositoryPath: string,
	pullRequestNumber: number,
): GitComment {
	const position = note.position ?? null;

	return {
		providerId,
		repositoryPath,
		pullRequestNumber,
		id: String(note.id),
		body: note.body,
		htmlUrl: note.web_url ?? null,
		path: note.path ?? position?.new_path ?? position?.old_path ?? null,
		line: note.line ?? position?.new_line ?? position?.old_line ?? null,
		side: null,
		author: mapActor(note.author ?? undefined),
		createdAt: note.created_at ?? new Date().toISOString(),
		updatedAt: note.updated_at ?? note.created_at ?? new Date().toISOString(),
	};
}

function mapPullRequestFile(
	change: NonNullable<GitLabMergeRequestChangesResponse["changes"]>[number],
	providerId: string,
	repositoryPath: string,
	pullRequestNumber: number,
): GitPullRequestFile {
	const nextPath = change.new_path ?? change.old_path ?? "";
	const previousPath =
		change.old_path && change.old_path !== nextPath ? change.old_path : null;
	const patch = change.diff ?? null;
	const additions =
		patch?.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"))
			.length ?? 0;
	const deletions =
		patch?.split("\n").filter((line) => line.startsWith("-") && !line.startsWith("---"))
			.length ?? 0;

	return {
		providerId,
		repositoryPath,
		pullRequestNumber,
		path: nextPath,
		previousPath,
		status: getGitLabFileStatus(change),
		additions,
		deletions,
		patch,
		htmlUrl: null,
	};
}

function mapSearchResult(
	item: GitLabIssue | GitLabMergeRequest,
	providerId: string,
	repositoryPath: string,
	kind: GitRepositorySearchKind,
): GitRepositorySearchResult {
	return {
		providerId,
		repositoryPath,
		kind,
		id: String(item.id),
		number: item.iid,
		title: item.title,
		body: item.description ?? null,
		state: item.state,
		htmlUrl: item.web_url,
		author: mapActor(item.author ?? undefined),
		createdAt: item.created_at,
		updatedAt: item.updated_at,
	};
}

function mapRepositoryLabel(
	label: z.infer<typeof gitlabLabelSchema>,
	providerId: string,
	repositoryPath: string,
): GitRepositoryLabel {
	return {
		providerId,
		repositoryPath,
		name: label.name,
		description: label.description ?? null,
		color: label.color ?? null,
	};
}

function createGitLabRequestHeaders(
	token: string | undefined,
	tokenType: "bearer" | "private-token" = "bearer",
) {
	const headers: Record<string, string> = {};

	if (!token) {
		return headers;
	}

	if (tokenType === "private-token") {
		headers["PRIVATE-TOKEN"] = token;
		return headers;
	}

	headers.Authorization = `Bearer ${token}`;
	return headers;
}

function createRepositoryUrl(apiBaseUrl: string, repositoryPath: string) {
	return `${normalizeBaseUrl(apiBaseUrl)}/projects/${encodeURIComponent(repositoryPath)}`;
}

function createIssueUrl(
	apiBaseUrl: string,
	repositoryPath: string,
	issueNumber: number,
) {
	return `${createRepositoryUrl(apiBaseUrl, repositoryPath)}/issues/${issueNumber}`;
}

function createMergeRequestUrl(
	apiBaseUrl: string,
	repositoryPath: string,
	pullRequestNumber: number,
) {
	return `${createRepositoryUrl(apiBaseUrl, repositoryPath)}/merge_requests/${pullRequestNumber}`;
}

function createGitLabWebhookVerifier(
	providerId: string,
	webhookSecrets: string[] = [],
): GitProviderAdapter["webhooks"] {
	return {
		providerId,
		verify: ({ headers }) => {
			const token = getHeaderValue(headers, "x-gitlab-token");

			if (!token || webhookSecrets.length === 0) {
				return false;
			}

			return webhookSecrets.includes(token);
		},
		parse: ({ headers, rawBody }) => {
			const payload = JSON.parse(rawBody) as GitLabWebhookPayload;
			const rawEvent = (
				getHeaderValue(headers, "x-gitlab-event") ??
				payload.object_kind ??
				payload.event_type ??
				"unknown"
			).toLowerCase();
			const event = rawEvent.includes("merge request")
				? "pull_request"
				: rawEvent.includes("push")
					? "push"
					: rawEvent.includes("note")
						? "note"
						: rawEvent.includes("issue")
							? "issue"
							: rawEvent.includes("pipeline")
								? "pipeline"
								: rawEvent.includes("job")
									? "job"
									: rawEvent.includes("wiki")
										? "wiki_page"
										: rawEvent.includes("release")
											? "release"
											: rawEvent.includes("tag")
												? "tag_push"
												: rawEvent;

			return {
				providerId,
				event,
				action:
					typeof payload.object_attributes?.action === "string"
						? payload.object_attributes.action
						: null,
				deliveryId: getHeaderValue(headers, "x-gitlab-event-uuid"),
				repository:
					payload.project && typeof payload.project === "object"
						? mapRepository(
								{
									id: Number(payload.project.id ?? 0),
									path_with_namespace: String(
										payload.project.path_with_namespace ?? "",
									),
									web_url: String(payload.project.web_url ?? ""),
									default_branch:
										typeof payload.project.default_branch === "string"
											? payload.project.default_branch
											: undefined,
									name: String(payload.project.name ?? ""),
									description:
										typeof payload.project.description === "string"
											? payload.project.description
											: null,
									visibility:
										typeof payload.project.visibility === "string"
											? payload.project.visibility
											: undefined,
									namespace:
										typeof payload.project.namespace === "object" &&
										payload.project.namespace !== null
											? (payload.project
													.namespace as GitLabProject["namespace"])
											: null,
									owner:
										typeof payload.user === "object" && payload.user !== null
											? (payload.user as GitLabProject["owner"])
											: null,
								},
								providerId,
							)
						: null,
				sender:
					payload.user && typeof payload.user === "object"
						? mapActor(payload.user as GitLabProject["owner"])
						: mapActor(
								payload.user_username
									? { username: payload.user_username }
									: undefined,
							),
				payload: payload as GitLabWebhookPayload,
				headers: normalizeHeaderRecord(headers),
				rawBody,
			};
		},
	};
}

function mapWebhook(
	hook: GitLabHook,
	providerId: string,
	repositoryPath: string,
): GitWebhookSubscription {
	const events = [
		hook.push_events ? "push" : null,
		hook.merge_requests_events ? "pull_request" : null,
		hook.note_events ? "note" : null,
		hook.issues_events ? "issue" : null,
		hook.pipeline_events ? "pipeline" : null,
		hook.job_events ? "job" : null,
		hook.wiki_page_events ? "wiki_page" : null,
		hook.deployments_events ? "deployment" : null,
		hook.releases_events ? "release" : null,
		hook.feature_flag_events ? "feature_flag" : null,
		hook.tag_push_events ? "tag_push" : null,
		hook.confidential_note_events ? "confidential_note" : null,
		hook.confidential_issues_events ? "confidential_issue" : null,
	].filter((event): event is string => Boolean(event));

	return {
		providerId,
		repositoryPath,
		id: String(hook.id),
		url: hook.url,
		active: hook.active,
		events,
		secretConfigured: false,
		createdAt: hook.created_at ?? null,
		updatedAt: hook.updated_at ?? null,
	};
}

export function createGitLabAdapter({
	providerId = "gitlab",
	label = getGitProviderLabel("gitlab"),
	baseUrl = "https://gitlab.com",
	apiBaseUrl = `${normalizeGitHostUrl(baseUrl)}/api/v4`,
	token,
	tokenType = "bearer",
	webhookSecrets = [],
}: GitLabAdapterOptions = {}): GitProviderAdapter {
	const normalizedBaseUrl = normalizeGitHostUrl(baseUrl);
	const normalizedApiBaseUrl = normalizeBaseUrl(apiBaseUrl);

	async function listRepositories(): Promise<GitRepository[]> {
		const response = await requestJson<unknown>(
			`${normalizedApiBaseUrl}/projects?membership=true&simple=true&order_by=last_activity_at&sort=desc&per_page=100`,
			{
				headers: {
					...createGitLabRequestHeaders(token, tokenType),
				},
			},
			providerId,
		);

		const projects = z.array(gitlabProjectSchema).parse(response);
		return projects.map((project) => mapRepository(project, providerId));
	}

	async function getRepository(
		input: GitRepositoryRef,
	): Promise<GitRepository> {
		const response = await requestJson<unknown>(
			createRepositoryUrl(normalizedApiBaseUrl, input.repositoryPath),
			{
				headers: {
					...createGitLabRequestHeaders(token, tokenType),
				},
			},
			providerId,
		);

		const project = gitlabProjectSchema.parse(response);
		return mapRepository(project, providerId);
	}

	async function listPullRequests(
		input: GitRepositoryRef & { state?: GitPullRequestState },
	) {
		const state =
			input.state === "all"
				? "all"
				: input.state === "merged"
					? "merged"
					: input.state === "closed"
						? "closed"
						: "opened";

		const response = await requestJson<unknown>(
			`${createRepositoryUrl(
				normalizedApiBaseUrl,
				input.repositoryPath,
			)}/merge_requests?state=${encodeURIComponent(state)}`,
			{
				headers: {
					...createGitLabRequestHeaders(token, tokenType),
				},
			},
			providerId,
		);

		const items = z.array(gitlabMergeRequestSchema).parse(response);
		return items.map((mergeRequest) =>
			mapPullRequest(mergeRequest, providerId, input.repositoryPath),
		);
	}

	async function getPullRequest(
		input: GitRepositoryRef & { pullRequestNumber: number },
	) {
		const response = await requestJson<unknown>(
			`${createRepositoryUrl(
				normalizedApiBaseUrl,
				input.repositoryPath,
			)}/merge_requests/${input.pullRequestNumber}`,
			{
				headers: {
					...createGitLabRequestHeaders(token, tokenType),
				},
			},
			providerId,
		);

		const mergeRequest = gitlabMergeRequestSchema.parse(response);
		return mapPullRequest(mergeRequest, providerId, input.repositoryPath);
	}

	async function listPullRequestFiles(
		input: GitRepositoryRef & { pullRequestNumber: number },
	) {
		const response = await requestJson<unknown>(
			`${createRepositoryUrl(
				normalizedApiBaseUrl,
				input.repositoryPath,
			)}/merge_requests/${input.pullRequestNumber}/changes`,
			{
				headers: {
					...createGitLabRequestHeaders(token, tokenType),
				},
			},
			providerId,
		);

		const changes = ((response as GitLabMergeRequestChangesResponse).changes ??
			[]) as NonNullable<GitLabMergeRequestChangesResponse["changes"]>;

		return changes.map((change) =>
			mapPullRequestFile(
				change,
				providerId,
				input.repositoryPath,
				input.pullRequestNumber,
			),
		);
	}

	async function listPullRequestComments(
		input: GitRepositoryRef & { pullRequestNumber: number },
	) {
		const response = await requestJson<unknown>(
			`${createRepositoryUrl(
				normalizedApiBaseUrl,
				input.repositoryPath,
			)}/merge_requests/${input.pullRequestNumber}/notes`,
			{
				headers: {
					...createGitLabRequestHeaders(token, tokenType),
				},
			},
			providerId,
		);

		const notes = z.array(gitlabNoteSchema).parse(response);
		return notes.map((note) =>
			mapComment(
				note,
				providerId,
				input.repositoryPath,
				input.pullRequestNumber,
			),
		);
	}

	async function getFileContent(
		input: GitRepositoryRef & { filePath: string; ref?: string },
	) {
		const response = await requestJson<unknown>(
			`${createRepositoryUrl(
				normalizedApiBaseUrl,
				input.repositoryPath,
			)}/repository/files/${encodeURIComponent(input.filePath)}?ref=${encodeURIComponent(
				input.ref ?? "HEAD",
			)}`,
			{
				headers: {
					...createGitLabRequestHeaders(token, tokenType),
				},
			},
			providerId,
		);
		const file = response as Record<string, unknown>;
		const rawContent = typeof file.content === "string" ? file.content : "";
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
			ref: input.ref ?? "HEAD",
			content:
				encoding === "base64"
					? Buffer.from(rawContent, "base64").toString("utf8")
					: rawContent,
			size: typeof file.size === "number" ? file.size : null,
			sha: typeof file.blob_id === "string" ? file.blob_id : null,
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
		const requestedKinds = input.kind ?? ["issue", "pull_request"];
		const limit = Math.min(Math.max(input.limit ?? 10, 1), 20);
		const query = input.query?.trim();
		const searchParams = query
			? `&search=${encodeURIComponent(query)}`
			: "";
		const requests: Array<Promise<GitRepositorySearchResult[]>> = [];

		if (requestedKinds.includes("issue")) {
			requests.push(
				requestJson<unknown>(
					`${createRepositoryUrl(
						normalizedApiBaseUrl,
						input.repositoryPath,
					)}/issues?state=all&per_page=${limit}${searchParams}`,
					{
						headers: {
							...createGitLabRequestHeaders(token, tokenType),
						},
					},
					providerId,
				).then((response) =>
					z
						.array(gitlabIssueSchema)
						.parse(response)
						.map((issue) =>
							mapSearchResult(
								issue,
								providerId,
								input.repositoryPath,
								"issue",
							),
						),
				),
			);
		}

		if (requestedKinds.includes("pull_request")) {
			requests.push(
				requestJson<unknown>(
					`${createRepositoryUrl(
						normalizedApiBaseUrl,
						input.repositoryPath,
					)}/merge_requests?state=all&per_page=${limit}${searchParams}`,
					{
						headers: {
							...createGitLabRequestHeaders(token, tokenType),
						},
					},
					providerId,
				).then((response) =>
					z
						.array(gitlabMergeRequestSchema)
						.parse(response)
						.map((mergeRequest) =>
							mapSearchResult(
								mergeRequest,
								providerId,
								input.repositoryPath,
								"pull_request",
							),
						),
				),
			);
		}

		const results = (await Promise.all(requests))
			.flat()
			.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

		return results.slice(0, limit);
	}

	async function listRepositoryLabels(
		input: GitRepositoryRef & { query?: string; limit?: number },
	) {
		const limit = Math.min(Math.max(input.limit ?? 100, 1), 100);
		const query = input.query?.trim();
		const searchParams = query ? `&search=${encodeURIComponent(query)}` : "";
		const response = await requestJson<unknown>(
			`${createRepositoryUrl(
				normalizedApiBaseUrl,
				input.repositoryPath,
			)}/labels?with_counts=false&per_page=100${searchParams}`,
			{
				headers: {
					...createGitLabRequestHeaders(token, tokenType),
				},
			},
			providerId,
		);

		return z
			.array(gitlabLabelSchema)
			.parse(response)
			.map((label) =>
				mapRepositoryLabel(label, providerId, input.repositoryPath),
			)
			.slice(0, limit);
	}

	async function createPullRequest(input: GitPullRequestCreateInput) {
		const response = await requestJson<unknown>(
			`${createRepositoryUrl(
				normalizedApiBaseUrl,
				input.repositoryPath,
			)}/merge_requests`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...createGitLabRequestHeaders(token, tokenType),
				},
				body: JSON.stringify({
					source_branch: input.headBranch,
					target_branch: input.baseBranch,
					title: input.title,
					description: input.body,
					draft: input.draft ?? undefined,
				}),
			},
			providerId,
		);

		const mergeRequest = gitlabMergeRequestSchema.parse(response);
		return mapPullRequest(mergeRequest, providerId, input.repositoryPath);
	}

	async function createComment(input: GitCommentInput) {
		const notesUrl = `${createRepositoryUrl(
			normalizedApiBaseUrl,
			input.repositoryPath,
		)}/merge_requests/${input.pullRequestNumber}/notes`;

		const response = await requestJson<unknown>(
			notesUrl,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...createGitLabRequestHeaders(token, tokenType),
				},
				body: JSON.stringify({
					body: input.body,
				}),
			},
			providerId,
		);

		const note = gitlabNoteSchema.parse(response);
		return mapComment(
			note,
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

		await requestJson<unknown>(
			`${createIssueUrl(
				normalizedApiBaseUrl,
				input.repositoryPath,
				input.issueNumber,
			)}`,
			{
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					...createGitLabRequestHeaders(token, tokenType),
				},
				body: JSON.stringify({
					add_labels: input.labels.join(","),
				}),
			},
			providerId,
		);
	}

	async function addPullRequestLabels(
		input: GitRepositoryRef & { pullRequestNumber: number; labels: string[] },
	) {
		if (input.labels.length === 0) {
			return;
		}

		await requestJson<unknown>(
			`${createMergeRequestUrl(
				normalizedApiBaseUrl,
				input.repositoryPath,
				input.pullRequestNumber,
			)}`,
			{
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					...createGitLabRequestHeaders(token, tokenType),
				},
				body: JSON.stringify({
					add_labels: input.labels.join(","),
				}),
			},
			providerId,
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
		await requestJson<unknown>(
			`${createRepositoryUrl(
				normalizedApiBaseUrl,
				input.repositoryPath,
			)}/merge_requests/${input.pullRequestNumber}/merge`,
			{
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					...createGitLabRequestHeaders(token, tokenType),
				},
				body: JSON.stringify({
					merge_commit_message: input.message,
					should_remove_source_branch: true,
				}),
			},
			providerId,
		);

		return getPullRequest(input);
	}

	async function listWebhooks(input: GitRepositoryRef) {
		const response = await requestJson<unknown>(
			`${createRepositoryUrl(normalizedApiBaseUrl, input.repositoryPath)}/hooks`,
			{
				headers: {
					...createGitLabRequestHeaders(token, tokenType),
				},
			},
			providerId,
		);

		const hooks = z.array(gitlabHookSchema).parse(response);
		return hooks.map((hook) =>
			mapWebhook(hook, providerId, input.repositoryPath),
		);
	}

	async function createWebhook(input: GitWebhookCreateInput) {
		const response = await requestJson<unknown>(
			`${createRepositoryUrl(normalizedApiBaseUrl, input.repositoryPath)}/hooks`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...createGitLabRequestHeaders(token, tokenType),
				},
				body: JSON.stringify({
					url: input.url,
					token: input.secret,
					enable_ssl_verification: true,
					push_events: input.events ? input.events.includes("push") : true,
					merge_requests_events: input.events
						? input.events.includes("pull_request") ||
							input.events.includes("merge_request")
						: true,
					note_events: input.events ? input.events.includes("note") : false,
					issues_events: input.events ? input.events.includes("issue") : false,
					active: input.active ?? true,
				}),
			},
			providerId,
		);

		const hook = gitlabHookSchema.parse(response);
		return {
			...mapWebhook(hook, providerId, input.repositoryPath),
			secretConfigured: Boolean(input.secret),
		};
	}

	async function deleteWebhook(input: GitWebhookDeleteInput) {
		await requestJson<unknown>(
			`${createRepositoryUrl(
				normalizedApiBaseUrl,
				input.repositoryPath,
			)}/hooks/${input.webhookId}`,
			{
				method: "DELETE",
				headers: {
					...createGitLabRequestHeaders(token, tokenType),
				},
			},
			providerId,
		);
	}

	return {
		providerId,
		label,
		baseUrl: normalizedBaseUrl,
		apiBaseUrl: normalizedApiBaseUrl,
		capabilities,
		webhooks: createGitLabWebhookVerifier(providerId, webhookSecrets),
		listRepositories,
		getRepository,
		listPullRequests,
		getPullRequest,
		listPullRequestFiles,
		listPullRequestComments,
		getFileContent,
		searchRepository,
		listRepositoryLabels,
		createPullRequest,
		createComment,
		addIssueLabels,
		addPullRequestLabels,
		mergePullRequest,
		listWebhooks,
		createWebhook,
		deleteWebhook,
	};
}
