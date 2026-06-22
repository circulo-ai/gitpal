import type {
	GitProviderAdapter,
	GitPullRequestFile,
	GitRepository,
	GitRepositoryLabel,
} from "@gitpal/git";
import type {
	WorkspaceLabelerSettings,
	WorkspaceSettings,
} from "@gitpal/utils";
import { generateText, Output } from "ai";
import { z } from "zod";

import { runTrackedAiGeneration } from "./ai-billing";
import { resolveLanguageModelForUser } from "./llm-credentials";

const labelSuggestionSchema = z.object({
	name: z.string(),
	reason: z.string(),
});

const labelerOutputSchema = z.object({
	summary: z.string(),
	labels: z.array(labelSuggestionSchema).default([]),
});

export type LabelerTargetKind = "issue" | "pull_request";

export type LabelerTarget = {
	kind: LabelerTargetKind;
	number: number;
	title: string;
	body: string | null;
	currentLabels: string[];
	files: GitPullRequestFile[];
};

export type LabelerContext = {
	userId: string;
	organizationId?: string | null;
	adapter: GitProviderAdapter;
	repository: GitRepository;
	settings: WorkspaceSettings;
	target: LabelerTarget;
	trigger: string;
	providerEvent: string;
	providerAction: string | null;
	repositoryLabels?: GitRepositoryLabel[];
	repositoryDbId?: string | null;
	pullRequestDbId?: string | null;
	reviewRunId?: string | null;
};

export type LabelerResult = {
	summary: string;
	suggestedLabels: string[];
	appliedLabels: string[];
	availableLabels: GitRepositoryLabel[];
	text: string;
	generationId?: string;
};

function trimPatch(patch: string | null, maxLines = 20) {
	if (!patch) {
		return "No patch available.";
	}

	return patch.split("\n").slice(0, maxLines).join("\n");
}

function buildChangedFilesSummary(files: GitPullRequestFile[]) {
	return files.map(
		(file) =>
			`${file.path} [${file.status}] +${file.additions}/-${file.deletions}\n${trimPatch(
				file.patch,
			)}`,
	);
}

function buildLabelCatalog(labels: GitRepositoryLabel[]) {
	if (labels.length === 0) {
		return "No repository labels exist yet.";
	}

	return labels
		.map(
			(label) =>
				`- ${label.name}${label.description ? `: ${label.description}` : ""}${
					label.color ? ` (${label.color})` : ""
				}`,
		)
		.join("\n");
}

function buildLabelPrompt({
	repository,
	settings,
	target,
	repositoryLabels,
	trigger,
	providerEvent,
	providerAction,
}: {
	repository: GitRepository;
	settings: WorkspaceSettings;
	target: LabelerTarget;
	repositoryLabels: GitRepositoryLabel[];
	trigger: string;
	providerEvent: string;
	providerAction: string | null;
}) {
	const labelGuidance =
		settings.reviews.behavior.labelingInstructions.length > 0
			? settings.reviews.behavior.labelingInstructions
					.map(
						(instruction) =>
							`${instruction.label}: ${instruction.instructions}`,
					)
					.join("\n")
			: "No label-specific guidance.";

	const fileSummary =
		target.kind === "pull_request" && target.files.length > 0
			? buildChangedFilesSummary(target.files).join("\n\n")
			: "No changed files provided.";

	return `
Repository: ${repository.fullName}
Labeling target: ${target.kind} #${target.number}
Title: ${target.title}
Current labels: ${target.currentLabels.length > 0 ? target.currentLabels.join(", ") : "none"}
Body:
${target.body ?? "No body provided."}

Repository labels:
${buildLabelCatalog(repositoryLabels)}

Webhook context:
Event: ${providerEvent}
Action: ${providerAction ?? "none"}
Trigger: ${trigger}

Labeling instructions:
${labelGuidance}

Workspace instructions:
${settings.ai.labeler.extraInstructions}

Changed files:
${fileSummary}

Task:
- Pick up to ${settings.ai.labeler.maxLabels} labels from the repository label catalog.
- Prefer labels that are directly justified by the title, body, and diff.
- Do not invent labels that do not already exist in the repository label catalog.
- Avoid redundant labels that already exist on the issue or pull request.
- Return a short summary and a list of label objects with the name and a brief reason.
`.trim();
}

function normalizeSuggestedLabels(
	suggestedLabels: Array<{ name: string; reason: string }>,
	repositoryLabels: GitRepositoryLabel[],
	maxLabels: number,
	currentLabels: string[],
) {
	const labelLookup = new Map(
		repositoryLabels.map((label) => [label.name.toLowerCase(), label.name]),
	);
	const currentLabelSet = new Set(
		currentLabels.map((label) => label.toLowerCase()),
	);
	const selected: string[] = [];

	for (const suggestion of suggestedLabels) {
		const actualName = labelLookup.get(suggestion.name.trim().toLowerCase());
		if (!actualName) {
			continue;
		}

		const normalized = actualName.toLowerCase();
		if (currentLabelSet.has(normalized) || selected.includes(actualName)) {
			continue;
		}

		selected.push(actualName);
		if (selected.length >= maxLabels) {
			break;
		}
	}

	return selected;
}

async function applySuggestedLabels({
	adapter,
	repositoryPath,
	target,
	labels,
}: {
	adapter: GitProviderAdapter;
	repositoryPath: string;
	target: LabelerTarget;
	labels: string[];
}) {
	if (labels.length === 0) {
		return;
	}

	if (target.kind === "pull_request") {
		await adapter.addPullRequestLabels({
			repositoryPath,
			pullRequestNumber: target.number,
			labels,
		});
		return;
	}

	await adapter.addIssueLabels({
		repositoryPath,
		issueNumber: target.number,
		labels,
	});
}

export async function runRepositoryLabeler(context: LabelerContext) {
	const labelerSettings: WorkspaceLabelerSettings = context.settings.ai.labeler;
	if (!labelerSettings.enabled) {
		return null;
	}

	if (context.target.kind === "issue" && !labelerSettings.applyOnIssues) {
		return null;
	}

	if (
		context.target.kind === "pull_request" &&
		!labelerSettings.applyOnPullRequests
	) {
		return null;
	}

	let repositoryLabels: GitRepositoryLabel[] = [];

	if (context.repositoryLabels) {
		repositoryLabels = context.repositoryLabels;
	} else {
		try {
			repositoryLabels = await context.adapter.listRepositoryLabels({
				repositoryPath: context.repository.repositoryPath,
				limit: 100,
			});
		} catch (error) {
			// If we can't fetch labels (e.g., due to invalid credentials),
			// skip labeling and return a helpful message
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			return {
				summary: `Could not fetch repository labels: ${errorMessage}. Labeling was skipped.`,
				suggestedLabels: [],
				appliedLabels: [],
				availableLabels: [],
				text: "",
			};
		}
	}

	if (repositoryLabels.length === 0) {
		return {
			summary:
				"No repository labels exist yet, so no labeler suggestions were generated.",
			suggestedLabels: [],
			appliedLabels: [],
			availableLabels: repositoryLabels,
			text: "",
		};
	}

	const resolution = await resolveLanguageModelForUser({
		userId: context.userId,
		modelId: labelerSettings.modelId,
	});
	const generation = await runTrackedAiGeneration({
		userId: context.userId,
		organizationId: context.organizationId ?? null,
		callKind: "labeler",
		modelId: labelerSettings.modelId,
		routePreview: resolution.preview,
		repositoryId: context.repositoryDbId ?? null,
		pullRequestId: context.pullRequestDbId ?? null,
		reviewRunId: context.reviewRunId ?? null,
		tags: [
			"labeler",
			context.repository.fullName,
			context.target.kind,
			context.target.number.toString(),
		],
		metadata: {
			repository: context.repository.fullName,
			targetKind: context.target.kind,
			targetNumber: context.target.number,
			trigger: context.trigger,
			providerEvent: context.providerEvent,
			providerAction: context.providerAction,
		},
		execute: async ({ providerOptions }) =>
			generateText({
				model: resolution.model,
				output: Output.object({
					schema: labelerOutputSchema.extend({
						labels: z
							.array(labelSuggestionSchema)
							.max(labelerSettings.maxLabels)
							.default([]),
					}),
				}),
				maxOutputTokens: labelerSettings.maxOutputTokens,
				...(providerOptions
					? { providerOptions: providerOptions as never }
					: {}),
				prompt: buildLabelPrompt({
					repository: context.repository,
					settings: context.settings,
					target: context.target,
					repositoryLabels,
					trigger: context.trigger,
					providerEvent: context.providerEvent,
					providerAction: context.providerAction,
				}),
			}),
	});
	const output = generation.result.output;
	const suggestedLabels = normalizeSuggestedLabels(
		output.labels,
		repositoryLabels,
		labelerSettings.maxLabels,
		context.target.currentLabels,
	);
	const appliedLabels =
		context.settings.statuses.autoApplyLabels && suggestedLabels.length > 0
			? suggestedLabels.filter(
					(label) =>
						!context.target.currentLabels
							.map((currentLabel) => currentLabel.toLowerCase())
							.includes(label.toLowerCase()),
				)
			: [];

	if (appliedLabels.length > 0) {
		await applySuggestedLabels({
			adapter: context.adapter,
			repositoryPath: context.repository.repositoryPath,
			target: context.target,
			labels: appliedLabels,
		});
	}

	return {
		summary: output.summary,
		suggestedLabels,
		appliedLabels,
		availableLabels: repositoryLabels,
		text: generation.result.text,
		generationId: generation.settlement.generationId,
	};
}
