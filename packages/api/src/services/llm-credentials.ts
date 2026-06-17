import { createHash } from "node:crypto";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createDb } from "@gitpal/db";
import * as aiSchema from "@gitpal/db/schema/ai";
import { decryptSecret, encryptSecret } from "@gitpal/auth";
import { env } from "@gitpal/env/server";
import {
  byokProviderKeySchema,
  byokRoutingSettingsSchema,
  getLlmProviderDefinition,
  inferProviderIdFromModel,
  llmProviderCatalog,
  maskSecret,
  matchesAllowedModels,
  type ByokProviderKeyInput,
  type ByokRoutingSettings,
  type LlmProviderDefinition,
  type LlmRouterId,
} from "@gitpal/utils";
import { createGateway, type LanguageModel } from "ai";
import { and, asc, desc, eq } from "drizzle-orm";
import { createOllama } from "ollama-ai-provider-v2";

const db = createDb();

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

function normalizeModelId(value: string) {
  const trimmed = value.trim();

  return trimmed.toLowerCase().startsWith("openrouter/")
    ? trimmed.slice("openrouter/".length)
    : trimmed.toLowerCase().startsWith("ollama/")
      ? trimmed.slice("ollama/".length)
      : trimmed;
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

function getRouterAvailability(routerId: LlmRouterId) {
  if (routerId === "ai-gateway") {
    return Boolean(env.AI_GATEWAY_API_KEY);
  }

  if (routerId === "openrouter") {
    return Boolean(env.OPENROUTER_API_KEY);
  }

  if (routerId === "ollama") {
    return Boolean(env.OLLAMA_API_KEY) || true;
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
      baseUrl: provider.baseUrl,
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
        baseUrl: provider.baseUrl,
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

async function getMatchingDirectKey({
  userId,
  modelId,
}: {
  userId: string;
  modelId: string;
}) {
  const normalizedModelId = normalizeModelId(modelId);
  const inferredProviderId = inferProviderIdFromModel(normalizedModelId);

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
        row.providerId === inferredProviderId &&
        matchesAllowedModels({
          allowedModels: row.allowedModels,
          modelId: normalizedModelId,
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
  const normalizedModelId = normalizeModelId(modelId);
  const settings = await getByokRoutingSettingsForUser(userId);
  const directKey = settings.preferUserKeys
    ? await getMatchingDirectKey({ userId, modelId: normalizedModelId })
    : null;

  if (directKey) {
    const provider = getLlmProviderDefinition(directKey.providerId);
    return {
      mode: "direct",
      billedBy: "byok",
      label: `Direct via ${provider?.label ?? directKey.providerId}`,
      providerId: directKey.providerId,
      providerLabel: provider?.label ?? directKey.providerId,
      routerId: null,
      usesFallback: false,
      keyId: directKey.id,
      keyName: directKey.name,
      baseUrl: directKey.baseUrl,
    };
  }

  const routerIds = [settings.defaultRouter, settings.fallbackRouter].filter(
    (routerId): routerId is LlmRouterId => Boolean(routerId),
  );

  for (const [index, routerId] of routerIds.entries()) {
    if (!getRouterAvailability(routerId)) {
      continue;
    }

    const providerId =
      routerId === "openrouter"
        ? "openrouter"
        : routerId === "ollama"
          ? "ollama"
          : "openai";
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
      usesFallback: index > 0,
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

  if (preview.mode === "router" && preview.routerId) {
    const model = createRouterModel({
      routerId: preview.routerId,
      modelId: normalizeModelId(modelId),
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
      modelId: normalizeModelId(modelId),
      apiKey: decryptSecret(key.encryptedApiKey),
      baseUrl: key.baseUrl,
    }),
    preview,
  };
}

export function listAvailableByokProviders() {
  return [...llmProviderCatalog];
}
