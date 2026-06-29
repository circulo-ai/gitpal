import { auth } from "@gitpal/auth";
import { type ApiKey, repositories } from "@gitpal/repositories";
import { recordAdminActionEvent } from "./observability";

type ApiKeyRow = ApiKey;
type ApiKeyLike = Pick<
	ApiKeyRow,
	| "id"
	| "name"
	| "start"
	| "prefix"
	| "enabled"
	| "requestCount"
	| "remaining"
	| "rateLimitEnabled"
	| "rateLimitTimeWindow"
	| "rateLimitMax"
	| "lastRequest"
	| "expiresAt"
	| "createdAt"
	| "updatedAt"
> & {
	metadata: string | Record<string, unknown> | null;
	permissions: string | Record<string, string[]> | null;
};

export type AppApiKeySummary = {
	id: string;
	name: string | null;
	start: string | null;
	prefix: string | null;
	enabled: boolean;
	requestCount: number;
	remaining: number | null;
	rateLimitEnabled: boolean;
	rateLimitTimeWindow: number | null;
	rateLimitMax: number | null;
	lastRequest: string | null;
	expiresAt: string | null;
	createdAt: string;
	updatedAt: string;
	metadata: Record<string, unknown> | null;
	permissions: Record<string, string[]> | null;
};

function parseJsonRecord<T extends Record<string, unknown>>(
	value: string | Record<string, unknown> | null,
): T | null {
	if (!value) {
		return null;
	}

	if (typeof value === "object") {
		return value as T;
	}

	try {
		const parsed = JSON.parse(value) as unknown;
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as T)
			: null;
	} catch {
		return null;
	}
}

function parsePermissions(value: string | Record<string, string[]> | null) {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return value as Record<string, string[]>;
	}

	const parsed = parseJsonRecord<Record<string, unknown>>(value);

	if (!parsed) {
		return null;
	}

	const permissions = Object.entries(parsed).reduce<Record<string, string[]>>(
		(result, [key, candidate]) => {
			if (
				Array.isArray(candidate) &&
				candidate.every((item) => typeof item === "string")
			) {
				result[key] = candidate;
			}

			return result;
		},
		{},
	);

	return Object.keys(permissions).length > 0 ? permissions : null;
}

function mapApiKey(row: ApiKeyLike): AppApiKeySummary {
	return {
		id: row.id,
		name: row.name,
		start: row.start,
		prefix: row.prefix,
		enabled: row.enabled,
		requestCount: row.requestCount,
		remaining: row.remaining,
		rateLimitEnabled: row.rateLimitEnabled,
		rateLimitTimeWindow: row.rateLimitTimeWindow,
		rateLimitMax: row.rateLimitMax,
		lastRequest: row.lastRequest?.toISOString() ?? null,
		expiresAt: row.expiresAt?.toISOString() ?? null,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		metadata: parseJsonRecord(row.metadata),
		permissions: parsePermissions(row.permissions),
	};
}

export async function listAppApiKeysForUser(userId: string) {
	const rows = await repositories.apiKey.listByReferenceId(userId);

	return rows.map(mapApiKey);
}

export async function createAppApiKeyForUser({
	userId,
	name,
	expiresInSeconds,
}: {
	userId: string;
	name: string;
	expiresInSeconds?: number | null;
}) {
	const created = await auth.api.createApiKey({
		body: {
			userId,
			name,
			expiresIn: expiresInSeconds ?? null,
		},
	});

	await recordAdminActionEvent({
		userId,
		action: "create-api-key",
		status: "created",
		title: "API key created",
		body: `${created.name} is now active.`,
		sourceType: "app-api-key",
		sourceId: created.id,
		metadata: {
			name: created.name,
			prefix: created.prefix,
			enabled: created.enabled,
			expiresAt: created.expiresAt?.toISOString() ?? null,
		},
	});

	return {
		...mapApiKey(created),
		key: created.key,
	};
}

export async function updateAppApiKeyForUser({
	userId,
	keyId,
	name,
	enabled,
}: {
	userId: string;
	keyId: string;
	name?: string;
	enabled?: boolean;
}) {
	const ownedKey = await repositories.apiKey.findByIdAndReferenceId(
		keyId,
		userId,
	);
	if (!ownedKey) {
		throw new Error("API key was not found.");
	}

	const updated = await auth.api.updateApiKey({
		body: {
			userId,
			keyId,
			...(name !== undefined ? { name } : {}),
			...(enabled !== undefined ? { enabled } : {}),
		},
	});

	await recordAdminActionEvent({
		userId,
		action: "update-api-key",
		status: enabled === false ? "disabled" : "updated",
		title: enabled === false ? "API key disabled" : "API key updated",
		body: enabled === false
			? `${updated.name} is no longer active.`
			: `${updated.name} was updated.`,
		sourceType: "app-api-key",
		sourceId: updated.id,
		severity: enabled === false ? "warning" : "success",
		metadata: {
			name: updated.name,
			prefix: updated.prefix,
			enabled: updated.enabled,
			expiresAt: updated.expiresAt?.toISOString() ?? null,
		},
	});

	return mapApiKey(updated);
}

export async function deleteAppApiKeyForUser({
	userId,
	keyId,
}: {
	userId: string;
	keyId: string;
}) {
	const ownedKey = await repositories.apiKey.findByIdAndReferenceId(keyId, userId);
	if (!ownedKey) {
		return null;
	}
	const deleted = await repositories.apiKey.deleteByIdAndReferenceId(
		keyId,
		userId,
	);

	if (deleted) {
		await recordAdminActionEvent({
			userId,
			action: "delete-api-key",
			status: "deleted",
			title: "API key deleted",
			body: `${ownedKey.name} was removed.`,
			sourceType: "app-api-key",
			sourceId: keyId,
			severity: "warning",
			metadata: {
				name: ownedKey.name,
				prefix: ownedKey.prefix,
				enabled: ownedKey.enabled,
				expiresAt: ownedKey.expiresAt?.toISOString() ?? null,
			},
		});
	}

	return deleted ? { id: keyId } : null;
}
