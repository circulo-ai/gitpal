import { randomUUID } from "node:crypto";
import { createGateway } from "ai";
import { createDb } from "@gitpal/db";
import * as aiSchema from "@gitpal/db/schema/ai";
import { env } from "@gitpal/env/server";
import {
  getLlmProviderDefinition,
  inferProviderIdFromModel,
} from "@gitpal/utils";
import { eq } from "drizzle-orm";

import { applyWalletUsageDebitInTransaction } from "./wallet";
import type { ModelRoutePreview } from "./llm-credentials";

const db = createDb();
type AiBillingDbExecutor = Pick<typeof db, "select" | "insert" | "update">;
const aiGateway = env.AI_GATEWAY_API_KEY
  ? createGateway({ apiKey: env.AI_GATEWAY_API_KEY })
  : null;

export type AiCallKind = "review" | "walkthrough" | "fun" | "labeler";

export type AiCallUsage = {
  inputTokens: number;
  inputNoCacheTokens: number;
  inputCacheReadTokens: number;
  inputCacheWriteTokens: number;
  outputTokens: number;
  outputTextTokens: number;
  outputReasoningTokens: number;
  totalTokens: number;
};

export type AiBillingSettlement = {
  generationId: string;
  actualCostCents: number | null;
  walletDebitCents: number;
  walletBalanceAfterCents: number | null;
  providerGenerationId: string | null;
  usage: AiCallUsage;
};

export type TrackAiGenerationInput<TResult> = {
  userId: string;
  callKind: AiCallKind;
  modelId: string;
  routePreview: ModelRoutePreview;
  repositoryId?: string | null;
  pullRequestId?: string | null;
  reviewRunId?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
  execute: (input: {
    generationId: string;
    providerOptions?: Record<string, Record<string, unknown>>;
  }) => Promise<TResult>;
};

export type TrackAiGenerationResult<TResult> = {
  result: TResult;
  settlement: AiBillingSettlement;
};

function stableValues(values: Array<string | null | undefined>) {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

function toRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toUsage(value: unknown): AiCallUsage {
  const usage = toRecord(value);
  const inputTokenDetails = toRecord(usage?.inputTokenDetails);
  const outputTokenDetails = toRecord(usage?.outputTokenDetails);

  return {
    inputTokens: toNumber(usage?.inputTokens) ?? 0,
    inputNoCacheTokens: toNumber(inputTokenDetails?.noCacheTokens) ?? 0,
    inputCacheReadTokens: toNumber(inputTokenDetails?.cacheReadTokens) ?? 0,
    inputCacheWriteTokens: toNumber(inputTokenDetails?.cacheWriteTokens) ?? 0,
    outputTokens: toNumber(usage?.outputTokens) ?? 0,
    outputTextTokens: toNumber(outputTokenDetails?.textTokens) ?? 0,
    outputReasoningTokens:
      toNumber(outputTokenDetails?.reasoningTokens) ??
      toNumber(
        (usage as { reasoningTokens?: unknown } | null)?.reasoningTokens,
      ) ??
      0,
    totalTokens: toNumber(usage?.totalTokens) ?? 0,
  };
}

function serializeUsage(usage: AiCallUsage) {
  return {
    inputTokens: usage.inputTokens,
    inputNoCacheTokens: usage.inputNoCacheTokens,
    inputCacheReadTokens: usage.inputCacheReadTokens,
    inputCacheWriteTokens: usage.inputCacheWriteTokens,
    outputTokens: usage.outputTokens,
    outputTextTokens: usage.outputTextTokens,
    outputReasoningTokens: usage.outputReasoningTokens,
    totalTokens: usage.totalTokens,
  };
}

function usdToCents(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.max(1, Math.round(value * 100));
}

function getModelProviderId(modelId: string, routePreview: ModelRoutePreview) {
  return inferProviderIdFromModel(modelId) ?? routePreview.providerId;
}

function getProviderLabel(providerId: string) {
  return getLlmProviderDefinition(providerId)?.label ?? providerId;
}

function buildProviderOptions({
  userId,
  routePreview,
  tags,
}: {
  userId: string;
  routePreview: ModelRoutePreview;
  tags: string[];
}) {
  if (routePreview.routerId !== "ai-gateway") {
    return undefined;
  }

  return {
    gateway: {
      user: userId,
      tags: stableValues(tags),
    },
  };
}

function extractGenerationId(
  result: {
    providerMetadata?: unknown;
    response?: {
      headers?: Headers | { get?: (name: string) => string | null };
    };
  },
  routePreview: ModelRoutePreview,
) {
  const providerMetadata = toRecord(result.providerMetadata);

  if (routePreview.routerId === "ai-gateway") {
    const gatewayMetadata = toRecord(providerMetadata?.gateway);
    const generationId = gatewayMetadata?.generationId;

    return typeof generationId === "string" && generationId.trim()
      ? generationId
      : null;
  }

  if (routePreview.routerId === "openrouter") {
    const openRouterMetadata = toRecord(providerMetadata?.openrouter);
    const generationId = openRouterMetadata?.generationId;

    if (typeof generationId === "string" && generationId.trim()) {
      return generationId;
    }

    const headers = result.response?.headers;
    const headerCandidates = ["x-generation-id", "x-openrouter-generation-id"];

    for (const headerName of headerCandidates) {
      if (headers instanceof Headers) {
        const value = headers.get(headerName);
        if (value?.trim()) {
          return value;
        }
      } else if (typeof headers?.get === "function") {
        const value = headers.get(headerName);
        if (value?.trim()) {
          return value;
        }
      }
    }
  }

  return null;
}

async function fetchOpenRouterGenerationCostCents(generationId: string) {
  if (!env.OPENROUTER_API_KEY) {
    return null;
  }

  const response = await fetch(
    `${env.OPENROUTER_BASE_URL}/generation?id=${encodeURIComponent(generationId)}`,
    {
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      },
    },
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const data = toRecord(payload.data) ?? payload;
  const totalCost =
    toNumber(data?.total_cost) ??
    toNumber(data?.totalCost) ??
    toNumber(payload.total_cost) ??
    toNumber(payload.totalCost);

  return totalCost !== null ? usdToCents(totalCost) : null;
}

function buildGenerationMetadata({
  callKind,
  modelId,
  routePreview,
  tags,
  usage,
  actualCostCents,
  providerGenerationId,
}: {
  callKind: AiCallKind;
  modelId: string;
  routePreview: ModelRoutePreview;
  tags: string[];
  usage: AiCallUsage;
  actualCostCents: number | null;
  providerGenerationId: string | null;
}) {
  const providerId = getModelProviderId(modelId, routePreview);

  return {
    callKind,
    modelId,
    route: {
      id: routePreview.routerId ?? "direct",
      label: routePreview.label,
      mode: routePreview.mode,
      billedBy: routePreview.billedBy,
    },
    provider: {
      id: providerId,
      label: getProviderLabel(providerId),
    },
    tags,
    usage: serializeUsage(usage),
    actualCostCents,
    providerGenerationId,
  };
}

async function resolveActualCostCents({
  result,
  routePreview,
  providerGenerationId,
}: {
  result: {
    providerMetadata?: unknown;
  };
  routePreview: ModelRoutePreview;
  providerGenerationId: string | null;
}) {
  if (routePreview.routerId === "ai-gateway") {
    if (!aiGateway || !providerGenerationId) {
      return null;
    }

    const generationInfo = await aiGateway.getGenerationInfo({
      id: providerGenerationId,
    });
    return usdToCents(generationInfo.totalCost);
  }

  if (routePreview.routerId === "openrouter") {
    const providerMetadata = toRecord(result.providerMetadata);
    const openRouterMetadata = toRecord(providerMetadata?.openrouter);
    const directCost =
      toNumber(openRouterMetadata?.cost) ??
      toNumber(openRouterMetadata?.totalCost) ??
      toNumber(openRouterMetadata?.total_cost);

    if (directCost !== null) {
      return usdToCents(directCost);
    }

    if (!providerGenerationId) {
      return null;
    }

    return fetchOpenRouterGenerationCostCents(providerGenerationId);
  }

  if (routePreview.routerId === "ollama") {
    return 0;
  }

  return null;
}

async function insertGenerationRow({
  generationId,
  userId,
  callKind,
  modelId,
  routePreview,
  repositoryId,
  pullRequestId,
  reviewRunId,
  tags,
  metadata,
}: {
  userId: string;
  callKind: AiCallKind;
  modelId: string;
  routePreview: ModelRoutePreview;
  repositoryId?: string | null;
  pullRequestId?: string | null;
  reviewRunId?: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  generationId: string;
}) {
  const now = new Date();
  const providerId = getModelProviderId(modelId, routePreview);

  await db.insert(aiSchema.aiGeneration).values({
    id: generationId,
    userId,
    repositoryId: repositoryId ?? null,
    pullRequestId: pullRequestId ?? null,
    reviewRunId: reviewRunId ?? null,
    callKind,
    billingMode: routePreview.billedBy,
    routeId: routePreview.routerId ?? "direct",
    routeLabel: routePreview.label,
    modelId,
    providerId,
    providerLabel: getProviderLabel(providerId),
    status: "pending",
    inputTokens: 0,
    inputNoCacheTokens: 0,
    inputCacheReadTokens: 0,
    inputCacheWriteTokens: 0,
    outputTokens: 0,
    outputTextTokens: 0,
    outputReasoningTokens: 0,
    totalTokens: 0,
    walletDebitCents: 0,
    providerMetadata: {},
    metadata: {
      ...metadata,
      ...buildGenerationMetadata({
        callKind,
        modelId,
        routePreview,
        tags,
        usage: {
          inputTokens: 0,
          inputNoCacheTokens: 0,
          inputCacheReadTokens: 0,
          inputCacheWriteTokens: 0,
          outputTokens: 0,
          outputTextTokens: 0,
          outputReasoningTokens: 0,
          totalTokens: 0,
        },
        actualCostCents: null,
        providerGenerationId: null,
      }),
    },
    startedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

async function completeGenerationRow({
  executor = db,
  generationId,
  callKind,
  modelId,
  routePreview,
  tags,
  usage,
  actualCostCents,
  providerGenerationId,
  walletDebitCents,
  walletBalanceAfterCents,
  providerMetadata,
  metadata,
}: {
  executor?: AiBillingDbExecutor;
  generationId: string;
  callKind: AiCallKind;
  modelId: string;
  routePreview: ModelRoutePreview;
  tags: string[];
  usage: AiCallUsage;
  actualCostCents: number | null;
  providerGenerationId: string | null;
  walletDebitCents: number;
  walletBalanceAfterCents: number | null;
  providerMetadata: unknown;
  metadata: Record<string, unknown>;
}) {
  const now = new Date();

  await executor
    .update(aiSchema.aiGeneration)
    .set({
      status: "succeeded",
      inputTokens: usage.inputTokens,
      inputNoCacheTokens: usage.inputNoCacheTokens,
      inputCacheReadTokens: usage.inputCacheReadTokens,
      inputCacheWriteTokens: usage.inputCacheWriteTokens,
      outputTokens: usage.outputTokens,
      outputTextTokens: usage.outputTextTokens,
      outputReasoningTokens: usage.outputReasoningTokens,
      totalTokens: usage.totalTokens,
      actualCostCents,
      walletDebitCents,
      walletBalanceAfterCents,
      providerGenerationId,
      providerMetadata: providerMetadata
        ? (providerMetadata as Record<string, unknown>)
        : {},
      metadata: {
        ...metadata,
        ...buildGenerationMetadata({
          callKind,
          modelId,
          routePreview,
          tags,
          usage,
          actualCostCents,
          providerGenerationId,
        }),
      },
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(aiSchema.aiGeneration.id, generationId));
}

async function failGenerationRow({
  executor = db,
  generationId,
  errorMessage,
  callKind,
  modelId,
  routePreview,
  tags,
  usage,
  actualCostCents,
  providerGenerationId,
  walletDebitCents,
  walletBalanceAfterCents,
  providerMetadata,
  metadata,
}: {
  executor?: AiBillingDbExecutor;
  generationId: string;
  errorMessage: string;
  callKind?: AiCallKind;
  modelId?: string;
  routePreview?: ModelRoutePreview;
  tags?: string[];
  usage?: AiCallUsage;
  actualCostCents?: number | null;
  providerGenerationId?: string | null;
  walletDebitCents?: number;
  walletBalanceAfterCents?: number | null;
  providerMetadata?: unknown;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date();
  const generationMetadata =
    callKind && modelId && routePreview && tags && usage
      ? buildGenerationMetadata({
          callKind,
          modelId,
          routePreview,
          tags,
          usage,
          actualCostCents: actualCostCents ?? null,
          providerGenerationId: providerGenerationId ?? null,
        })
      : null;

  await executor
    .update(aiSchema.aiGeneration)
    .set({
      status: "failed",
      errorMessage,
      ...(usage
        ? {
            inputTokens: usage.inputTokens,
            inputNoCacheTokens: usage.inputNoCacheTokens,
            inputCacheReadTokens: usage.inputCacheReadTokens,
            inputCacheWriteTokens: usage.inputCacheWriteTokens,
            outputTokens: usage.outputTokens,
            outputTextTokens: usage.outputTextTokens,
            outputReasoningTokens: usage.outputReasoningTokens,
            totalTokens: usage.totalTokens,
          }
        : {}),
      ...(actualCostCents !== undefined
        ? { actualCostCents: actualCostCents ?? null }
        : {}),
      ...(walletDebitCents !== undefined ? { walletDebitCents } : {}),
      ...(walletBalanceAfterCents !== undefined
        ? { walletBalanceAfterCents: walletBalanceAfterCents ?? null }
        : {}),
      ...(providerGenerationId !== undefined
        ? { providerGenerationId: providerGenerationId ?? null }
        : {}),
      providerMetadata:
        providerMetadata && typeof providerMetadata === "object"
          ? (providerMetadata as Record<string, unknown>)
          : {},
      ...(generationMetadata
        ? {
            metadata: metadata
              ? {
                  ...metadata,
                  ...generationMetadata,
                }
              : generationMetadata,
          }
        : metadata
          ? {
              metadata,
            }
          : {}),
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(aiSchema.aiGeneration.id, generationId));
}

export function buildAiProviderOptions({
  userId,
  routePreview,
  tags = [],
}: {
  userId: string;
  routePreview: ModelRoutePreview;
  tags?: string[];
}) {
  return buildProviderOptions({
    userId,
    routePreview,
    tags,
  });
}

export async function runTrackedAiGeneration<TResult>({
  userId,
  callKind,
  modelId,
  routePreview,
  repositoryId = null,
  pullRequestId = null,
  reviewRunId = null,
  tags = [],
  metadata = {},
  execute,
}: TrackAiGenerationInput<TResult>): Promise<TrackAiGenerationResult<TResult>> {
  const generationId = `ai_gen_${randomUUID()}`;
  let usage: AiCallUsage = {
    inputTokens: 0,
    inputNoCacheTokens: 0,
    inputCacheReadTokens: 0,
    inputCacheWriteTokens: 0,
    outputTokens: 0,
    outputTextTokens: 0,
    outputReasoningTokens: 0,
    totalTokens: 0,
  };
  let providerMetadata: unknown = {};
  let providerGenerationId: string | null = null;
  let actualCostCents: number | null = null;
  let walletDebitCents = 0;
  let walletBalanceAfterCents: number | null = null;

  await insertGenerationRow({
    generationId,
    userId,
    callKind,
    modelId,
    routePreview,
    repositoryId,
    pullRequestId,
    reviewRunId,
    tags,
    metadata,
  });

  try {
    const result = await execute({
      generationId,
      providerOptions: buildAiProviderOptions({
        userId,
        routePreview,
        tags,
      }),
    });

    usage = toUsage(
      (result as { totalUsage?: unknown; usage?: unknown }).totalUsage ??
        (result as { totalUsage?: unknown; usage?: unknown }).usage,
    );
    providerMetadata = (result as { providerMetadata?: unknown })
      .providerMetadata;
    providerGenerationId = extractGenerationId(
      {
        providerMetadata,
        response: (result as { response?: unknown }).response as
          | {
              headers?: Headers | { get?: (name: string) => string | null };
            }
          | undefined,
      },
      routePreview,
    );
    actualCostCents = await resolveActualCostCents({
      result: {
        providerMetadata,
      },
      routePreview,
      providerGenerationId,
    });
    walletDebitCents =
      routePreview.billedBy === "wallet" ? (actualCostCents ?? 0) : 0;
    const settledWalletBalance = await db.transaction(async (tx) => {
      let settledWalletBalanceAfterCents: number | null = null;

      if (routePreview.billedBy === "wallet") {
        if (actualCostCents === null) {
          throw new Error(
            "Unable to resolve a billable cost for this AI generation.",
          );
        }

        const walletDebit = await applyWalletUsageDebitInTransaction(tx, {
          userId,
          amountCents: actualCostCents,
          description: `${callKind} AI generation via ${routePreview.label}`,
          sourceId: generationId,
          sourceType: "ai-generation",
          metadata: {
            callKind,
            modelId,
            routeId: routePreview.routerId ?? "direct",
            routeLabel: routePreview.label,
            actualCostCents,
            providerGenerationId,
          },
        });
        settledWalletBalanceAfterCents = walletDebit.balanceAfterCents;
      }

      await completeGenerationRow({
        executor: tx,
        generationId,
        callKind,
        modelId,
        routePreview,
        tags,
        usage,
        actualCostCents,
        providerGenerationId,
        walletDebitCents,
        walletBalanceAfterCents: settledWalletBalanceAfterCents,
        providerMetadata,
        metadata: {
          ...metadata,
          tags,
          callKind,
          modelId,
          routeId: routePreview.routerId ?? "direct",
          routeLabel: routePreview.label,
          routeMode: routePreview.mode,
          billedBy: routePreview.billedBy,
        },
      });

      return {
        walletBalanceAfterCents: settledWalletBalanceAfterCents,
      };
    });
    walletBalanceAfterCents = settledWalletBalance.walletBalanceAfterCents;

    return {
      result,
      settlement: {
        generationId,
        actualCostCents,
        walletDebitCents,
        walletBalanceAfterCents,
        providerGenerationId,
        usage,
      },
    };
  } catch (error) {
    await failGenerationRow({
      generationId,
      errorMessage:
        error instanceof Error ? error.message : "ai_generation_failed",
      callKind,
      modelId,
      routePreview,
      tags,
      usage: usage ?? undefined,
      actualCostCents,
      providerGenerationId,
      walletDebitCents,
      walletBalanceAfterCents,
      providerMetadata,
      metadata: {
        ...metadata,
        tags,
        callKind,
        modelId,
        routeId: routePreview.routerId ?? "direct",
        routeLabel: routePreview.label,
        routeMode: routePreview.mode,
        billedBy: routePreview.billedBy,
      },
    });
    throw error;
  }
}
