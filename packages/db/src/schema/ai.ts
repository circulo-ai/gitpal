import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { pullRequest, repository, reviewRun } from "./dashboard";

export const userLlmRoutingSettings = pgTable(
	"user_llm_routing_settings",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		defaultRouter: text("default_router").default("ai-gateway").notNull(),
		fallbackRouter: text("fallback_router"),
		preferUserKeys: boolean("prefer_user_keys").default(true).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [uniqueIndex("user_llm_routing_settings_user_id_idx").on(table.userId)],
);

export const userLlmApiKey = pgTable(
	"user_llm_api_key",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		providerId: text("provider_id").notNull(),
		name: text("name").notNull(),
		encryptedApiKey: text("encrypted_api_key").notNull(),
		keyPreview: text("key_preview").notNull(),
		enabled: boolean("enabled").default(true).notNull(),
		priority: integer("priority").default(1).notNull(),
		forceDirect: boolean("force_direct").default(false).notNull(),
		allowedModels: jsonb("allowed_models").$type<string[]>().default([]).notNull(),
		baseUrl: text("base_url"),
		lastValidatedAt: timestamp("last_validated_at"),
		lastValidationStatus: text("last_validation_status"),
		lastValidationError: text("last_validation_error"),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown> | null>()
			.default({})
			.notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("user_llm_api_key_user_id_idx").on(table.userId),
		index("user_llm_api_key_provider_id_idx").on(table.providerId),
		index("user_llm_api_key_enabled_idx").on(table.enabled),
	],
);

export const aiGeneration = pgTable(
	"ai_generation",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		repositoryId: text("repository_id").references(() => repository.id, {
			onDelete: "set null",
		}),
		pullRequestId: text("pull_request_id").references(() => pullRequest.id, {
			onDelete: "set null",
		}),
		reviewRunId: text("review_run_id").references(() => reviewRun.id, {
			onDelete: "set null",
		}),
		callKind: text("call_kind").notNull(),
		billingMode: text("billing_mode").notNull(),
		routeId: text("route_id").notNull(),
		routeLabel: text("route_label"),
		modelId: text("model_id").notNull(),
		providerId: text("provider_id").notNull(),
		providerLabel: text("provider_label").notNull(),
		status: text("status").default("pending").notNull(),
		inputTokens: integer("input_tokens").default(0).notNull(),
		inputNoCacheTokens: integer("input_no_cache_tokens").default(0).notNull(),
		inputCacheReadTokens: integer("input_cache_read_tokens")
			.default(0)
			.notNull(),
		inputCacheWriteTokens: integer("input_cache_write_tokens")
			.default(0)
			.notNull(),
		outputTokens: integer("output_tokens").default(0).notNull(),
		outputTextTokens: integer("output_text_tokens").default(0).notNull(),
		outputReasoningTokens: integer("output_reasoning_tokens")
			.default(0)
			.notNull(),
		totalTokens: integer("total_tokens").default(0).notNull(),
		estimatedCostCents: integer("estimated_cost_cents"),
		actualCostCents: integer("actual_cost_cents"),
		walletDebitCents: integer("wallet_debit_cents").default(0).notNull(),
		walletBalanceAfterCents: integer("wallet_balance_after_cents"),
		providerGenerationId: text("provider_generation_id"),
		providerMetadata: jsonb("provider_metadata")
			.$type<Record<string, unknown> | null>()
			.default({})
			.notNull(),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown> | null>()
			.default({})
			.notNull(),
		errorMessage: text("error_message"),
		startedAt: timestamp("started_at"),
		completedAt: timestamp("completed_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("ai_generation_provider_generation_id_idx").on(
			table.providerGenerationId,
		),
		index("ai_generation_user_id_idx").on(table.userId),
		index("ai_generation_repository_id_idx").on(table.repositoryId),
		index("ai_generation_pull_request_id_idx").on(table.pullRequestId),
		index("ai_generation_review_run_id_idx").on(table.reviewRunId),
		index("ai_generation_call_kind_idx").on(table.callKind),
		index("ai_generation_status_idx").on(table.status),
		index("ai_generation_created_at_idx").on(table.createdAt),
	],
);

export const userLlmRoutingSettingsRelations = relations(
	userLlmRoutingSettings,
	({ one }) => ({
		user: one(user, {
			fields: [userLlmRoutingSettings.userId],
			references: [user.id],
		}),
	}),
);

export const userLlmApiKeyRelations = relations(userLlmApiKey, ({ one }) => ({
	user: one(user, {
		fields: [userLlmApiKey.userId],
		references: [user.id],
	}),
}));

export const aiGenerationRelations = relations(aiGeneration, ({ one }) => ({
	user: one(user, {
		fields: [aiGeneration.userId],
		references: [user.id],
	}),
	repository: one(repository, {
		fields: [aiGeneration.repositoryId],
		references: [repository.id],
	}),
	pullRequest: one(pullRequest, {
		fields: [aiGeneration.pullRequestId],
		references: [pullRequest.id],
	}),
	reviewRun: one(reviewRun, {
		fields: [aiGeneration.reviewRunId],
		references: [reviewRun.id],
	}),
}));
