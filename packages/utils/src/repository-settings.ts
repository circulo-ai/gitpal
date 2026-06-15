import { z } from "zod";

export type ReviewProfile = "chill" | "assertive";

export type WorkspacePathInstruction = {
	path: string;
	instructions: string;
};

export type WorkspaceLabelInstruction = {
	label: string;
	instructions: string;
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
		};
		behavior: {
			profile: ReviewProfile;
			pathInstructions: WorkspacePathInstruction[];
			pathFilters: string[];
			labelingInstructions: WorkspaceLabelInstruction[];
			requestChangesWorkflow: boolean;
			autoAssignReviewers: boolean;
			autoReview: {
				baseBranches: string[];
				labels: string[];
			};
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
		descriptionCheck: boolean;
		docstringCoverage: boolean;
	};
	statuses: {
		autoApplyLabels: boolean;
		autoTitleInstructions: string;
	};
	fun: {
		toneInstructions: string;
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
		}),
		behavior: z.object({
			profile: z.enum(["chill", "assertive"]),
			pathInstructions: z.array(workspacePathInstructionSchema),
			pathFilters: z.array(z.string()),
			labelingInstructions: z.array(workspaceLabelInstructionSchema),
			requestChangesWorkflow: z.boolean(),
			autoAssignReviewers: z.boolean(),
			autoReview: z.object({
				baseBranches: z.array(z.string()),
				labels: z.array(z.string()),
			}),
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
		descriptionCheck: z.boolean(),
		docstringCoverage: z.boolean(),
	}),
	statuses: z.object({
		autoApplyLabels: z.boolean(),
		autoTitleInstructions: z.string(),
	}),
	fun: z.object({
		toneInstructions: z.string(),
		poem: z.boolean(),
		inProgressFortune: z.boolean(),
		art: z.boolean(),
	}),
});

export type DeepPartial<T> = T extends Array<infer U>
	? Array<DeepPartial<U>>
	: T extends Record<string, unknown>
		? {
				[K in keyof T]?: DeepPartial<T[K]>;
			}
		: T;

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
			},
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
		descriptionCheck: true,
		docstringCoverage: true,
	},
	statuses: {
		autoApplyLabels: true,
		autoTitleInstructions:
			"Write a clear PR title that reflects the scope and intent of the change.",
	},
	fun: {
		toneInstructions:
			"Keep the review warm, direct, and lightly playful without becoming flippant.",
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

			result[key] = mergeValue(
				(result[key] ?? {}) as never,
				value as never,
			);
		}

		return result as T;
	}

	return override as T;
}

export function mergeWorkspaceSettings(
	base: WorkspaceSettings,
	override?: DeepPartial<WorkspaceSettings> | null,
) {
	return mergeValue(base, override ?? undefined);
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

	if (!useOrganizationSettings) {
		return mergeWorkspaceSettings(
			createDefaultWorkspaceSettings(),
			repositorySettings,
		);
	}

	return organizationLayer;
}
