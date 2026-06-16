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
