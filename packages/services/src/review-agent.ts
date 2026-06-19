import type {
	GitComment,
	GitProviderAdapter,
	GitPullRequest,
	GitPullRequestFile,
	GitRepository,
	GitRepositorySearchKind,
	GitRepositorySearchResult,
} from "@gitpal/git";
import { createLogger } from "@gitpal/logger";
import {
	buildRepositoryReviewCommentMarkdown,
	inferProviderIdFromModel,
	type WorkspaceManagedTool,
	type WorkspaceSettings,
} from "@gitpal/utils";
import { generateText, Output, stepCountIs, ToolLoopAgent, tool } from "ai";
import { z } from "zod";
import { runTrackedAiGeneration } from "./ai-billing";
import { resolveLanguageModelForUser } from "./llm-credentials";
import { recordObservabilityEvent } from "./observability";

const log = createLogger("ReviewAgent");

const reviewFindingSchema = z.object({
	title: z
		.string()
		.min(1)
		.describe(
			"Short, specific title. Plain text, no markdown or trailing punctuation.",
		),
	severity: z
		.enum(["low", "medium", "high", "critical"])
		.describe("Impact level of the finding."),
	category: z.enum([
		"correctness",
		"security",
		"performance",
		"maintainability",
		"testing",
		"documentation",
		"architecture",
	]),
	body: z
		.string()
		.min(1)
		.describe(
			"Markdown explanation of the issue and concrete fix. Use inline code for symbols. Do NOT wrap in a code fence.",
		),
	filePath: z
		.string()
		.nullable()
		.describe("Repository-relative path the finding applies to, or null."),
	line: z
		.number()
		.int()
		.positive()
		.nullable()
		.describe("1-based line number within filePath, or null."),
});

const relatedWorkSchema = z.object({
	kind: z.enum(["issue", "pull_request"]),
	number: z.number().int().positive(),
	title: z.string().min(1),
	reason: z
		.string()
		.min(1)
		.describe("One concise sentence explaining why this item is related."),
	htmlUrl: z.string().url(),
});

const preMergeCheckSchema = z.object({
	name: z.string().min(1),
	status: z.enum(["passed", "warning", "failed"]),
	details: z
		.string()
		.min(1)
		.describe("One concise sentence describing the check result."),
});

const reviewEffortSchema = z.object({
	score: z
		.number()
		.int()
		.min(1)
		.max(5)
		.describe("Review effort from 1 (trivial) to 5 (very involved)."),
	label: z
		.string()
		.min(1)
		.describe("Short human label for the score, e.g. 'Moderate'."),
	minutes: z
		.number()
		.int()
		.positive()
		.describe("Rough estimate of focused review time, in minutes."),
});

export const repositoryReviewOutputSchema = z.object({
	summary: z
		.string()
		.min(1)
		.describe(
			"Concise high-level summary as Markdown prose. No heading, no code fence.",
		),
	walkthrough: z
		.string()
		.min(1)
		.describe(
			"Markdown prose walkthrough grounded in repository context. No heading, no code fence.",
		),
	sequenceDiagram: z
		.string()
		.nullable()
		.default(null)
		.describe(
			"Optional Mermaid 'sequenceDiagram' body (no code fence) describing the change flow, or null.",
		),
	reviewEffort: reviewEffortSchema
		.nullable()
		.default(null)
		.describe("Estimated review effort, or null when not requested."),
	suggestedReviewers: z
		.array(z.string())
		.default([])
		.describe("Suggested reviewer logins, each without a leading '@'."),
	suggestedLabels: z
		.array(z.string())
		.default([])
		.describe("Suggested PR labels justified by repository context."),
	relatedWork: z.array(relatedWorkSchema).default([]),
	findings: z.array(reviewFindingSchema).default([]),
	preMergeChecks: z.array(preMergeCheckSchema).default([]),
});

export type RepositoryReviewOutput = z.infer<
	typeof repositoryReviewOutputSchema
>;

// ─── Output normalization ─────────────────────────────────────────────────────────
//
// The model can return slightly messy structured output (stray code fences,
// duplicate labels, blank entries, '@' prefixes, out-of-range numbers). We
// normalize everything into one clean shape so the published comment and the
// in-app preview render identically.

function cleanMarkdown(value: string): string {
	return value
		.replace(/\r\n/g, "\n")
		.replace(/[ \t]+$/gm, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function stripCodeFence(value: string): string {
	const trimmed = value.trim();
	const fenced = trimmed.match(/^```(?:[\w-]+)?\n([\s\S]*?)\n?```$/);
	return fenced ? (fenced[1]?.trim() ?? "") : trimmed;
}

function dedupeStrings(values: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const raw of values) {
		const value = raw.trim();
		if (!value) {
			continue;
		}
		const key = value.toLowerCase();
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		result.push(value);
	}
	return result;
}

function sanitizeReviewOutput(
	output: RepositoryReviewOutput,
): RepositoryReviewOutput {
	return {
		summary: cleanMarkdown(stripCodeFence(output.summary)),
		walkthrough: cleanMarkdown(stripCodeFence(output.walkthrough)),
		sequenceDiagram: output.sequenceDiagram?.trim()
			? stripCodeFence(output.sequenceDiagram)
			: null,
		reviewEffort: output.reviewEffort
			? {
					score: Math.min(
						5,
						Math.max(1, Math.round(output.reviewEffort.score)),
					),
					label: output.reviewEffort.label.trim(),
					minutes: Math.max(1, Math.round(output.reviewEffort.minutes)),
				}
			: null,
		suggestedReviewers: dedupeStrings(
			output.suggestedReviewers.map((reviewer) => reviewer.replace(/^@+/, "")),
		),
		suggestedLabels: dedupeStrings(output.suggestedLabels),
		relatedWork: output.relatedWork
			.filter((item) => item.title.trim() && item.htmlUrl.trim())
			.map((item) => ({
				...item,
				title: item.title.trim(),
				reason: cleanMarkdown(item.reason),
				htmlUrl: item.htmlUrl.trim(),
			})),
		findings: output.findings
			.filter((finding) => finding.title.trim() && finding.body.trim())
			.map((finding) => ({
				...finding,
				title: finding.title.trim(),
				body: cleanMarkdown(stripCodeFence(finding.body)),
				filePath: finding.filePath?.trim() ? finding.filePath.trim() : null,
				line:
					finding.line && finding.line > 0 ? Math.round(finding.line) : null,
			})),
		preMergeChecks: output.preMergeChecks
			.filter((check) => check.name.trim())
			.map((check) => ({
				...check,
				name: check.name.trim(),
				details: cleanMarkdown(check.details),
			})),
	};
}

// Drop sections the workspace settings disable so the structured output never
// carries content the preview/published comment would hide.
function applySettingsGating(
	output: RepositoryReviewOutput,
	settings: WorkspaceSettings,
): RepositoryReviewOutput {
	return {
		...output,
		reviewEffort: settings.reviews.walkthrough.estimateCodeReviewEffort
			? output.reviewEffort
			: null,
		sequenceDiagram: settings.reviews.walkthrough.sequenceDiagrams
			? output.sequenceDiagram
			: null,
	};
}

type ReviewRunKind = "review" | "mention" | "pre-merge";

type ReviewContext = {
	userId: string;
	adapter: GitProviderAdapter;
	repository: GitRepository;
	pullRequest: GitPullRequest;
	files: GitPullRequestFile[];
	comments: GitComment[];
	settings: WorkspaceSettings;
	kind: ReviewRunKind;
	suggestedReviewers?: string[];
	repositoryDbId?: string | null;
	pullRequestDbId?: string | null;
	reviewRunId?: string | null;
};

type WebSearchResult = {
	title: string;
	url: string | null;
	snippet: string;
};

function trimPatch(patch: string | null, maxLines = 25) {
	if (!patch) {
		return "No inline patch available.";
	}

	const lines = patch.split("\n");
	return lines.slice(0, maxLines).join("\n");
}

function getEnabledTool(
	tools: WorkspaceManagedTool[],
	type: WorkspaceManagedTool["type"],
) {
	return tools.find(
		(toolSetting) => toolSetting.type === type && toolSetting.enabled,
	);
}

function getToolSource(tool: WorkspaceManagedTool | undefined) {
	return tool ? "builtin" : "disabled";
}

function summarizeChangedFile(file: GitPullRequestFile) {
	switch (file.status) {
		case "added":
			return "New file added.";
		case "removed":
			return "File removed.";
		case "renamed":
			return file.previousPath
				? `Renamed from ${file.previousPath}.`
				: "File renamed.";
		case "copied":
			return file.previousPath
				? `Copied from ${file.previousPath}.`
				: "File copied from another location.";
		default:
			return "Summary of changes to this file.";
	}
}

function buildChangedFileSummaries(files: GitPullRequestFile[]) {
	return files.map((file) => ({
		path: file.path,
		status: file.status,
		additions: file.additions,
		deletions: file.deletions,
		summary: summarizeChangedFile(file),
	}));
}

function mapThinkingProviderOptions(
	settings: WorkspaceSettings,
): Record<string, Record<string, unknown>> | undefined {
	if (!settings.ai.thinking.enabled) {
		return undefined;
	}

	const providerId = inferProviderIdFromModel(settings.ai.reviewer.modelId);
	const normalizedModelId = settings.ai.reviewer.modelId.toLowerCase();

	if (
		providerId === "openai" &&
		/(?:^|\/)(o1|o3|o4|gpt-5)/.test(normalizedModelId)
	) {
		return {
			openai: {
				reasoningEffort: settings.ai.thinking.effort,
				...(settings.ai.thinking.summaryVisibility !== "hidden"
					? {
							reasoningSummary:
								settings.ai.thinking.summaryVisibility === "detailed"
									? "detailed"
									: "auto",
						}
					: {}),
			},
		} satisfies Record<string, Record<string, unknown>>;
	}

	if (
		providerId === "anthropic" &&
		/claude-(?:opus|sonnet)-4/.test(normalizedModelId)
	) {
		return {
			anthropic: {
				effort: settings.ai.thinking.effort,
				thinking: {
					type: "enabled" as const,
					budgetTokens: settings.ai.thinking.budgetTokens,
				},
			},
		} satisfies Record<string, Record<string, unknown>>;
	}

	return undefined;
}

function flattenDuckDuckGoTopics(
	topics: Array<Record<string, unknown>>,
): WebSearchResult[] {
	return topics.flatMap((topic) => {
		if (Array.isArray(topic.Topics)) {
			return flattenDuckDuckGoTopics(
				topic.Topics as Array<Record<string, unknown>>,
			);
		}

		const snippet = typeof topic.Text === "string" ? topic.Text.trim() : "";

		if (!snippet) {
			return [];
		}

		return [
			{
				title: snippet.split(" - ", 1)[0] ?? snippet,
				url: typeof topic.FirstURL === "string" ? topic.FirstURL : null,
				snippet,
			},
		];
	});
}

async function runWebSearch(
	query: string,
	limit: number,
): Promise<WebSearchResult[]> {
	const response = await fetch(
		`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
	);

	if (!response.ok) {
		return [];
	}

	const payload = (await response.json()) as Record<string, unknown>;
	const results: WebSearchResult[] = [];

	if (typeof payload.AbstractText === "string" && payload.AbstractText.trim()) {
		results.push({
			title:
				(typeof payload.Heading === "string" && payload.Heading.trim()) ||
				query,
			url: typeof payload.AbstractURL === "string" ? payload.AbstractURL : null,
			snippet: payload.AbstractText.trim(),
		});
	}

	if (Array.isArray(payload.RelatedTopics)) {
		results.push(
			...flattenDuckDuckGoTopics(
				payload.RelatedTopics as Array<Record<string, unknown>>,
			),
		);
	}

	return results.slice(0, limit);
}

function formatSearchResults(results: GitRepositorySearchResult[]) {
	if (results.length === 0) {
		return "No related items found.";
	}

	return results
		.map(
			(result) =>
				`${result.kind.toUpperCase()} #${result.number}: ${result.title} (${result.state})\n${result.body ?? ""}\n${result.htmlUrl}`,
		)
		.join("\n\n");
}

async function loadSeededRepositoryContext(context: ReviewContext) {
	const reviewContext = context.settings.reviews.behavior.context;

	if (!reviewContext.contextAware) {
		return "Repository context scan is disabled.";
	}

	const query = context.pullRequest.title.trim();
	const tasks: Array<
		Promise<{ label: string; items: GitRepositorySearchResult[] }>
	> = [];

	if (reviewContext.includeRelatedIssues) {
		tasks.push(
			context.adapter
				.searchRepository({
					repositoryPath: context.repository.repositoryPath,
					query,
					kind: ["issue"],
					limit: reviewContext.maxRelatedItems,
				})
				.then((items) => ({
					label: "Related issues",
					items,
				})),
		);
	}

	if (reviewContext.includeRelatedPRs) {
		tasks.push(
			context.adapter
				.searchRepository({
					repositoryPath: context.repository.repositoryPath,
					query,
					kind: ["pull_request"],
					limit: reviewContext.maxRelatedItems,
				})
				.then((items) => ({
					label: "Related pull requests",
					items,
				})),
		);
	}

	if (tasks.length === 0) {
		return "No related issue or pull request scanning is enabled.";
	}

	try {
		const sections = await Promise.all(tasks);
		return sections
			.map(({ label, items }) => `${label}:\n${formatSearchResults(items)}`)
			.join("\n\n");
	} catch {
		return "Repository context prefetch failed. Use live tools if more context is needed.";
	}
}

function buildAgentInstructions(
	settings: WorkspaceSettings,
	kind: ReviewRunKind,
) {
	const sections = [
		"You are GitPal's repository-aware AI reviewer.",
		"Always review in repository context. Do not behave like a diff-only reviewer.",
		`Adopt a ${settings.reviews.behavior.profile} communication style.`,
		`Primary review focus: ${settings.ai.reviewer.focus}.`,
		settings.reviews.summary.highLevelSummaryInstructions,
		settings.ai.reviewer.extraInstructions,
		settings.fun.toneInstructions,
		settings.reviews.behavior.requestChangesWorkflow
			? "If blocking issues remain, make that explicit in the output."
			: "Call out blocking issues clearly but keep the tone collaborative.",
		kind === "pre-merge"
			? "This run is a pre-merge gate. Evaluate merge readiness, not just code quality."
			: "This run is a review or mention response. Focus on actionable feedback.",
		settings.reviews.behavior.context.contextAware
			? "Use the repository search tools proactively before deciding that no related issues or PRs matter."
			: "Do not assume related issues or PRs exist if context scanning is disabled.",
		"Only recommend labels that are justified by the actual repository context.",
		"Reference related issues or PRs only when you have a concrete reason.",
	];

	return sections.filter(Boolean).join("\n\n");
}

function buildPrompt({
	repository,
	pullRequest,
	files,
	comments,
	settings,
	kind,
	seededContext,
}: Omit<ReviewContext, "adapter" | "userId"> & {
	seededContext: string;
}) {
	const visibleFiles = files.filter((file) => {
		if (settings.reviews.behavior.pathFilters.length === 0) {
			return true;
		}

		return !settings.reviews.behavior.pathFilters.some((pattern) =>
			file.path.includes(pattern.replace(/\*\*/g, "")),
		);
	});

	const pathGuidance =
		settings.reviews.behavior.pathInstructions.length > 0
			? settings.reviews.behavior.pathInstructions
					.map(
						(instruction) => `${instruction.path}: ${instruction.instructions}`,
					)
					.join("\n")
			: "No path-specific guidance.";
	const labelGuidance =
		settings.reviews.behavior.labelingInstructions.length > 0
			? settings.reviews.behavior.labelingInstructions
					.map(
						(instruction) =>
							`${instruction.label}: ${instruction.instructions}`,
					)
					.join("\n")
			: "No label guidance.";
	const priorDiscussion =
		comments.length > 0
			? comments
					.slice(-12)
					.map(
						(comment) =>
							`${comment.author?.login ?? "unknown"}${
								comment.path && comment.line
									? ` on ${comment.path}:${comment.line}`
									: ""
							}: ${comment.body}`,
					)
					.join("\n")
			: "No prior discussion.";
	const fileSummary = visibleFiles
		.map(
			(file) =>
				`${file.path} [${file.status}] +${file.additions}/-${file.deletions}\n${trimPatch(
					file.patch,
				)}`,
		)
		.join("\n\n");

	return `
Repository: ${repository.fullName}
Description: ${repository.description ?? "No repository description."}
Pull request: #${pullRequest.number} ${pullRequest.title}
Review kind: ${kind}
Branches: ${pullRequest.sourceBranch} -> ${pullRequest.targetBranch}
Author: ${pullRequest.author?.login ?? "unknown"}
Body:
${pullRequest.body ?? "No pull request body."}

Path guidance:
${pathGuidance}

Label guidance:
${labelGuidance}

Changed files:
${fileSummary || "No changed files provided."}

Prior discussion:
${priorDiscussion}

Seeded repository context:
${seededContext}

Required output expectations:
- Produce a concise summary as Markdown prose (no heading, no code fences).
- Produce a walkthrough that reflects repository context, not just the diff.
- Produce findings only for real issues; do not invent them. Use severity low|medium|high|critical.
- Include pre-merge checks when relevant (status passed|warning|failed).
- Include related issues and pull requests only when you have evidence.
- Suggest reviewers as bare logins, without a leading "@".
${
	settings.reviews.walkthrough.estimateCodeReviewEffort
		? "- Provide reviewEffort with a 1-5 score, a short label, and an estimate in minutes."
		: "- Leave reviewEffort null; review-effort estimates are disabled for this workspace."
}
${
	settings.reviews.walkthrough.sequenceDiagrams
		? "- Provide sequenceDiagram as a Mermaid 'sequenceDiagram' body (no code fence) capturing the key runtime flow of this change."
		: "- Leave sequenceDiagram null; sequence diagrams are disabled for this workspace."
}
- Keep every string clean: no wrapping code fences, no leading/trailing whitespace, no duplicate labels.
- Return only the structured review content; the app assembles the publish-ready Markdown comment.
`.trim();
}

function buildReviewCommentMarkdown(
	context: Omit<ReviewContext, "adapter" | "userId">,
	output: RepositoryReviewOutput,
	files: GitPullRequestFile[],
	poem?: string | null,
) {
	return buildRepositoryReviewCommentMarkdown({
		settings: context.settings,
		repository: {
			fullName: context.repository.fullName,
			description: context.repository.description,
		},
		pullRequest: {
			number: context.pullRequest.number,
			title: context.pullRequest.title,
			authorLogin: context.pullRequest.author?.login ?? null,
			sourceBranch: context.pullRequest.sourceBranch,
			targetBranch: context.pullRequest.targetBranch,
		},
		kind: context.kind,
		summary: output.summary,
		walkthrough: output.walkthrough,
		sequenceDiagram: output.sequenceDiagram,
		reviewEffort: output.reviewEffort,
		findings: output.findings,
		relatedWork: output.relatedWork,
		preMergeChecks: output.preMergeChecks,
		suggestedLabels: output.suggestedLabels,
		suggestedReviewers: dedupeStrings([
			...(context.suggestedReviewers ?? []),
			...output.suggestedReviewers,
		]),
		changedFiles: buildChangedFileSummaries(files),
		poem: poem ?? null,
	});
}

function buildPromptFilesSummary(files: GitPullRequestFile[]) {
	return files
		.map(
			(file) =>
				`${file.path} [${file.status}] +${file.additions}/-${file.deletions}\n${trimPatch(
					file.patch,
					12,
				)}`,
		)
		.join("\n\n");
}

async function generateWalkthroughText({
	context,
	output,
	files,
}: {
	context: ReviewContext;
	output: RepositoryReviewOutput;
	files: GitPullRequestFile[];
}) {
	try {
		const walkthroughModelId =
			context.settings.reviews.walkthrough.modelId.trim();

		if (
			!walkthroughModelId ||
			walkthroughModelId === context.settings.ai.reviewer.modelId
		) {
			return output.walkthrough;
		}

		const walkthroughResolution = await resolveLanguageModelForUser({
			userId: context.userId,
			modelId: walkthroughModelId,
		});
		const walkthroughRun = await runTrackedAiGeneration({
			userId: context.userId,
			callKind: "walkthrough",
			modelId: walkthroughModelId,
			routePreview: walkthroughResolution.preview,
			repositoryId: context.repositoryDbId ?? null,
			pullRequestId: context.pullRequestDbId ?? null,
			reviewRunId: context.reviewRunId ?? null,
			tags: [
				"review-walkthrough",
				context.repository.fullName,
				context.pullRequest.number.toString(),
			],
			metadata: {
				repository: context.repository.fullName,
				pullRequestNumber: context.pullRequest.number,
				kind: context.kind,
			},
			execute: async ({ providerOptions }) =>
				generateText({
					model: walkthroughResolution.model,
					maxOutputTokens: Math.min(
						context.settings.ai.reviewer.maxOutputTokens,
						2048,
					),
					...(providerOptions
						? { providerOptions: providerOptions as never }
						: {}),
					prompt: `
You are rewriting the walkthrough section of a code review comment.

Repository: ${context.repository.fullName}
Pull request: #${context.pullRequest.number} ${context.pullRequest.title}
Current walkthrough draft:
${output.walkthrough}

Summary:
${output.summary}

Findings:
${
	output.findings.length > 0
		? output.findings
				.map(
					(finding) =>
						`- ${finding.severity.toUpperCase()} ${finding.title}: ${finding.body}`,
				)
				.join("\n")
		: "No findings."
}

Related work:
${
	output.relatedWork.length > 0
		? output.relatedWork
				.map(
					(item) =>
						`- ${item.kind.toUpperCase()} #${item.number}: ${item.title} (${item.reason})`,
				)
				.join("\n")
		: "No related work."
}

Changed files:
${buildPromptFilesSummary(files)}

Rewrite the walkthrough as concise Markdown prose. Keep it grounded in the diff and repository context. Do not invent facts.
`.trim(),
				}),
		});

		return walkthroughRun.result.text.trim() || output.walkthrough;
	} catch {
		return output.walkthrough;
	}
}

async function generateFunPoem({
	context,
	output,
	walkthrough,
}: {
	context: ReviewContext;
	output: RepositoryReviewOutput;
	walkthrough: string;
}) {
	if (!context.settings.fun.poem) {
		return null;
	}

	try {
		const poemResolution = await resolveLanguageModelForUser({
			userId: context.userId,
			modelId: context.settings.fun.modelId.trim(),
		});
		const poemRun = await runTrackedAiGeneration({
			userId: context.userId,
			callKind: "fun",
			modelId: context.settings.fun.modelId.trim(),
			routePreview: poemResolution.preview,
			repositoryId: context.repositoryDbId ?? null,
			pullRequestId: context.pullRequestDbId ?? null,
			reviewRunId: context.reviewRunId ?? null,
			tags: [
				"review-poem",
				context.repository.fullName,
				context.pullRequest.number.toString(),
			],
			metadata: {
				repository: context.repository.fullName,
				pullRequestNumber: context.pullRequest.number,
				kind: context.kind,
			},
			execute: async ({ providerOptions }) =>
				generateText({
					model: poemResolution.model,
					maxOutputTokens: 256,
					...(providerOptions
						? { providerOptions: providerOptions as never }
						: {}),
					prompt: `
Write a short playful poem for a pull request review comment.

Repository: ${context.repository.fullName}
Pull request: #${context.pullRequest.number} ${context.pullRequest.title}
Summary:
${output.summary}

Walkthrough:
${walkthrough}

Tone guidance:
${context.settings.fun.toneInstructions}

Keep it concise, warm, and suitable for a professional review comment. Output only the poem.
`.trim(),
				}),
		});

		return poemRun.result.text.trim() || null;
	} catch {
		return null;
	}
}

async function observeReviewToolCall<TResult>({
	context,
	toolName,
	input,
	run,
}: {
	context: ReviewContext;
	toolName: string;
	input: Record<string, unknown>;
	run: () => Promise<TResult>;
}) {
	const startedAt = Date.now();
	const sourceId = context.reviewRunId
		? `${context.reviewRunId}:${toolName}:${startedAt}`
		: null;

	try {
		const result = await run();

		try {
			await recordObservabilityEvent({
				userId: context.userId,
				repositoryId: context.repositoryDbId ?? null,
				pullRequestId: context.pullRequestDbId ?? null,
				reviewRunId: context.reviewRunId ?? null,
				traceId: context.reviewRunId ?? null,
				kind: "tool",
				action: toolName,
				status: "succeeded",
				severity: "success",
				title: `${toolName} succeeded`,
				body: `Tool call completed for ${context.repository.fullName}#${context.pullRequest.number}.`,
				sourceType: "review-tool-call",
				sourceId,
				durationMs: Date.now() - startedAt,
				metadata: {
					input,
					repository: context.repository.fullName,
					pullRequestNumber: context.pullRequest.number,
					reviewKind: context.kind,
				},
			});
		} catch (error) {
			log.warn({ err: error, toolName }, "Tool call observability failed.");
		}

		return result;
	} catch (error) {
		try {
			await recordObservabilityEvent({
				userId: context.userId,
				repositoryId: context.repositoryDbId ?? null,
				pullRequestId: context.pullRequestDbId ?? null,
				reviewRunId: context.reviewRunId ?? null,
				traceId: context.reviewRunId ?? null,
				kind: "tool",
				action: toolName,
				status: "failed",
				severity: "error",
				title: `${toolName} failed`,
				body: error instanceof Error ? error.message : "Tool call failed.",
				sourceType: "review-tool-call",
				sourceId,
				durationMs: Date.now() - startedAt,
				metadata: {
					input,
					repository: context.repository.fullName,
					pullRequestNumber: context.pullRequest.number,
					reviewKind: context.kind,
				},
			});
		} catch (observabilityError) {
			log.warn(
				{ err: observabilityError, toolName },
				"Tool call failure observability failed.",
			);
		}

		throw error;
	}
}

function createReviewTools(context: ReviewContext) {
	const reviewContext = context.settings.reviews.behavior.context;
	const repositorySearchTool = getEnabledTool(
		context.settings.ai.tools.available,
		"repository-search",
	);
	const relatedIssuesTool = getEnabledTool(
		context.settings.ai.tools.available,
		"related-issues",
	);
	const relatedPullRequestsTool = getEnabledTool(
		context.settings.ai.tools.available,
		"related-pull-requests",
	);
	const webSearchTool = getEnabledTool(
		context.settings.ai.tools.available,
		"web-search",
	);

	return {
		read_pull_request_file: tool({
			description:
				"Read the full file content from the pull request head branch. Use this when the patch is not enough.",
			inputSchema: z.object({
				path: z.string(),
				ref: z.enum(["head", "base"]).default("head"),
			}),
			execute: async ({ path, ref }) =>
				observeReviewToolCall({
					context,
					toolName: "read_pull_request_file",
					input: { path, ref },
					run: async () => {
						if (!reviewContext.includeRepositoryFiles) {
							return {
								path,
								ref,
								content:
									"Repository file access is disabled for this review context.",
							};
						}

						const content = await context.adapter.getFileContent({
							repositoryPath: context.repository.repositoryPath,
							filePath: path,
							ref:
								ref === "base"
									? context.pullRequest.targetBranch
									: context.pullRequest.sourceBranch,
						});

						return {
							path: content.path,
							ref: content.ref,
							content: content.content,
						};
					},
				}),
		}),
		search_repository_context: tool({
			description: repositorySearchTool
				? "Search related issues and pull requests in this repository."
				: "Repository search is disabled.",
			inputSchema: z.object({
				query: z.string().optional(),
				kind: z
					.array(z.enum(["issue", "pull_request"]))
					.default(["issue", "pull_request"]),
				limit: z
					.number()
					.int()
					.min(1)
					.max(20)
					.default(repositorySearchTool?.maxResults ?? 8),
			}),
			execute: async ({ query, kind, limit }) =>
				observeReviewToolCall({
					context,
					toolName: "search_repository_context",
					input: { query, kind, limit },
					run: async () => {
						if (!reviewContext.contextAware || !repositorySearchTool) {
							return {
								source: "disabled",
								items: [] as GitRepositorySearchResult[],
							};
						}

						const items = await context.adapter.searchRepository({
							repositoryPath: context.repository.repositoryPath,
							query,
							kind: kind as GitRepositorySearchKind[],
							limit,
						});

						return {
							source: getToolSource(repositorySearchTool),
							items,
							formatted: formatSearchResults(items),
						};
					},
				}),
		}),
		search_related_issues: tool({
			description:
				(relatedIssuesTool?.enabled ??
				context.settings.reviews.behavior.context.includeRelatedIssues)
					? "Search for related issues in this repository."
					: "Related issue search is disabled.",
			inputSchema: z.object({
				query: z.string(),
				limit: z
					.number()
					.int()
					.min(1)
					.max(20)
					.default(relatedIssuesTool?.maxResults ?? 6),
			}),
			execute: async ({ query, limit }) =>
				observeReviewToolCall({
					context,
					toolName: "search_related_issues",
					input: { query, limit },
					run: async () => {
						if (
							!reviewContext.includeRelatedIssues &&
							!relatedIssuesTool?.enabled
						) {
							return {
								items: [] as GitRepositorySearchResult[],
								formatted: "Related issue search is disabled.",
							};
						}

						const items = await context.adapter.searchRepository({
							repositoryPath: context.repository.repositoryPath,
							query,
							kind: ["issue"],
							limit,
						});

						return {
							items,
							formatted: formatSearchResults(items),
						};
					},
				}),
		}),
		search_related_pull_requests: tool({
			description:
				(relatedPullRequestsTool?.enabled ??
				context.settings.reviews.behavior.context.includeRelatedPRs)
					? "Search for related pull requests or merge requests in this repository."
					: "Related pull request search is disabled.",
			inputSchema: z.object({
				query: z.string(),
				limit: z
					.number()
					.int()
					.min(1)
					.max(20)
					.default(relatedPullRequestsTool?.maxResults ?? 6),
			}),
			execute: async ({ query, limit }) =>
				observeReviewToolCall({
					context,
					toolName: "search_related_pull_requests",
					input: { query, limit },
					run: async () => {
						if (
							!reviewContext.includeRelatedPRs &&
							!relatedPullRequestsTool?.enabled
						) {
							return {
								items: [] as GitRepositorySearchResult[],
								formatted: "Related pull request search is disabled.",
							};
						}

						const items = await context.adapter.searchRepository({
							repositoryPath: context.repository.repositoryPath,
							query,
							kind: ["pull_request"],
							limit,
						});

						return {
							items,
							formatted: formatSearchResults(items),
						};
					},
				}),
		}),
		web_search: tool({
			description: webSearchTool
				? "Search the public web for supplementary standards or documentation context."
				: "Web search is disabled.",
			inputSchema: z.object({
				query: z.string(),
				limit: z
					.number()
					.int()
					.min(1)
					.max(10)
					.default(webSearchTool?.maxResults ?? 5),
			}),
			execute: async ({ query, limit }) =>
				observeReviewToolCall({
					context,
					toolName: "web_search",
					input: { query, limit },
					run: async () => {
						if (!webSearchTool) {
							return {
								source: "disabled",
								results: [] as WebSearchResult[],
							};
						}

						return {
							source: "duckduckgo",
							results: await runWebSearch(query, limit),
						};
					},
				}),
		}),
	};
}

export async function runRepositoryReview(context: ReviewContext) {
	const resolution = await resolveLanguageModelForUser({
		userId: context.userId,
		modelId: context.settings.ai.reviewer.modelId,
	});
	log.info(resolution, "resolution");
	const reviewTools = createReviewTools(context);
	const thinkingProviderOptions = mapThinkingProviderOptions(context.settings);
	log.info(thinkingProviderOptions, "thinkingProviderOptions");
	const seededContext = await loadSeededRepositoryContext(context);
	log.info(seededContext);
	const reviewGeneration = await runTrackedAiGeneration({
		userId: context.userId,
		callKind: "review",
		modelId: context.settings.ai.reviewer.modelId,
		routePreview: resolution.preview,
		repositoryId: context.repositoryDbId ?? null,
		pullRequestId: context.pullRequestDbId ?? null,
		reviewRunId: context.reviewRunId ?? null,
		tags: [
			"review",
			context.repository.fullName,
			context.pullRequest.number.toString(),
			context.kind,
		],
		metadata: {
			repository: context.repository.fullName,
			pullRequestNumber: context.pullRequest.number,
			kind: context.kind,
		},
		execute: async ({ providerOptions }) => {
			const agent = new ToolLoopAgent({
				model: resolution.model,
				instructions: buildAgentInstructions(context.settings, context.kind),
				tools: reviewTools,
				output: Output.object({
					schema: repositoryReviewOutputSchema,
				}),
				stopWhen: stepCountIs(context.settings.ai.reviewer.maxSteps),
				maxOutputTokens: context.settings.ai.reviewer.maxOutputTokens,
				...(thinkingProviderOptions || providerOptions
					? {
							providerOptions: {
								...(providerOptions ?? {}),
								...(thinkingProviderOptions ?? {}),
							} as never,
						}
					: {}),
			});

			return agent.generate({
				prompt: buildPrompt({
					...context,
					seededContext,
				}),
			});
		},
	});
	log.info(reviewGeneration, "reviewGeneration");
	const result = reviewGeneration.result;
	const parsedOutput = repositoryReviewOutputSchema.parse(result.output);
	const output = applySettingsGating(
		sanitizeReviewOutput(parsedOutput),
		context.settings,
	);
	log.info(output, "reviewGeneration");
	const walkthrough = await generateWalkthroughText({
		context,
		output,
		files: context.files,
	});
	const cleanedWalkthrough = cleanMarkdown(stripCodeFence(walkthrough));
	const finalOutput: RepositoryReviewOutput =
		cleanedWalkthrough === output.walkthrough
			? output
			: {
					...output,
					walkthrough: cleanedWalkthrough,
				};
	log.info(finalOutput, "finalOutput");
	const poem = await generateFunPoem({
		context,
		output: finalOutput,
		walkthrough,
	});
	log.info(poem, "poem");

	return {
		output: finalOutput,
		commentMarkdown: buildReviewCommentMarkdown(
			context,
			finalOutput,
			context.files,
			poem,
		),
		poem,
		text: result.text,
		steps: result.steps,
		generationId: reviewGeneration.settlement.generationId,
		billing: reviewGeneration.settlement,
	};
}
