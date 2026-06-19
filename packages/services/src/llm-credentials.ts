import { createHash } from "node:crypto";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { decryptSecret, encryptSecret } from "@gitpal/auth";
import { db } from "@gitpal/db";
import * as aiSchema from "@gitpal/db/schema/ai";
import { env } from "@gitpal/env/server";
import {
	type ByokProviderKeyInput,
	type ByokRoutingSettings,
	byokProviderKeySchema,
	byokRoutingSettingsSchema,
	getLlmProviderDefinition,
	inferProviderIdFromModel,
	type LlmProviderDefinition,
	type LlmRouterId,
	llmProviderCatalog,
	maskSecret,
	matchesAllowedModels,
} from "@gitpal/utils";
import { createGateway, type LanguageModel } from "ai";
import { and, asc, desc, eq } from "drizzle-orm";
import { createOllama } from "ollama-ai-provider-v2";

type UserLlmApiKeyRow = typeof aiSchema.userLlmApiKey.$inferSelect;

export type StoredByokKeySummary = {
	id: string;
	providerId: string;
	providerLabel: string;
	name: string;
	keyPreview: string;
	enabled: boolean;
	priority: number;
	forceDirect: boolean;
	allowedModels: string[];
	baseUrl: string | null;
	lastValidatedAt: string | null;
	lastValidationStatus: string | null;
	lastValidationError: string | null;
	createdAt: string;
	updatedAt: string;
};

export type ModelRoutePreview = {
	mode: "direct" | "router";
	billedBy: "byok" | "wallet";
	label: string;
	providerId: string;
	providerLabel: string;
	routerId: LlmRouterId | null;
	usesFallback: boolean;
	keyId: string | null;
	keyName: string | null;
	baseUrl: string | null;
};

/**
 * Parses the model ID to extract an explicit router preference if specified,
 * and determines the correct clean model ID to send to the provider.
 */
export function parseModelIdRoute(modelId: string): {
	explicitRouterId: LlmRouterId | null;
	modelIdForRouter: string;
} {
	const trimmed = modelId.trim();
	const parts = trimmed.split("/");

	// Handles 3+ part model IDs like gateway/google/gemini-2.5-flash
	if (parts.length >= 3) {
		const first = parts[0]?.toLowerCase();
		if (first === "gateway") {
			return {
				explicitRouterId: "ai-gateway",
				modelIdForRouter: parts.slice(1).join("/"),
			};
		}
		if (first === "openrouter") {
			return {
				explicitRouterId: "openrouter",
				modelIdForRouter: parts.slice(1).join("/"),
			};
		}
		if (first === "ollama") {
			return {
				explicitRouterId: "ollama",
				modelIdForRouter: parts.slice(1).join("/"),
			};
		}
		if (first === "direct") {
			return {
				explicitRouterId: "direct",
				modelIdForRouter: parts.slice(1).join("/"),
			};
		}
	}

	// Handles 2 part model IDs starting with an aggregator prefix
	const lower = trimmed.toLowerCase();
	if (lower.startsWith("openrouter/")) {
		// OpenRouter requires the full "openrouter/free" slug
		return { explicitRouterId: "openrouter", modelIdForRouter: trimmed };
	}
	if (lower.startsWith("ollama/")) {
		// Ollama provider expects just the model name segment
		return {
			explicitRouterId: "ollama",
			modelIdForRouter: trimmed.slice("ollama/".length),
		};
	}

	return { explicitRouterId: null, modelIdForRouter: trimmed };
}

/**
 * FIX #3: Removed the internal parseModelIdRoute call — callers already pass
 * a pre-stripped modelIdForRouter, so re-parsing here caused a double-strip
 * and incorrect provider inference for some aggregator-prefixed model IDs.
 *
 * FIX #1: Added forcedOnly parameter so that keys marked forceDirect are
 * respected even when preferUserKeys is false in the user's routing settings.
 */
async function getMatchingDirectKey({
	userId,
	modelId,
	forcedOnly = false,
}: {
	userId: string;
	modelId: string;
	/** When true, only return keys that have forceDirect set. */
	forcedOnly?: boolean;
}) {
	const inferredProviderId = inferProviderIdFromModel(modelId);

	if (!inferredProviderId) {
		return null;
	}

	const rows = await db
		.select()
		.from(aiSchema.userLlmApiKey)
		.where(eq(aiSchema.userLlmApiKey.userId, userId))
		.orderBy(
			asc(aiSchema.userLlmApiKey.priority),
			desc(aiSchema.userLlmApiKey.updatedAt),
		);

	return (
		rows.find(
			(row) =>
				row.enabled &&
				(!forcedOnly || row.forceDirect) &&
				row.providerId === inferredProviderId &&
				matchesAllowedModels({
					allowedModels: row.allowedModels,
					modelId: modelId,
				}),
		) ?? null
	);
}

export async function previewModelRouteForUser({
	userId,
	modelId,
}: {
	userId: string;
	modelId: string;
}): Promise<ModelRoutePreview | null> {
	const { explicitRouterId, modelIdForRouter } = parseModelIdRoute(modelId);
	const settings = await getByokRoutingSettingsForUser(userId);

	// FIX #1: Two-phase direct key lookup.
	// Phase 1: Normal lookup when the user has preferUserKeys enabled and no
	//          explicit router channel was forced via a routing prefix.
	const shouldAttemptDirectKey =
		(explicitRouterId === "direct" || !explicitRouterId) &&
		settings.preferUserKeys;

	const directKey = shouldAttemptDirectKey
		? await getMatchingDirectKey({ userId, modelId: modelIdForRouter })
		: null;

	// Phase 2: Even when preferUserKeys is false, a key marked forceDirect must
	//          bypass the router. Do a second lookup restricted to those keys.
	const forcedDirectKey =
		!directKey && !shouldAttemptDirectKey
			? await getMatchingDirectKey({
					userId,
					modelId: modelIdForRouter,
					forcedOnly: true,
				})
			: null;

	const resolvedDirectKey = directKey ?? forcedDirectKey;

	if (resolvedDirectKey) {
		const provider = getLlmProviderDefinition(resolvedDirectKey.providerId);
		return {
			mode: "direct",
			billedBy: "byok",
			label: `Direct via ${provider?.label ?? resolvedDirectKey.providerId}`,
			providerId: resolvedDirectKey.providerId,
			providerLabel: provider?.label ?? resolvedDirectKey.providerId,
			routerId: null,
			usesFallback: false,
			keyId: resolvedDirectKey.id,
			keyName: resolvedDirectKey.name,
			baseUrl: resolvedDirectKey.baseUrl,
		};
	}

	// Honor explicit prefix routing, otherwise fallback to user routing configuration
	const routerIds = explicitRouterId
		? [explicitRouterId]
		: [settings.defaultRouter, settings.fallbackRouter].filter(
				(routerId): routerId is LlmRouterId => Boolean(routerId),
			);

	for (const [index, routerId] of routerIds.entries()) {
		if (routerId === "direct") continue;
		if (!getRouterAvailability(routerId)) {
			continue;
		}

		// FIX #8: Infer the real underlying provider from the model id rather than
		// hard-coding "openai" for the ai-gateway, which routes to many providers.
		const providerId =
			routerId === "openrouter"
				? "openrouter"
				: routerId === "ollama"
					? "ollama"
					: (inferProviderIdFromModel(modelIdForRouter) ?? "openai");
		const provider = getLlmProviderDefinition(providerId);

		return {
			mode: "router",
			billedBy: providerId === "ollama" ? "byok" : "wallet",
			label:
				routerId === "ai-gateway"
					? "Vercel AI Gateway"
					: (provider?.label ?? "OpenRouter"),
			providerId,
			providerLabel:
				routerId === "ai-gateway"
					? "Vercel AI Gateway"
					: (provider?.label ?? "OpenRouter"),
			routerId,
			usesFallback: !explicitRouterId && index > 0,
			keyId: null,
			keyName: null,
			baseUrl:
				routerId === "openrouter"
					? env.OPENROUTER_BASE_URL
					: routerId === "ollama"
						? env.OLLAMA_BASE_URL
						: null,
		};
	}

	return null;
}

export async function resolveLanguageModelForUser({
	userId,
	modelId,
}: {
	userId: string;
	modelId: string;
}) {
	const preview = await previewModelRouteForUser({
		userId,
		modelId,
	});

	if (!preview) {
		throw new Error("No usable model route is configured for this user.");
	}

	const { modelIdForRouter } = parseModelIdRoute(modelId);

	if (preview.mode === "router" && preview.routerId) {
		const model = createRouterModel({
			routerId: preview.routerId,
			modelId: modelIdForRouter,
		});

		if (!model) {
			throw new Error("Configured router is not available.");
		}

		return {
			model,
			preview,
		};
	}

	const directKey = await db
		.select()
		.from(aiSchema.userLlmApiKey)
		.where(eq(aiSchema.userLlmApiKey.id, preview.keyId ?? ""))
		.limit(1);
	const key = directKey[0] ?? null;

	if (!key) {
		throw new Error("Provider key could not be found.");
	}

	const provider = getLlmProviderDefinition(key.providerId);

	if (!provider) {
		throw new Error("Unsupported provider key.");
	}

	return {
		model: createDirectProviderModel({
			provider,
			modelId: modelIdForRouter,
			apiKey: decryptSecret(key.encryptedApiKey),
			baseUrl: key.baseUrl,
		}),
		preview,
	};
}

function stableId(parts: Array<string | number | boolean | null | undefined>) {
	return createHash("sha256")
		.update(parts.map((part) => String(part ?? "")).join(":"))
		.digest("hex");
}

function getRoutingSettingsId(userId: string) {
	return `llm_routing_${stableId([userId]).slice(0, 32)}`;
}

function getByokKeyId(userId: string, providerId: string, name: string) {
	return `llm_key_${stableId([userId, providerId, name]).slice(0, 32)}`;
}

function mapStoredKey(row: UserLlmApiKeyRow): StoredByokKeySummary {
	const provider = getLlmProviderDefinition(row.providerId);

	return {
		id: row.id,
		providerId: row.providerId,
		providerLabel: provider?.label ?? row.providerId,
		name: row.name,
		keyPreview: row.keyPreview,
		enabled: row.enabled,
		priority: row.priority,
		forceDirect: row.forceDirect,
		allowedModels: row.allowedModels,
		baseUrl: row.baseUrl,
		lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
		lastValidationStatus: row.lastValidationStatus,
		lastValidationError: row.lastValidationError,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

/**
 * FIX #5: Replaced `Boolean(env.OLLAMA_API_KEY) || true` with a meaningful
 * check. Ollama is local and doesn't use an API key; the correct signal for
 * "Ollama is configured" is whether a base URL has been set.
 */
function getRouterAvailability(routerId: LlmRouterId) {
	if (routerId === "ai-gateway") {
		return Boolean(env.AI_GATEWAY_API_KEY);
	}

	if (routerId === "openrouter") {
		return Boolean(env.OPENROUTER_API_KEY);
	}

	if (routerId === "ollama") {
		return Boolean(env.OLLAMA_BASE_URL);
	}

	return true;
}

function createRouterModel({
	routerId,
	modelId,
}: {
	routerId: LlmRouterId;
	modelId: string;
}): LanguageModel | null {
	if (routerId === "direct") {
		return null;
	}

	if (routerId === "ai-gateway") {
		if (!env.AI_GATEWAY_API_KEY) {
			return null;
		}

		return createGateway({
			apiKey: env.AI_GATEWAY_API_KEY,
		})(modelId);
	}

	if (routerId === "ollama") {
		const ollama = createOllama({
			baseURL: env.OLLAMA_BASE_URL,
			// TODO: Implement api key into headers in future
		});
		return ollama(modelId);
	}

	if (!env.OPENROUTER_API_KEY) {
		return null;
	}

	return createOpenAICompatible({
		name: "openrouter",
		apiKey: env.OPENROUTER_API_KEY,
		baseURL: env.OPENROUTER_BASE_URL,
	})(modelId);
}

function createDirectProviderModel({
	provider,
	modelId,
	apiKey,
	baseUrl,
}: {
	provider: LlmProviderDefinition;
	modelId: string;
	apiKey: string;
	baseUrl: string | null;
}): LanguageModel {
	if (provider.family === "anthropic") {
		return createAnthropic({
			apiKey,
			...(baseUrl ? { baseURL: baseUrl } : {}),
		})(modelId);
	}

	if (provider.family === "google") {
		return createGoogleGenerativeAI({
			apiKey,
			...(baseUrl ? { baseURL: baseUrl } : {}),
		})(modelId);
	}

	if (provider.family === "openai") {
		return createOpenAI({
			apiKey,
			...(baseUrl ? { baseURL: baseUrl } : {}),
		})(modelId);
	}

	const resolvedBaseUrl = baseUrl ?? provider.baseUrl;

	if (!resolvedBaseUrl) {
		throw new Error(`Provider ${provider.label} requires a base URL.`);
	}

	return createOpenAICompatible({
		name: provider.id,
		apiKey,
		baseURL: resolvedBaseUrl,
	})(modelId);
}

export async function getByokRoutingSettingsForUser(userId: string) {
	const [row] = await db
		.select()
		.from(aiSchema.userLlmRoutingSettings)
		.where(eq(aiSchema.userLlmRoutingSettings.userId, userId))
		.limit(1);

	return byokRoutingSettingsSchema.parse({
		defaultRouter: row?.defaultRouter,
		fallbackRouter: row?.fallbackRouter ?? null,
		preferUserKeys: row?.preferUserKeys,
	});
}

export async function saveByokRoutingSettingsForUser({
	userId,
	settings,
}: {
	userId: string;
	settings: ByokRoutingSettings;
}) {
	const validatedSettings = byokRoutingSettingsSchema.parse(settings);
	const now = new Date();
	const [row] = await db
		.insert(aiSchema.userLlmRoutingSettings)
		.values({
			id: getRoutingSettingsId(userId),
			userId,
			defaultRouter: validatedSettings.defaultRouter,
			fallbackRouter: validatedSettings.fallbackRouter,
			preferUserKeys: validatedSettings.preferUserKeys,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: aiSchema.userLlmRoutingSettings.userId,
			set: {
				defaultRouter: validatedSettings.defaultRouter,
				fallbackRouter: validatedSettings.fallbackRouter,
				preferUserKeys: validatedSettings.preferUserKeys,
				updatedAt: now,
			},
		})
		.returning();

	return byokRoutingSettingsSchema.parse({
		defaultRouter: row?.defaultRouter,
		fallbackRouter: row?.fallbackRouter ?? null,
		preferUserKeys: row?.preferUserKeys,
	});
}

export async function listByokKeysForUser(userId: string) {
	const rows = await db
		.select()
		.from(aiSchema.userLlmApiKey)
		.where(eq(aiSchema.userLlmApiKey.userId, userId))
		.orderBy(
			asc(aiSchema.userLlmApiKey.providerId),
			asc(aiSchema.userLlmApiKey.priority),
			desc(aiSchema.userLlmApiKey.createdAt),
		);

	return rows.map(mapStoredKey);
}

/**
 * FIX #4: baseUrl is now read from validated.baseUrl when explicitly supplied,
 * falling back to the catalog's static default. Previously this always wrote
 * provider.baseUrl, silently discarding any custom endpoint the user configured.
 */
export async function saveByokKeyForUser({
	userId,
	input,
}: {
	userId: string;
	input: ByokProviderKeyInput;
}) {
	const validated = byokProviderKeySchema.parse(input);
	const provider = getLlmProviderDefinition(validated.providerId);

	if (!provider) {
		throw new Error("Unsupported provider.");
	}

	const existing = validated.id
		? await db
				.select()
				.from(aiSchema.userLlmApiKey)
				.where(
					and(
						eq(aiSchema.userLlmApiKey.id, validated.id),
						eq(aiSchema.userLlmApiKey.userId, userId),
					),
				)
				.limit(1)
		: [];
	const currentRow = existing[0] ?? null;

	if (!validated.apiKey && !currentRow) {
		throw new Error("API key is required.");
	}

	// Resolve the base URL: prefer an explicitly supplied value, then the stored
	// value on an existing row, then the catalog default.
	const resolvedBaseUrl =
		validated.baseUrl !== undefined
			? validated.baseUrl
			: (currentRow?.baseUrl ?? provider.baseUrl);

	const now = new Date();
	const [row] = await db
		.insert(aiSchema.userLlmApiKey)
		.values({
			id:
				validated.id ??
				getByokKeyId(userId, validated.providerId, validated.name),
			userId,
			providerId: validated.providerId,
			name: validated.name,
			encryptedApiKey: validated.apiKey
				? encryptSecret(validated.apiKey)
				: (currentRow?.encryptedApiKey ?? ""),
			keyPreview: validated.apiKey
				? maskSecret(validated.apiKey)
				: (currentRow?.keyPreview ?? ""),
			enabled: validated.enabled,
			priority: validated.priority,
			forceDirect: validated.forceDirect,
			allowedModels: validated.allowedModels,
			baseUrl: resolvedBaseUrl,
			metadata: {},
			createdAt: currentRow?.createdAt ?? now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: aiSchema.userLlmApiKey.id,
			set: {
				providerId: validated.providerId,
				name: validated.name,
				encryptedApiKey: validated.apiKey
					? encryptSecret(validated.apiKey)
					: (currentRow?.encryptedApiKey ?? ""),
				keyPreview: validated.apiKey
					? maskSecret(validated.apiKey)
					: (currentRow?.keyPreview ?? ""),
				enabled: validated.enabled,
				priority: validated.priority,
				forceDirect: validated.forceDirect,
				allowedModels: validated.allowedModels,
				baseUrl: resolvedBaseUrl,
				updatedAt: now,
			},
		})
		.returning();

	if (!row || row.userId !== userId) {
		throw new Error("Unable to save provider key.");
	}

	return mapStoredKey(row);
}

export async function deleteByokKeyForUser({
	userId,
	keyId,
}: {
	userId: string;
	keyId: string;
}) {
	const [deleted] = await db
		.delete(aiSchema.userLlmApiKey)
		.where(
			and(
				eq(aiSchema.userLlmApiKey.id, keyId),
				eq(aiSchema.userLlmApiKey.userId, userId),
			),
		)
		.returning({
			id: aiSchema.userLlmApiKey.id,
			userId: aiSchema.userLlmApiKey.userId,
		});

	return deleted?.userId === userId ? deleted : null;
}

export function listAvailableByokProviders() {
	return [...llmProviderCatalog];
}
