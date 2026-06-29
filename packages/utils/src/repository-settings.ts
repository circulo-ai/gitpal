import { z } from "zod";
import { stripAggregatorPrefixes } from "./llm-routing";

export type ReviewProfile = "chill" | "assertive";
export type ReviewFocus =
	| "balanced"
	| "security"
	| "performance"
	| "maintainability";
export type ThinkingEffort = "low" | "medium" | "high";
export type ThinkingSummaryVisibility = "auto" | "detailed" | "hidden";
export type WorkspaceManagedToolType =
	| "repository-search"
	| "related-issues"
	| "related-pull-requests"
	| "web-search";

export const workspaceManagedToolTypes = [
	"repository-search",
	"related-issues",
	"related-pull-requests",
	"web-search",
] as const satisfies readonly WorkspaceManagedToolType[];

export type WorkspacePathInstruction = {
	path: string;
	instructions: string;
};

export type WorkspaceLabelInstruction = {
	label: string;
	instructions: string;
};

export type WorkspaceManagedTool = {
	id: string;
	type: WorkspaceManagedToolType;
	label: string;
	description: string;
	enabled: boolean;
	maxResults: number;
};

export type WorkspaceAutoReviewSettings = {
	baseBranches: string[];
	labels: string[];
	skipLabels: string[];
	onOpen: boolean;
	onPush: boolean;
	onReadyForReview: boolean;
	onMention: boolean;
	skipDrafts: boolean;
};

export type WorkspaceReviewContextSettings = {
	contextAware: boolean;
	includeRepositoryFiles: boolean;
	includePullRequestHistory: boolean;
	includeRelatedIssues: boolean;
	includeRelatedPRs: boolean;
	mentionRelatedWork: boolean;
	maxRelatedItems: number;
};

export type WorkspaceReviewerSettings = {
	enabled: boolean;
	modelId: string;
	maxSteps: number;
	maxOutputTokens: number;
	focus: ReviewFocus;
	extraInstructions: string;
	postSummaryComment: boolean;
	postInlineFindings: boolean;
};

export type WorkspaceLabelerSettings = {
	enabled: boolean;
	modelId: string;
	maxLabels: number;
	maxOutputTokens: number;
	applyOnIssues: boolean;
	applyOnPullRequests: boolean;
	extraInstructions: string;
};

export type WorkspaceThinkingSettings = {
	enabled: boolean;
	effort: ThinkingEffort;
	budgetTokens: number;
	summaryVisibility: ThinkingSummaryVisibility;
};

export type WorkspaceWebhookCommandSettings = {
	enabled: boolean;
	commands: string[];
	aliases: string[];
};

export type WorkspaceWebhookEventSettings = {
	enabled: boolean;
	actions: string[];
};

export type WorkspaceSettings = {
	general: {
		language: string;
		earlyAccess: boolean;
		inheritance: boolean;
	};
	reviews: {
		summary: {
			highLevelSummary: boolean;
			highLevelSummaryInstructions: string;
			highLevelSummaryInWalkthrough: boolean;
		};
		walkthrough: {
			collapseWalkthrough: boolean;
			changedFilesSummary: boolean;
			sequenceDiagrams: boolean;
			estimateCodeReviewEffort: boolean;
			relatedIssues: boolean;
			relatedPRs: boolean;
			suggestedLabels: boolean;
			modelId: string;
		};
		behavior: {
			profile: ReviewProfile;
			pathInstructions: WorkspacePathInstruction[];
			pathFilters: string[];
			labelingInstructions: WorkspaceLabelInstruction[];
			requestChangesWorkflow: boolean;
			autoAssignReviewers: boolean;
			autoReview: WorkspaceAutoReviewSettings;
			context: WorkspaceReviewContextSettings;
		};
	};
	ai: {
		reviewer: WorkspaceReviewerSettings;
		labeler: WorkspaceLabelerSettings;
		thinking: WorkspaceThinkingSettings;
		tools: {
			allowRepositoryOverrides: boolean;
			available: WorkspaceManagedTool[];
		};
	};
	finishingTouches: {
		docstrings: {
			enabled: boolean;
			pathInstructions: WorkspacePathInstruction[];
		};
		unitTests: {
			enabled: boolean;
			instructions: string;
		};
	};
	preMergeChecks: {
		enabled: boolean;
		descriptionCheck: boolean;
		docstringCoverage: boolean;
		requireAiReview: boolean;
		blockOnOpenFindings: boolean;
		requireContextScan: boolean;
	};
	statuses: {
		autoApplyLabels: boolean;
		autoTitleInstructions: string;
		publishReviewSummary: boolean;
		publishPreMergeSummary: boolean;
	};
	webhooks: {
		mentions: WorkspaceWebhookCommandSettings;
		pullRequests: WorkspaceWebhookEventSettings;
		mergeRequests: WorkspaceWebhookEventSettings;
		preMerge: WorkspaceWebhookCommandSettings;
	};
	fun: {
		toneInstructions: string;
		modelId: string;
		poem: boolean;
		inProgressFortune: boolean;
		art: boolean;
	};
};

export type RepositorySettingsRecord = {
	useOrganizationSettings: boolean;
	settings: WorkspaceSettings;
};

export const workspacePathInstructionSchema = z.object({
	path: z.string(),
	instructions: z.string(),
});

export const workspaceLabelInstructionSchema = z.object({
	label: z.string(),
	instructions: z.string(),
});

export const workspaceManagedToolSchema = z.object({
	id: z.string().min(1),
	type: z.enum(workspaceManagedToolTypes),
	label: z.string(),
	description: z.string(),
	enabled: z.boolean(),
	maxResults: z.number().int().min(1).max(50),
});

export const workspaceAutoReviewSettingsSchema = z.object({
	baseBranches: z.array(z.string()),
	labels: z.array(z.string()),
	skipLabels: z.array(z.string()),
	onOpen: z.boolean(),
	onPush: z.boolean(),
	onReadyForReview: z.boolean(),
	onMention: z.boolean(),
	skipDrafts: z.boolean(),
});

export const workspaceReviewContextSettingsSchema = z.object({
	contextAware: z.boolean(),
	includeRepositoryFiles: z.boolean(),
	includePullRequestHistory: z.boolean(),
	includeRelatedIssues: z.boolean(),
	includeRelatedPRs: z.boolean(),
	mentionRelatedWork: z.boolean(),
	maxRelatedItems: z.number().int().min(1).max(20),
});

export const workspaceReviewerSettingsSchema = z.object({
	enabled: z.boolean(),
	modelId: z.string(),
	maxSteps: z.number().int().min(1).max(50),
	maxOutputTokens: z.number().int().min(256).max(32768),
	focus: z.enum(["balanced", "security", "performance", "maintainability"]),
	extraInstructions: z.string(),
	postSummaryComment: z.boolean(),
	postInlineFindings: z.boolean(),
});

export const workspaceLabelerSettingsSchema = z.object({
	enabled: z.boolean(),
	modelId: z.string(),
	maxLabels: z.number().int().min(1).max(10),
	maxOutputTokens: z.number().int().min(256).max(8192),
	applyOnIssues: z.boolean(),
	applyOnPullRequests: z.boolean(),
	extraInstructions: z.string(),
});

export const workspaceThinkingSettingsSchema = z.object({
	enabled: z.boolean(),
	effort: z.enum(["low", "medium", "high"]),
	budgetTokens: z.number().int().min(1024).max(32000),
	summaryVisibility: z.enum(["auto", "detailed", "hidden"]),
});

export const workspaceWebhookCommandSettingsSchema = z.object({
	enabled: z.boolean(),
	commands: z.array(z.string()),
	aliases: z.array(z.string()),
});

export const workspaceWebhookEventSettingsSchema = z.object({
	enabled: z.boolean(),
	actions: z.array(z.string()),
});

export const workspaceSettingsSchema = z.object({
	general: z.object({
		language: z.string(),
		earlyAccess: z.boolean(),
		inheritance: z.boolean(),
	}),
	reviews: z.object({
		summary: z.object({
			highLevelSummary: z.boolean(),
			highLevelSummaryInstructions: z.string(),
			highLevelSummaryInWalkthrough: z.boolean(),
		}),
		walkthrough: z.object({
			collapseWalkthrough: z.boolean(),
			changedFilesSummary: z.boolean(),
			sequenceDiagrams: z.boolean(),
			estimateCodeReviewEffort: z.boolean(),
			relatedIssues: z.boolean(),
			relatedPRs: z.boolean(),
			suggestedLabels: z.boolean(),
			modelId: z.string(),
		}),
		behavior: z.object({
			profile: z.enum(["chill", "assertive"]),
			pathInstructions: z.array(workspacePathInstructionSchema),
			pathFilters: z.array(z.string()),
			labelingInstructions: z.array(workspaceLabelInstructionSchema),
			requestChangesWorkflow: z.boolean(),
			autoAssignReviewers: z.boolean(),
			autoReview: workspaceAutoReviewSettingsSchema,
			context: workspaceReviewContextSettingsSchema,
		}),
	}),
	ai: z.object({
		reviewer: workspaceReviewerSettingsSchema,
		labeler: workspaceLabelerSettingsSchema,
		thinking: workspaceThinkingSettingsSchema,
		tools: z.object({
			allowRepositoryOverrides: z.boolean(),
			available: z.array(workspaceManagedToolSchema),
		}),
	}),
	finishingTouches: z.object({
		docstrings: z.object({
			enabled: z.boolean(),
			pathInstructions: z.array(workspacePathInstructionSchema),
		}),
		unitTests: z.object({
			enabled: z.boolean(),
			instructions: z.string(),
		}),
	}),
	preMergeChecks: z.object({
		enabled: z.boolean(),
		descriptionCheck: z.boolean(),
		docstringCoverage: z.boolean(),
		requireAiReview: z.boolean(),
		blockOnOpenFindings: z.boolean(),
		requireContextScan: z.boolean(),
	}),
	statuses: z.object({
		autoApplyLabels: z.boolean(),
		autoTitleInstructions: z.string(),
		publishReviewSummary: z.boolean(),
		publishPreMergeSummary: z.boolean(),
	}),
	webhooks: z.object({
		mentions: workspaceWebhookCommandSettingsSchema,
		pullRequests: workspaceWebhookEventSettingsSchema,
		mergeRequests: workspaceWebhookEventSettingsSchema,
		preMerge: workspaceWebhookCommandSettingsSchema,
	}),
	fun: z.object({
		toneInstructions: z.string(),
		modelId: z.string(),
		poem: z.boolean(),
		inProgressFortune: z.boolean(),
		art: z.boolean(),
	}),
});

export type DeepPartial<T> =
	T extends Array<infer U>
		? Array<DeepPartial<U>>
		: T extends Record<string, unknown>
			? {
				[K in keyof T]?: DeepPartial<T[K]>;
				}
			: T;

export type RepositoryPolicyPresetId = "balanced" | "guardrails" | "lean";

export type RepositoryPolicyPreset = {
	id: RepositoryPolicyPresetId;
	label: string;
	description: string;
	settings: DeepPartial<WorkspaceSettings>;
};

export const repositoryPolicyPresets = [
	{
		id: "balanced",
		label: "Balanced",
		description: "Keep the current workspace defaults and use them as the repo baseline.",
		settings: {},
	},
	{
		id: "guardrails",
		label: "Guardrails",
		description: "Bias toward stricter reviews, stronger pre-merge checks, and fewer local overrides.",
		settings: {
			reviews: {
				behavior: {
					profile: "assertive",
					requestChangesWorkflow: true,
					autoAssignReviewers: true,
				},
				walkthrough: {
					sequenceDiagrams: true,
				},
			},
			ai: {
				reviewer: {
					focus: "security",
					postInlineFindings: true,
				},
				tools: {
					allowRepositoryOverrides: false,
				},
			},
			preMergeChecks: {
				enabled: true,
				blockOnOpenFindings: true,
				requireAiReview: true,
				requireContextScan: true,
			},
		},
	},
	{
		id: "lean",
		label: "Lean",
		description: "Trim the ceremony so the repository moves faster with fewer automatic extras.",
		settings: {
			reviews: {
				walkthrough: {
					sequenceDiagrams: false,
					estimateCodeReviewEffort: false,
				},
				behavior: {
					autoAssignReviewers: false,
					context: {
						contextAware: false,
						includeRepositoryFiles: false,
						includePullRequestHistory: false,
						includeRelatedIssues: false,
						includeRelatedPRs: false,
						mentionRelatedWork: false,
					},
				},
			},
			ai: {
				reviewer: {
					focus: "balanced",
					maxSteps: 5,
					postInlineFindings: true,
				},
				tools: {
					allowRepositoryOverrides: true,
				},
			},
			preMergeChecks: {
				enabled: false,
				blockOnOpenFindings: false,
				requireAiReview: false,
				requireContextScan: false,
			},
			fun: {
				poem: false,
				inProgressFortune: false,
				art: false,
			},
		},
	},
] as const satisfies readonly RepositoryPolicyPreset[];

export function getRepositoryPolicyPreset(
	presetId: RepositoryPolicyPresetId,
) {
	return (
		repositoryPolicyPresets.find((preset) => preset.id === presetId) ??
		repositoryPolicyPresets[0]
	);
}

export function applyRepositoryPolicyPreset(
	base: WorkspaceSettings = createDefaultWorkspaceSettings(),
	presetId: RepositoryPolicyPresetId,
) {
	return mergeWorkspaceSettings(base, getRepositoryPolicyPreset(presetId).settings);
}

export const defaultWorkspaceSettings = {
	general: {
		language: "en-US",
		earlyAccess: false,
		inheritance: true,
	},
	reviews: {
		summary: {
			highLevelSummary: true,
			highLevelSummaryInstructions:
				"Generate a concise high-level summary of the pull request changes.",
			highLevelSummaryInWalkthrough: true,
		},
		walkthrough: {
			collapseWalkthrough: true,
			changedFilesSummary: true,
			sequenceDiagrams: true,
			estimateCodeReviewEffort: true,
			relatedIssues: true,
			relatedPRs: true,
			suggestedLabels: true,
			modelId: "anthropic/claude-sonnet-4.6",
		},
		behavior: {
			profile: "chill",
			pathInstructions: [],
			pathFilters: [],
			labelingInstructions: [],
			requestChangesWorkflow: false,
			autoAssignReviewers: false,
			autoReview: {
				baseBranches: ["main"],
				labels: [],
				skipLabels: ["skip-gitpal"],
				onOpen: true,
				onPush: true,
				onReadyForReview: true,
				onMention: true,
				skipDrafts: true,
			},
			context: {
				contextAware: true,
				includeRepositoryFiles: true,
				includePullRequestHistory: true,
				includeRelatedIssues: true,
				includeRelatedPRs: true,
				mentionRelatedWork: true,
				maxRelatedItems: 6,
			},
		},
	},
	ai: {
		reviewer: {
			enabled: true,
			modelId: "anthropic/claude-sonnet-4.6",
			maxSteps: 8,
			maxOutputTokens: 8192,
			focus: "balanced",
			extraInstructions:
				"Review the whole change in repository context. Do not behave like a diff-only reviewer.",
			postSummaryComment: true,
			postInlineFindings: true,
		},
		labeler: {
			enabled: true,
			modelId: "anthropic/claude-sonnet-4.6",
			maxLabels: 4,
			maxOutputTokens: 1024,
			applyOnIssues: true,
			applyOnPullRequests: true,
			extraInstructions:
				"Only choose labels that already exist in the repository label set.",
		},
		thinking: {
			enabled: true,
			effort: "medium",
			budgetTokens: 12000,
			summaryVisibility: "auto",
		},
		tools: {
			allowRepositoryOverrides: true,
			available: [
				{
					id: "repository-search",
					type: "repository-search",
					label: "Repository search",
					description:
						"Search repository context across provider metadata, files, issues, and pull requests.",
					enabled: true,
					maxResults: 8,
				},
				{
					id: "related-issues",
					type: "related-issues",
					label: "Related issues",
					description:
						"Find related issues that should be referenced in the review.",
					enabled: true,
					maxResults: 6,
				},
				{
					id: "related-pull-requests",
					type: "related-pull-requests",
					label: "Related PRs / MRs",
					description:
						"Search recent pull requests and merge requests for overlapping work.",
					enabled: true,
					maxResults: 6,
				},
				{
					id: "web-search",
					type: "web-search",
					label: "Web search",
					description:
						"Allow external web search for standards, docs, and third-party context.",
					enabled: false,
					maxResults: 5,
				},
			],
		},
	},
	finishingTouches: {
		docstrings: {
			enabled: true,
			pathInstructions: [],
		},
		unitTests: {
			enabled: false,
			instructions: "",
		},
	},
	preMergeChecks: {
		enabled: true,
		descriptionCheck: true,
		docstringCoverage: true,
		requireAiReview: true,
		blockOnOpenFindings: true,
		requireContextScan: true,
	},
	statuses: {
		autoApplyLabels: true,
		autoTitleInstructions:
			"Write a clear PR title that reflects the scope and intent of the change.",
		publishReviewSummary: true,
		publishPreMergeSummary: true,
	},
	webhooks: {
		mentions: {
			enabled: true,
			commands: ["review", "analyze"],
			aliases: ["@gitpal", "@gitpal-ai", "/gitpal"],
		},
		pullRequests: {
			enabled: true,
			actions: ["opened", "reopened", "synchronize", "ready_for_review"],
		},
		mergeRequests: {
			enabled: true,
			actions: ["open", "reopen", "update", "approved"],
		},
		preMerge: {
			enabled: true,
			commands: ["pre-merge", "premerge", "merge-check"],
			aliases: ["@gitpal", "/gitpal"],
		},
	},
	fun: {
		toneInstructions:
			"Keep the review warm, direct, and lightly playful without becoming flippant.",
		modelId: "anthropic/claude-sonnet-4.6",
		poem: false,
		inProgressFortune: false,
		art: false,
	},
} as const satisfies WorkspaceSettings;

export function createDefaultWorkspaceSettings(): WorkspaceSettings {
	return structuredClone(defaultWorkspaceSettings);
}

export function createDefaultRepositorySettings(): RepositorySettingsRecord {
	return {
		useOrganizationSettings: true,
		settings: createDefaultWorkspaceSettings(),
	};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeValue<T>(base: T, override: DeepPartial<T> | undefined): T {
	if (override === undefined) {
		return base;
	}

	if (Array.isArray(base) && Array.isArray(override)) {
		return override as T;
	}

	if (isPlainObject(base) && isPlainObject(override)) {
		const result = { ...base } as Record<string, unknown>;

		for (const [key, value] of Object.entries(override)) {
			if (value === undefined) {
				continue;
			}

			result[key] = mergeValue((result[key] ?? {}) as never, value as never);
		}

		return result as T;
	}

	return override as T;
}

const managedToolTypeSet = new Set<string>(workspaceManagedToolTypes);

function isKnownManagedTool(tool: WorkspaceManagedTool): boolean {
	return managedToolTypeSet.has(tool.type);
}

function normalizeModelId(value: string | null | undefined, fallback: string) {
	const trimmed = value?.trim() || "";

	return stripAggregatorPrefixes(trimmed || fallback);
}

export function mergeWorkspaceSettings(
	base: WorkspaceSettings,
	override?: DeepPartial<WorkspaceSettings> | null,
) {
	return mergeValue(base, override ?? undefined);
}

export function normalizeWorkspaceSettings(value: unknown): WorkspaceSettings {
	if (!isPlainObject(value)) {
		return createDefaultWorkspaceSettings();
	}

	const normalizedSettings = mergeWorkspaceSettings(
		createDefaultWorkspaceSettings(),
		value as DeepPartial<WorkspaceSettings>,
	);

	// Drop any tools whose type is no longer supported (e.g. legacy MCP entries
	// persisted before they were removed) so schema parsing does not reject them.
	normalizedSettings.ai.tools.available =
		normalizedSettings.ai.tools.available.filter(isKnownManagedTool);
	normalizedSettings.ai.reviewer.modelId = normalizeModelId(
		normalizedSettings.ai.reviewer.modelId,
		defaultWorkspaceSettings.ai.reviewer.modelId,
	);
	normalizedSettings.ai.labeler.modelId = normalizeModelId(
		normalizedSettings.ai.labeler.modelId,
		normalizedSettings.ai.reviewer.modelId,
	);
	normalizedSettings.reviews.walkthrough.modelId = normalizeModelId(
		normalizedSettings.reviews.walkthrough.modelId,
		normalizedSettings.ai.reviewer.modelId,
	);
	normalizedSettings.fun.modelId = normalizeModelId(
		normalizedSettings.fun.modelId,
		normalizedSettings.ai.reviewer.modelId,
	);

	return workspaceSettingsSchema.parse(normalizedSettings);
}

export function resolveEffectiveWorkspaceSettings({
	organizationSettings,
	repositorySettings,
	useOrganizationSettings,
}: {
	organizationSettings?: DeepPartial<WorkspaceSettings> | null;
	repositorySettings?: DeepPartial<WorkspaceSettings> | null;
	useOrganizationSettings: boolean;
}) {
	const organizationLayer = mergeWorkspaceSettings(
		createDefaultWorkspaceSettings(),
		organizationSettings,
	);
	const repositoryLayer = mergeWorkspaceSettings(
		createDefaultWorkspaceSettings(),
		repositorySettings,
	);

	if (!useOrganizationSettings) {
		if (organizationLayer.ai.tools.allowRepositoryOverrides) {
			return repositoryLayer;
		}

		return mergeWorkspaceSettings(repositoryLayer, {
			ai: {
				tools: organizationLayer.ai.tools,
			},
		});
	}

	return organizationLayer;
}
