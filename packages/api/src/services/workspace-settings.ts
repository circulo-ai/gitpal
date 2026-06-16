import { createHash } from "node:crypto";
import { createDb } from "@gitpal/db";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import {
	createDefaultRepositorySettings,
	createDefaultWorkspaceSettings,
	normalizeWorkspaceSettings,
	resolveEffectiveWorkspaceSettings,
	type RepositorySettingsRecord,
	type WorkspaceSettings,
	workspaceSettingsSchema,
} from "@gitpal/utils";
import { and, eq } from "drizzle-orm";

const db = createDb();

type RepositorySettingsRow =
	typeof dashboardSchema.repositorySettings.$inferSelect;

function stableId(parts: Array<string | number | boolean | null | undefined>) {
	return createHash("sha256")
		.update(parts.map((part) => String(part ?? "")).join(":"))
		.digest("hex");
}

function getOrganizationSettingsId(organizationId: string) {
	return `org_settings_${stableId([organizationId]).slice(0, 32)}`;
}

function getRepositorySettingsId(organizationId: string, repositoryId: string) {
	return `repo_settings_${stableId([organizationId, repositoryId]).slice(0, 32)}`;
}

function toWorkspaceSettings(
	value: WorkspaceSettings | Record<string, unknown> | null | undefined,
) {
	return normalizeWorkspaceSettings(
		value ?? createDefaultWorkspaceSettings(),
	);
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

export async function getOrganizationWorkspaceSettings(
	organizationId: string,
) {
	const [row] = await db
		.select()
		.from(dashboardSchema.organizationSettings)
		.where(eq(dashboardSchema.organizationSettings.organizationId, organizationId))
		.limit(1);

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
	const [row] = await db
		.insert(dashboardSchema.organizationSettings)
		.values({
			id: getOrganizationSettingsId(organizationId),
			organizationId,
			settings: normalizedSettings,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: dashboardSchema.organizationSettings.organizationId,
			set: {
				settings: normalizedSettings,
				updatedAt: now,
			},
		})
		.returning();

	return toWorkspaceSettings(row?.settings as WorkspaceSettings);
}

async function getRepositorySettingsRow({
	organizationId,
	repositoryId,
}: {
	organizationId: string;
	repositoryId: string;
}) {
	const [row] = await db
		.select()
		.from(dashboardSchema.repositorySettings)
		.where(
			and(
				eq(dashboardSchema.repositorySettings.organizationId, organizationId),
				eq(dashboardSchema.repositorySettings.repositoryId, repositoryId),
			),
		)
		.limit(1);

	return row ?? null;
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

	const [accessRow] = await db
		.select({
			access: dashboardSchema.repositoryAccess,
			repository: dashboardSchema.repository,
		})
		.from(dashboardSchema.repositoryAccess)
		.innerJoin(
			dashboardSchema.repository,
			eq(
				dashboardSchema.repositoryAccess.repositoryId,
				dashboardSchema.repository.id,
			),
		)
		.where(
			and(
				eq(dashboardSchema.repositoryAccess.userId, userId),
				eq(dashboardSchema.repositoryAccess.repositoryId, repositoryId),
				eq(dashboardSchema.repository.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!accessRow) {
		return null;
	}

	const [organizationSettingsRow, repositorySettingsRow] = await Promise.all([
		db
			.select()
			.from(dashboardSchema.organizationSettings)
			.where(
				eq(
					dashboardSchema.organizationSettings.organizationId,
					organizationId,
				),
			)
			.limit(1),
		getRepositorySettingsRow({ organizationId, repositoryId }),
	]);

	const organizationSettings = toWorkspaceSettings(
		organizationSettingsRow[0]?.settings as WorkspaceSettings,
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
	const validatedSettings = workspaceSettingsSchema.parse(settings);
	const normalizedSettings = normalizeWorkspaceSettings(validatedSettings);
	const now = new Date();
	const [row] = await db
		.insert(dashboardSchema.repositorySettings)
		.values({
			id: getRepositorySettingsId(organizationId, repositoryId),
			organizationId,
			repositoryId,
			useOrganizationSettings,
			settings: normalizedSettings,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [
				dashboardSchema.repositorySettings.organizationId,
				dashboardSchema.repositorySettings.repositoryId,
			],
			set: {
				useOrganizationSettings,
				settings: normalizedSettings,
				updatedAt: now,
			},
		})
		.returning();

	return toRepositorySettings(row ?? null);
}
