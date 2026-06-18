import type {
	WorkspaceManagedTool,
	WorkspaceManagedToolMode,
	WorkspaceManagedToolType,
	WorkspaceSettings,
} from "./repository-settings";

export type ReviewCommentSeverity = "low" | "medium" | "high" | "critical";

export type ReviewCommentCategory =
	| "correctness"
	| "security"
	| "performance"
	| "maintainability"
	| "testing"
	| "documentation"
	| "architecture";

export type ReviewCommentKind = "review" | "mention" | "pre-merge";

export type ReviewCommentFinding = {
	title: string;
	severity: ReviewCommentSeverity;
	category: ReviewCommentCategory;
	body: string;
	filePath: string | null;
	line: number | null;
};

export type ReviewCommentRelatedWork = {
	kind: "issue" | "pull_request";
	number: number;
	title: string;
	reason: string;
	htmlUrl: string;
};

export type ReviewCommentPreMergeCheck = {
	name: string;
	status: "passed" | "warning" | "failed";
	details: string;
};

export type ReviewCommentEffort = {
	score: number;
	label: string;
	minutes: number;
};

export type ReviewCommentFile = {
	path: string;
	status: string;
	additions: number;
	deletions: number;
	summary: string;
};

export type WorkspaceToolPreviewRow = {
	id: string;
	label: string;
	type: WorkspaceManagedToolType;
	enabled: boolean;
	mode: WorkspaceManagedToolMode;
	serverName: string | null;
	maxResults: number;
	statusLabel: string;
	note: string;
};

export type ReviewCommentInput = {
	settings: WorkspaceSettings;
	repository: {
		fullName: string;
		description: string | null;
	};
	pullRequest: {
		number: number;
		title: string;
		authorLogin: string | null;
		sourceBranch: string;
		targetBranch: string;
	};
	kind: ReviewCommentKind;
	summary: string;
	walkthrough: string;
	findings: ReviewCommentFinding[];
	relatedWork: ReviewCommentRelatedWork[];
	preMergeChecks: ReviewCommentPreMergeCheck[];
	suggestedLabels: string[];
	poem?: string | null;
	reviewEffort?: ReviewCommentEffort | null;
	suggestedReviewers?: string[];
	/**
	 * Optional pull-request-specific Mermaid sequence diagram body (without the
	 * surrounding ```mermaid fence). When the walkthrough sequence-diagram setting
	 * is enabled, this is preferred over the generic templated diagram so the
	 * agent can describe the actual change flow. Falls back to the template when
	 * empty or omitted.
	 */
	sequenceDiagram?: string | null;
	changedFiles: ReviewCommentFile[];
};

export type ReviewPreviewOverrides = {
	repositoryFullName?: string;
	repositoryDescription?: string | null;
	pullRequestNumber?: number;
	pullRequestTitle?: string;
	pullRequestAuthor?: string | null;
	sourceBranch?: string;
	targetBranch?: string;
};

export type ReviewCommentData = ReviewCommentInput & {
	markdown: string;
	sequenceDiagram: string | null;
	toolRows: WorkspaceToolPreviewRow[];
	notes: string[];
};

function escapeMarkdown(value: string) {
	// Escape characters that would otherwise start inline formatting when the
	// value is rendered as plain text (link labels, reviewer handles, etc.).
	return value.replace(/([\\`*_{}[\]<>])/g, "\\$1");
}

function escapeTableCell(value: string) {
	return value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br />");
}

function inlineCode(value: string) {
	// Inline code spans cannot be backslash-escaped, so wrap the value in a
	// backtick run longer than any run it contains, padding with spaces when the
	// content itself starts or ends with a backtick (per CommonMark).
	const longestRun = (value.match(/`+/g) ?? []).reduce(
		(max, run) => Math.max(max, run.length),
		0,
	);
	const fence = "`".repeat(longestRun + 1);
	const padding = value.startsWith("`") || value.endsWith("`") ? " " : "";

	return `${fence}${padding}${value}${padding}${fence}`;
}

function fencedCode(language: string, body: string) {
	// Choose a fence longer than any backtick run inside the body so an embedded
	// code fence cannot terminate the block early.
	const longestRun = (body.match(/`+/g) ?? []).reduce(
		(max, run) => Math.max(max, run.length),
		0,
	);
	const fence = "`".repeat(Math.max(3, longestRun + 1));

	return `${fence}${language}\n${body}\n${fence}`;
}

function markdownLink(label: string, href: string) {
	return `[${escapeMarkdown(label)}](${href})`;
}

function capitalize(value: string) {
	return value ? `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}` : value;
}

function formatChangedFileSummary(file: ReviewCommentFile) {
	switch (file.status) {
		case "added":
			return "New file added.";
		case "removed":
			return "File removed.";
		case "renamed":
			return "File renamed and updated.";
		case "copied":
			return "File copied from another location.";
		case "changed":
			return "File changed.";
		default:
			return "Summary of changes to this file.";
	}
}

function buildChangedFilesTable(files: ReviewCommentFile[]) {
	if (files.length === 0) {
		return "No changed files summary available.";
	}

	const rows = files.map(
		(file) =>
			`| ${escapeTableCell(file.path)} | ${escapeTableCell(
				capitalize(file.status),
			)} | ${escapeTableCell(file.summary || formatChangedFileSummary(file))} |`,
	);

	return `| File | Status | Summary |\n| --- | --- | --- |\n${rows.join("\n")}`;
}

function isVisiblePath(path: string, filters: string[]) {
	if (filters.length === 0) {
		return true;
	}

	return !filters.some((pattern) =>
		path.includes(pattern.replace(/\*\*/g, "")),
	);
}

function buildSequenceDiagram(kind: ReviewCommentKind) {
	const label =
		kind === "pre-merge"
			? "pre-merge gate"
			: kind === "mention"
				? "mention-triggered review"
				: "pull request review";

	return [
		"sequenceDiagram",
		"  participant Author as PR author",
		"  participant GitPal",
		"  participant Repo",
		"  Author->>GitPal: Open " + label,
		"  GitPal->>Repo: Inspect diff and repository context",
		"  GitPal-->>Author: Publish review feedback",
	].join("\n");
}

const SEVERITY_RANK: Record<ReviewCommentSeverity, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
};

const SEVERITY_EMOJI: Record<ReviewCommentSeverity, string> = {
	critical: "🔴",
	high: "🟠",
	medium: "🟡",
	low: "🔵",
};

function buildFindingsSection(findings: ReviewCommentFinding[]) {
	if (findings.length === 0) {
		return "No findings were raised for this review pass.";
	}

	// Surface the most severe findings first; the sort is stable so findings of
	// equal severity keep their original (model-provided) ordering.
	return [...findings]
		.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
		.map((finding) => {
			const location =
				finding.filePath && finding.line
					? ` ${inlineCode(`${finding.filePath}:${finding.line}`)}`
					: finding.filePath
						? ` ${inlineCode(finding.filePath)}`
						: "";

			return `- ${SEVERITY_EMOJI[finding.severity]} **${finding.severity.toUpperCase()}** ${inlineCode(finding.category)}${location} - ${finding.title}\n  ${finding.body}`;
		})
		.join("\n");
}

function buildRelatedWorkSection(items: ReviewCommentRelatedWork[]) {
	if (items.length === 0) {
		return "";
	}

	return items
		.map(
			(item) =>
				`- ${markdownLink(`#${item.number}`, item.htmlUrl)} - ${item.title}: ${item.reason}`,
		)
		.join("\n");
}

function buildPreMergeChecksSection(checks: ReviewCommentPreMergeCheck[]) {
	if (checks.length === 0) {
		return "No pre-merge checks were generated for this run.";
	}

	return checks
		.map((check) => `- **${check.name}** (${check.status}): ${check.details}`)
		.join("\n");
}

function buildSuggestedLabelsSection(labels: string[]) {
	if (labels.length === 0) {
		return "No suggested labels.";
	}

	return labels.map((label) => `- ${inlineCode(label)}`).join("\n");
}

function buildSuggestedReviewersSection(reviewers: string[]) {
	if (reviewers.length === 0) {
		return "No suggested reviewers.";
	}

	return reviewers
		.map((reviewer) => `- ${escapeMarkdown(reviewer)}`)
		.join("\n");
}

function dedupeStrings(values: string[]) {
	const seen = new Set<string>();
	const result: string[] = [];

	for (const value of values) {
		const trimmed = value.trim();
		if (trimmed.length === 0 || seen.has(trimmed)) {
			continue;
		}
		seen.add(trimmed);
		result.push(trimmed);
	}

	return result;
}

function normalizeSequenceDiagram(diagram: string | null | undefined) {
	if (!diagram) {
		return null;
	}

	// Tolerate an agent that wraps the diagram in its own ```mermaid fence.
	const trimmed = diagram
		.trim()
		.replace(/^```(?:mermaid)?\s*\n?/i, "")
		.replace(/\n?```$/i, "")
		.trim();

	return trimmed.length > 0 ? trimmed : null;
}

export function estimateReviewEffort(
	files: ReviewCommentFile[],
	findings: ReviewCommentFinding[],
): ReviewCommentEffort {
	const totalChangedLines = files.reduce(
		(total, file) => total + file.additions + file.deletions,
		0,
	);
	const findingWeight = findings.reduce((total, finding) => {
		switch (finding.severity) {
			case "critical":
				return total + 2.5;
			case "high":
				return total + 1.75;
			case "medium":
				return total + 1;
			case "low":
				return total + 0.5;
			default:
				return total;
		}
	}, 0);
	const rawScore =
		files.length * 0.7 +
		totalChangedLines / 160 +
		findingWeight +
		(totalChangedLines > 300 ? 0.6 : 0);
	const score = Math.min(5, Math.max(1, Math.round(rawScore)));
	const labelMap = [
		"Very light",
		"Light",
		"Moderate",
		"Heavy",
		"Very heavy",
	] as const;
	const minutesMap = [10, 18, 25, 40, 60] as const;

	return {
		score,
		label: labelMap[score - 1]!,
		minutes: minutesMap[score - 1]!,
	};
}

function buildToolStatusLabel(tool: WorkspaceManagedTool) {
	if (!tool.enabled) {
		return "Disabled";
	}

	if (tool.mode === "builtin") {
		return "Built-in";
	}

	return tool.mcpServerName
		? `MCP · ${tool.mcpServerName}`
		: "MCP · missing server";
}

function buildToolNote(tool: WorkspaceManagedTool) {
	if (!tool.enabled) {
		return "This tool is turned off for the current workspace.";
	}

	if (tool.mode === "builtin") {
		return "Runs through GitPal's built-in provider adapters.";
	}

	if (!tool.mcpServerName) {
		return "MCP mode is selected, but no server name is configured yet.";
	}

	return `Configured to use the ${tool.mcpServerName} MCP server.`;
}

export function describeWorkspaceManagedTools(
	settings: WorkspaceSettings,
): WorkspaceToolPreviewRow[] {
	return settings.ai.tools.available.map((tool) => ({
		id: tool.id,
		label: tool.label,
		type: tool.type,
		enabled: tool.enabled,
		mode: tool.mode,
		serverName: tool.mcpServerName,
		maxResults: tool.maxResults,
		statusLabel: buildToolStatusLabel(tool),
		note: buildToolNote(tool),
	}));
}

function buildPreviewNotes(
	settings: WorkspaceSettings,
	toolRows: WorkspaceToolPreviewRow[],
) {
	const activeTools = toolRows.filter((row) => row.enabled).length;
	const mcpTools = toolRows.filter(
		(row) => row.enabled && row.mode === "mcp",
	).length;

	return [
		settings.ai.reviewer.enabled
			? "AI reviewer is enabled."
			: "AI reviewer is disabled, so this is a preview-only draft.",
		settings.ai.reviewer.postSummaryComment
			? "Summary comments are posted automatically."
			: "Summary comments are generated but not posted automatically.",
		settings.ai.reviewer.postInlineFindings
			? "Inline findings are posted when the provider supports them."
			: "Inline findings stay in the summary comment only.",
		settings.reviews.behavior.context.contextAware
			? "Repository context search is enabled."
			: "Repository context search is disabled.",
		settings.ai.tools.allowRepositoryOverrides
			? "Repositories can override the workspace tool policy."
			: "Workspace tool policy is locked for repositories.",
		`${activeTools} of ${toolRows.length} tools are enabled.`,
		mcpTools > 0
			? `${mcpTools} enabled tool${mcpTools === 1 ? "" : "s"} are configured for MCP mode.`
			: "No enabled tools are currently configured for MCP mode.",
	];
}

function buildPreviewSummary(settings: WorkspaceSettings) {
	const focusMap = {
		balanced:
			"balanced between correctness, maintainability, and implementation quality",
		security:
			"focused on token handling, auth boundaries, and data exposure risks",
		performance:
			"focused on request overhead, repeated work, and hot-path efficiency",
		maintainability:
			"focused on naming, layering, and how easy the change will be to evolve",
	} satisfies Record<WorkspaceSettings["ai"]["reviewer"]["focus"], string>;

	return `${settings.reviews.summary.highLevelSummaryInstructions} This preview is tuned to be ${focusMap[settings.ai.reviewer.focus]}.`;
}

function buildPreviewWalkthrough(settings: WorkspaceSettings) {
	const tone =
		settings.reviews.behavior.profile === "assertive"
			? "This change needs a direct review, but the feedback should stay constructive."
			: "This change is mostly straightforward, but the interesting edge cases deserve attention.";
	const context = settings.reviews.behavior.context.contextAware
		? "Repository context is enabled, so related issues and prior pull requests can be surfaced when they help explain the change."
		: "Repository context is disabled, so this preview stays focused on the current diff.";
	const workflow = settings.reviews.behavior.requestChangesWorkflow
		? "Blocking issues should be written as change requests."
		: "Blocking issues should be called out clearly without turning the comment into a hard stop.";

	return `${tone} ${context} ${workflow}`;
}

function buildPreviewFindings(
	settings: WorkspaceSettings,
): ReviewCommentFinding[] {
	if (!settings.ai.reviewer.enabled) {
		return [];
	}

	switch (settings.ai.reviewer.focus) {
		case "security":
			return [
				{
					title: "Token redemption is still replayable",
					severity: "high",
					category: "security",
					body: "Mark the token as consumed before returning the success response so retries cannot reuse it.",
					filePath: "src/auth/token-service.ts",
					line: 42,
				},
			];
		case "performance":
			return [
				{
					title: "Repository lookup happens on the hot path twice",
					severity: "medium",
					category: "performance",
					body: "Cache the repository row for the request instead of re-querying after the validation pass.",
					filePath: "src/services/review-agent.ts",
					line: 188,
				},
			];
		case "maintainability":
			return [
				{
					title: "Settings merge logic is duplicated",
					severity: "low",
					category: "maintainability",
					body: "Extract the tool-policy merge into a helper so the workspace and repository paths stay aligned.",
					filePath: "packages/api/src/services/workspace-settings.ts",
					line: 176,
				},
			];
		default:
			return [
				{
					title: "Missing nil check before publishing the comment",
					severity: "medium",
					category: "correctness",
					body: "Guard the comment publication path so a missing author or empty body does not silently short-circuit the review.",
					filePath: "packages/api/src/services/repository-webhooks.ts",
					line: 923,
				},
			];
	}
}

function buildPreviewRelatedWork(
	settings: WorkspaceSettings,
): ReviewCommentRelatedWork[] {
	if (!settings.reviews.behavior.context.contextAware) {
		return [];
	}

	const items: ReviewCommentRelatedWork[] = [];

	if (settings.reviews.behavior.context.includeRelatedIssues) {
		items.push({
			kind: "issue",
			number: 128,
			title: "Avoid token replay across retry paths",
			reason: "Matches the auth flow and the token-redemption edge case.",
			htmlUrl: "https://github.com/acme/api/issues/128",
		});
	}

	if (settings.reviews.behavior.context.includeRelatedPRs) {
		items.push({
			kind: "pull_request",
			number: 317,
			title: "Harden request lifecycle handling",
			reason: "Touches the same request-processing code path as this preview.",
			htmlUrl: "https://github.com/acme/api/pull/317",
		});
	}

	return items;
}

function buildPreviewChecks(
	settings: WorkspaceSettings,
	findings: ReviewCommentFinding[],
): ReviewCommentPreMergeCheck[] {
	if (!settings.preMergeChecks.enabled) {
		return [];
	}

	return [
		{
			name: "Description check",
			status: "passed",
			details:
				"The pull request description is present and gives reviewers enough context.",
		},
		{
			name: "Docstring coverage",
			status: settings.finishingTouches.docstrings.enabled
				? "passed"
				: "warning",
			details: settings.finishingTouches.docstrings.enabled
				? "Docstring generation is enabled, so coverage can be expanded automatically."
				: "Docstring generation is disabled for this workspace.",
		},
		{
			name: "AI review",
			status: settings.ai.reviewer.enabled ? "passed" : "warning",
			details: settings.ai.reviewer.enabled
				? "An AI review run can be generated for this pull request."
				: "AI review is disabled in the current workspace settings.",
		},
		{
			name: "Open findings",
			status: findings.length > 0 ? "warning" : "passed",
			details:
				findings.length > 0
					? "There are open review findings that should be resolved before merging."
					: "No open findings remain in this preview.",
		},
		{
			name: "Context scan",
			status: settings.reviews.behavior.context.contextAware
				? "passed"
				: "warning",
			details: settings.reviews.behavior.context.contextAware
				? "Repository context scanning is enabled for this workspace."
				: "Repository context scanning is disabled, so related work will be skipped.",
		},
	];
}

function buildPreviewEffort(
	files: ReviewCommentFile[],
	findings: ReviewCommentFinding[],
) {
	return estimateReviewEffort(files, findings);
}

function buildPreviewPoem(settings: WorkspaceSettings) {
	if (!settings.fun.poem) {
		return null;
	}

	return [
		"🐰 The diff came hopping into view,",
		"With labels chosen sharp and true,",
		"Walkthroughs hum, the checks stand tall,",
		"GitPal keeps the PR ready for all.",
	].join("\n");
}

function buildPreviewFiles(): ReviewCommentFile[] {
	return [
		{
			path: "src/middleware/auth.ts",
			status: "modified",
			additions: 18,
			deletions: 6,
			summary: "Adjust request authorization and token checks.",
		},
		{
			path: "src/services/token-service.ts",
			status: "modified",
			additions: 34,
			deletions: 10,
			summary: "Centralize token issuance and redemption logic.",
		},
		{
			path: "tests/token-service.test.ts",
			status: "added",
			additions: 126,
			deletions: 0,
			summary: "Covers token replay and expiry handling.",
		},
	];
}

function buildPreviewInput(
	settings: WorkspaceSettings,
	overrides?: ReviewPreviewOverrides,
): ReviewCommentInput {
	const repositoryFullName = overrides?.repositoryFullName ?? "acme/api";
	const repositoryDescription =
		overrides?.repositoryDescription ??
		"Token handling and review workflow service.";
	const pullRequestNumber = overrides?.pullRequestNumber ?? 318;
	const pullRequestTitle =
		overrides?.pullRequestTitle ??
		(settings.ai.reviewer.focus === "security"
			? "feat(auth): harden token redemption flow"
			: settings.ai.reviewer.focus === "performance"
				? "perf(review): reduce repeated repository lookups"
				: settings.ai.reviewer.focus === "maintainability"
					? "refactor(review): simplify settings and tool policy merging"
					: "feat(review): improve pull request context handling");
	const changedFiles = buildPreviewFiles();
	const findings = buildPreviewFindings(settings);
	const relatedWork = buildPreviewRelatedWork(settings);
	const preMergeChecks = buildPreviewChecks(settings, findings);
	const suggestedReviewers = ["harjotgill", "guritfaq"];

	return {
		settings,
		repository: {
			fullName: repositoryFullName,
			description: repositoryDescription,
		},
		pullRequest: {
			number: pullRequestNumber,
			title: pullRequestTitle,
			authorLogin: overrides?.pullRequestAuthor ?? "mhddev",
			sourceBranch: overrides?.sourceBranch ?? "feat/token-redemption",
			targetBranch: overrides?.targetBranch ?? "main",
		},
		kind: "review",
		summary: buildPreviewSummary(settings),
		walkthrough: buildPreviewWalkthrough(settings),
		findings,
		relatedWork,
		preMergeChecks,
		suggestedLabels: settings.reviews.walkthrough.suggestedLabels
			? ["security", "needs-review"]
			: [],
		poem: buildPreviewPoem(settings),
		reviewEffort: buildPreviewEffort(changedFiles, findings),
		suggestedReviewers,
		changedFiles,
	};
}

export function buildRepositoryReviewCommentData(
	input: ReviewCommentInput,
): ReviewCommentData {
	const summary = input.settings.reviews.summary.highLevelSummary
		? input.summary.trim()
		: "";
	const visibleFiles = input.changedFiles.filter((file) =>
		isVisiblePath(file.path, input.settings.reviews.behavior.pathFilters),
	);
	const findings = input.findings;
	const relatedWork = input.settings.reviews.behavior.context.contextAware
		? input.relatedWork.filter((item) =>
				item.kind === "issue"
					? input.settings.reviews.walkthrough.relatedIssues
					: input.settings.reviews.walkthrough.relatedPRs,
			)
		: [];
	const preMergeChecks = input.settings.preMergeChecks.enabled
		? input.preMergeChecks
		: [];
	const suggestedLabels =
		input.settings.reviews.walkthrough.suggestedLabels && input.suggestedLabels
			? dedupeStrings(input.suggestedLabels)
			: [];
	const reviewEffort = input.settings.reviews.walkthrough
		.estimateCodeReviewEffort
		? (input.reviewEffort ?? estimateReviewEffort(visibleFiles, findings))
		: null;
	const suggestedReviewers = dedupeStrings(input.suggestedReviewers ?? []);
	const poem =
		input.settings.fun.poem && input.poem && input.poem.trim()
			? input.poem.trim()
			: null;
	const sequenceDiagram = input.settings.reviews.walkthrough.sequenceDiagrams
		? (normalizeSequenceDiagram(input.sequenceDiagram) ??
			buildSequenceDiagram(input.kind))
		: null;
	const sections: string[] = [];

	if (summary) {
		sections.push(`## Summary\n${summary}`);
	}

	const walkthroughParts: string[] = [];
	const walkthrough = input.walkthrough.trim();

	if (walkthrough) {
		if (
			summary &&
			input.settings.reviews.summary.highLevelSummaryInWalkthrough
		) {
			walkthroughParts.push(`> ${summary.replace(/\r?\n/g, "\n> ")}`);
		}

		walkthroughParts.push(walkthrough);
	}

	if (input.settings.reviews.walkthrough.changedFilesSummary) {
		walkthroughParts.push(
			`### Changes\n${buildChangedFilesTable(visibleFiles)}`,
		);
	}

	if (sequenceDiagram) {
		walkthroughParts.push(
			`### Sequence diagram(s)\n${fencedCode("mermaid", sequenceDiagram)}`,
		);
	}

	if (relatedWork.length > 0) {
		walkthroughParts.push(
			`### Related work\n${buildRelatedWorkSection(relatedWork)}`,
		);
	}

	if (walkthroughParts.length > 0) {
		const walkthroughBlock = walkthroughParts.join("\n\n");
		if (input.settings.reviews.walkthrough.collapseWalkthrough) {
			sections.push(
				`## Walkthrough\n<details>\n<summary>Walkthrough</summary>\n\n${walkthroughBlock}\n\n</details>`,
			);
		} else {
			sections.push(`## Walkthrough\n${walkthroughBlock}`);
		}
	}

	sections.push(`## Findings\n${buildFindingsSection(findings)}`);

	if (reviewEffort) {
		sections.push(
			`## Estimated code review effort\n🎯 ${reviewEffort.score} (${reviewEffort.label}) | ⏱️ ~${reviewEffort.minutes} minutes`,
		);
	}

	if (suggestedReviewers.length > 0) {
		sections.push(
			`## Suggested reviewers\n${buildSuggestedReviewersSection(suggestedReviewers)}`,
		);
	}

	if (poem) {
		sections.push(`## Poem\n${poem}`);
	}

	if (preMergeChecks.length > 0) {
		sections.push(
			`## Pre-merge checks\n${buildPreMergeChecksSection(preMergeChecks)}`,
		);
	}

	if (suggestedLabels.length > 0) {
		sections.push(
			`## Suggested labels\n${buildSuggestedLabelsSection(suggestedLabels)}`,
		);
	}

	const markdown = sections.join("\n\n");
	const toolRows = describeWorkspaceManagedTools(input.settings);

	return {
		...input,
		summary,
		relatedWork,
		preMergeChecks,
		suggestedLabels,
		poem,
		reviewEffort,
		suggestedReviewers,
		markdown,
		sequenceDiagram,
		toolRows,
		notes: buildPreviewNotes(input.settings, toolRows),
	};
}

export function buildRepositoryReviewCommentMarkdown(
	input: ReviewCommentInput,
) {
	return buildRepositoryReviewCommentData(input).markdown;
}

export function buildRepositoryReviewPreviewData(
	settings: WorkspaceSettings,
	overrides?: ReviewPreviewOverrides,
) {
	return buildRepositoryReviewCommentData(
		buildPreviewInput(settings, overrides),
	);
}
