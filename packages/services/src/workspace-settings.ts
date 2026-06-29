import { type GitProviderAdapter, GitProviderRequestError } from "@gitpal/git";
import { createLogger } from "@gitpal/logger";
import { type RepositorySettings, repositories } from "@gitpal/repositories";
import {
	createDefaultRepositorySettings,
	createDefaultWorkspaceSettings,
	gitpalConfigFileNames,
	normalizeWorkspaceSettings,
	parseGitPalConfig,
	type RepositorySettingsRecord,
	resolveGitPalConfigWorkspaceSettings,
	type WorkspaceSettings,
	workspaceSettingsSchema,
} from "@gitpal/utils";
import { getAutomationActorForRepository } from "./git-provider-access";
import { recordAdminActionEvent } from "./observability";
import { stableId } from "./stable-id";

type RepositorySettingsRow = RepositorySettings;

const log = createLogger("workspace-settings");
const GITPAL_CENTRAL_CONFIG_REPOSITORY_NAME = "gitpal";

type GitPalConfigResolution = {
	fileName: string;
	settings: WorkspaceSettings;
};

type RepositoryGitPalConfigResolution = {
	repositoryConfig: GitPalConfigResolution | null;
	centralConfig: GitPalConfigResolution | null;
};

function getOrganizationSettingsId(organizationId: string) {
	return `org_settings_${stableId([organizationId]).slice(0, 32)}`;
}

function getRepositorySettingsId(organizationId: string, repositoryId: string) {
	return `repo_settings_${stableId([organizationId, repositoryId]).slice(0, 32)}`;
}

function toWorkspaceSettings(
	value: WorkspaceSettings | Record<string, unknown> | null | undefined,
) {
	return normalizeWorkspaceSettings(value ?? createDefaultWorkspaceSettings());
}

function toRepositorySettings(
	row: RepositorySettingsRow | null,
): RepositorySettingsRecord {
	if (!row) {
		return createDefaultRepositorySettings();
	}

	return {
		useOrganizationSettings: row.useOrganizationSettings,
		settings: toWorkspaceSettings(row.settings as WorkspaceSettings),
	};
}

function buildWorkspaceSettingsAuditMetadata(settings: WorkspaceSettings) {
	return {
		reviewProfile: settings.reviews.behavior.profile,
		reviewFocus: settings.ai.reviewer.focus,
		requestChangesWorkflow: settings.reviews.behavior.requestChangesWorkflow,
		autoAssignReviewers: settings.reviews.behavior.autoAssignReviewers,
		preMergeChecksEnabled: settings.preMergeChecks.enabled,
		sequenceDiagrams: settings.reviews.walkthrough.sequenceDiagrams,
		inlineFindings: settings.ai.reviewer.postInlineFindings,
		allowRepositoryOverrides: settings.ai.tools.allowRepositoryOverrides,
	};
}

export async function getOrganizationWorkspaceSettings(organizationId: string) {
	const row =
		await repositories.organizationSettings.findByOrganizationId(
			organizationId,
		);

	return toWorkspaceSettings(row?.settings as WorkspaceSettings);
}

export async function saveOrganizationWorkspaceSettings({
	actorUserId,
	organizationId,
	settings,
}: {
	actorUserId: string;
	organizationId: string;
	settings: WorkspaceSettings;
}) {
	const validatedSettings = workspaceSettingsSchema.parse(settings);
	const normalizedSettings = normalizeWorkspaceSettings(validatedSettings);
	const now = new Date();
	const row = await repositories.organizationSettings.upsertForOrganization({
		id: getOrganizationSettingsId(organizationId),
		organizationId,
		settings: normalizedSettings,
		createdAt: now,
		updatedAt: now,
	});

	await recordAdminActionEvent({
		userId: actorUserId,
		organizationId,
		action: "update",
		status: "updated",
		title: "Workspace settings updated",
		body: "Workspace-level review policy and automation defaults were saved.",
		sourceType: "workspace-settings",
		sourceId: organizationId,
		metadata: buildWorkspaceSettingsAuditMetadata(normalizedSettings),
	});

	return toWorkspaceSettings(row?.settings as WorkspaceSettings);
}

async function getRepositorySettingsRow({
	organizationId,
	repositoryId,
}: {
	organizationId: string;
	repositoryId: string;
}) {
	return repositories.repositorySettings.findByOrgAndRepository(
		organizationId,
		repositoryId,
	);
}

function getCentralConfigRepositoryPaths(repositoryPath: string) {
	const segments = repositoryPath.split("/").filter(Boolean);
	if (segments.length < 2) {
		return [] as string[];
	}

	const paths: string[] = [];
	for (
		let parentLength = segments.length - 1;
		parentLength >= 1;
		parentLength -= 1
	) {
		const parentPath = segments.slice(0, parentLength).join("/");
		const candidatePath = `${parentPath}/${GITPAL_CENTRAL_CONFIG_REPOSITORY_NAME}`;
		if (candidatePath !== repositoryPath) {
			paths.push(candidatePath);
		}
	}

	return paths;
}

async function readGitPalConfigFromRepositoryPath({
	adapter,
	repositoryId,
	repositoryPath,
	providerId,
	source,
}: {
	adapter: GitProviderAdapter;
	repositoryId: string;
	repositoryPath: string;
	providerId: string;
	source: "repository" | "central";
}) {
	for (const fileName of gitpalConfigFileNames) {
		try {
			const file = await adapter.getFileContent({
				repositoryPath,
				filePath: fileName,
			});
			const settings = parseGitPalConfig(file.content);
			if (settings) {
				return { fileName, settings };
			}
		} catch (error) {
			if (error instanceof GitProviderRequestError && error.status === 404) {
				continue;
			}

			log.debug(
				{
					err: error,
					repositoryId,
					repositoryPath,
					providerId,
					fileName,
					source,
				},
				"Unable to read GitPal config file; continuing without it.",
			);
			return null;
		}
	}

	return null;
}

async function loadRepositoryGitPalConfigSettings({
	repositoryId,
	repositoryPath,
	providerId,
}: {
	repositoryId: string;
	repositoryPath: string;
	providerId: string;
}): Promise<RepositoryGitPalConfigResolution | null> {
	const automationActor = await getAutomationActorForRepository({
		repositoryId,
		providerId,
	});

	if (!automationActor) {
		return null;
	}

	const repositoryConfig = await readGitPalConfigFromRepositoryPath({
		adapter: automationActor.adapter,
		repositoryId,
		repositoryPath,
		providerId,
		source: "repository",
	});

	let centralConfig: GitPalConfigResolution | null = null;
	for (const candidateRepositoryPath of getCentralConfigRepositoryPaths(
		repositoryPath,
	)) {
		centralConfig = await readGitPalConfigFromRepositoryPath({
			adapter: automationActor.adapter,
			repositoryId,
			repositoryPath: candidateRepositoryPath,
			providerId,
			source: "central",
		});
		if (centralConfig) {
			break;
		}
	}

	return {
		repositoryConfig,
		centralConfig,
	};
}

export async function getRepositoryWorkspaceSettings({
	organizationId,
	repositoryId,
	userId,
}: {
	organizationId: string | null;
	repositoryId: string;
	userId: string;
}) {
	if (!organizationId) {
		return null;
	}

	const accessRow =
		await repositories.repositoryAccess.findAccessWithRepository(
			userId,
			repositoryId,
			organizationId,
		);

	if (!accessRow) {
		return null;
	}

	const [organizationSettingsRow, repositorySettingsRow] = await Promise.all([
		repositories.organizationSettings.findByOrganizationId(organizationId),
		getRepositorySettingsRow({ organizationId, repositoryId }),
	]);
	const repositoryConfigResolution = await loadRepositoryGitPalConfigSettings({
		repositoryId: accessRow.repository.id,
		repositoryPath: accessRow.repository.repositoryPath,
		providerId: accessRow.repository.providerId,
	});
	const repositoryConfigSettings = repositoryConfigResolution?.repositoryConfig;
	const centralConfigSettings = repositoryConfigResolution?.centralConfig;

	const organizationSettings = toWorkspaceSettings(
		organizationSettingsRow?.settings as WorkspaceSettings,
	);
	const repositorySettings = toRepositorySettings(repositorySettingsRow);

	return {
		repository: accessRow.repository,
		useOrganizationSettings: repositorySettings.useOrganizationSettings,
		organizationSettings,
		repositorySettings: repositorySettings.settings,
		repositoryConfigFileName: repositoryConfigSettings?.fileName ?? null,
		repositoryConfigSettings: repositoryConfigSettings?.settings ?? null,
		repositoryCentralConfigFileName: centralConfigSettings?.fileName ?? null,
		repositoryCentralConfigSettings: centralConfigSettings?.settings ?? null,
		effectiveSettings: resolveGitPalConfigWorkspaceSettings({
			organizationSettings,
			repositorySettings: repositorySettings.settings,
			useOrganizationSettings: repositorySettings.useOrganizationSettings,
			centralConfigSettings: centralConfigSettings?.settings ?? null,
			configSettings: repositoryConfigSettings?.settings ?? null,
		}),
	};
}

export async function saveRepositoryWorkspaceSettings({
	actorUserId,
	organizationId,
	repositoryId,
	useOrganizationSettings,
	settings,
}: {
	actorUserId: string;
	organizationId: string;
	repositoryId: string;
	useOrganizationSettings: boolean;
	settings: WorkspaceSettings;
}) {
	const repository = await repositories.repository.findByIdAndOrg(
		repositoryId,
		organizationId,
	);
	if (!repository) {
		throw new Error("Repository was not found in this workspace.");
	}

	const validatedSettings = workspaceSettingsSchema.parse(settings);
	const normalizedSettings = normalizeWorkspaceSettings(validatedSettings);
	const now = new Date();
	const row = await repositories.repositorySettings.upsert({
		id: getRepositorySettingsId(organizationId, repositoryId),
		organizationId,
		repositoryId,
		useOrganizationSettings,
		settings: normalizedSettings,
		createdAt: now,
		updatedAt: now,
	});

	await recordAdminActionEvent({
		userId: actorUserId,
		organizationId,
		repositoryId,
		action: useOrganizationSettings ? "inherit" : "update",
		status: useOrganizationSettings ? "updated" : "customized",
		title: "Repository settings updated",
		body: useOrganizationSettings
			? "This repository now inherits workspace policy defaults."
			: "This repository now uses repository-specific policy overrides.",
		sourceType: "repository-settings",
		sourceId: repositoryId,
		metadata: {
			...buildWorkspaceSettingsAuditMetadata(normalizedSettings),
			useOrganizationSettings,
			repositoryId,
			organizationId,
		},
	});

	return toRepositorySettings(row ?? null);
}
