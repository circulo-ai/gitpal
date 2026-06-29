import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import {
	mergeWorkspaceSettings,
	normalizeWorkspaceSettings,
	resolveEffectiveWorkspaceSettings,
	type WorkspaceSettings,
} from "./repository-settings";

const GITPAL_CONFIG_FILE_NAMES = [".gitpal.yaml", ".gitpal.yml"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractGitPalConfigSettings(value: unknown) {
	if (!isPlainObject(value)) {
		return null;
	}

	if (isPlainObject(value.settings)) {
		return value.settings;
	}

	const { version: _version, settings: _settings, ...rest } = value;

	return rest;
}

export const gitpalConfigFileNames = [...GITPAL_CONFIG_FILE_NAMES] as const;

export function isGitPalConfigFileName(
	fileName: string,
): fileName is (typeof GITPAL_CONFIG_FILE_NAMES)[number] {
	return GITPAL_CONFIG_FILE_NAMES.includes(fileName as never);
}

export function parseGitPalConfig(content: string): WorkspaceSettings | null {
	try {
		const parsed = parseYaml(content);
		const settings = extractGitPalConfigSettings(parsed);

		if (!settings) {
			return null;
		}

		return normalizeWorkspaceSettings(settings);
	} catch {
		return null;
	}
}

export function serializeGitPalConfig(settings: Partial<WorkspaceSettings>) {
	return stringifyYaml({
		version: 1,
		settings,
	});
}

export function resolveGitPalConfigWorkspaceSettings({
	organizationSettings,
	repositorySettings,
	useOrganizationSettings,
	centralConfigSettings,
	configSettings,
}: {
	organizationSettings?: WorkspaceSettings | null;
	repositorySettings?: WorkspaceSettings | null;
	useOrganizationSettings: boolean;
	centralConfigSettings?: WorkspaceSettings | null;
	configSettings?: WorkspaceSettings | null;
}) {
	let effectiveSettings = resolveEffectiveWorkspaceSettings({
		organizationSettings,
		repositorySettings,
		useOrganizationSettings,
	});

	if (centralConfigSettings) {
		effectiveSettings = mergeWorkspaceSettings(
			effectiveSettings,
			centralConfigSettings,
		);
	}

	if (!configSettings) {
		return effectiveSettings;
	}

	return mergeWorkspaceSettings(effectiveSettings, configSettings);
}
