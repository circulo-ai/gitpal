import { type RepositorySettings, repositories } from "@gitpal/repositories";
import {
	createDefaultRepositorySettings,
	createDefaultWorkspaceSettings,
	normalizeWorkspaceSettings,
	type RepositorySettingsRecord,
	resolveEffectiveWorkspaceSettings,
	type WorkspaceSettings,
	workspaceSettingsSchema,
} from "@gitpal/utils";
import { stableId } from "./stable-id";

type RepositorySettingsRow = RepositorySettings;

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

export async function getOrganizationWorkspaceSettings(organizationId: string) {
	const row =
		await repositories.organizationSettings.findByOrganizationId(
			organizationId,
		);

	return toWorkspaceSettings(row?.settings as WorkspaceSettings);
}

export async function saveOrganizationWorkspaceSettings({
	organizationId,
	settings,
}: {
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

	const organizationSettings = toWorkspaceSettings(
		organizationSettingsRow?.settings as WorkspaceSettings,
	);
	const repositorySettings = toRepositorySettings(repositorySettingsRow);

	return {
		repository: accessRow.repository,
		useOrganizationSettings: repositorySettings.useOrganizationSettings,
		organizationSettings,
		repositorySettings: repositorySettings.settings,
		effectiveSettings: resolveEffectiveWorkspaceSettings({
			organizationSettings,
			repositorySettings: repositorySettings.settings,
			useOrganizationSettings: repositorySettings.useOrganizationSettings,
		}),
	};
}

export async function saveRepositoryWorkspaceSettings({
	organizationId,
	repositoryId,
	useOrganizationSettings,
	settings,
}: {
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

	return toRepositorySettings(row ?? null);
}
