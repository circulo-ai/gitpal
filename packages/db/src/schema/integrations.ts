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

import { organization, user } from "./auth";

export const integrationConnection = pgTable(
	"integration_connection",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		providerId: text("provider_id").notNull(),
		providerType: text("provider_type").notNull(),
		label: text("label").notNull(),
		serverUrl: text("server_url"),
		usageGuidance: text("usage_guidance"),
		authMethod: text("auth_method").notNull(),
		credentialEnvelope: text("credential_envelope"),
		headerPreview: jsonb("header_preview")
			.$type<Record<string, string> | null>()
			.default({})
			.notNull(),
		status: text("status").default("configured").notNull(),
		enabled: boolean("enabled").default(true).notNull(),
		rateLimitWindowSeconds: integer("rate_limit_window_seconds")
			.default(60)
			.notNull(),
		rateLimitMaxRequests: integer("rate_limit_max_requests")
			.default(30)
			.notNull(),
		connectedByUserId: text("connected_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		lastValidatedAt: timestamp("last_validated_at"),
		lastUsedAt: timestamp("last_used_at"),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown> | null>()
			.default({})
			.notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("integration_connection_org_provider_label_idx").on(
			table.organizationId,
			table.providerId,
			table.label,
		),
		index("integration_connection_organization_id_idx").on(
			table.organizationId,
		),
		index("integration_connection_provider_type_idx").on(table.providerType),
		index("integration_connection_status_idx").on(table.status),
	],
);

export const integrationOAuthState = pgTable(
	"integration_oauth_state",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		state: text("state").notNull().unique(),
		codeVerifier: text("code_verifier").notNull(),
		redirectUri: text("redirect_uri").notNull(),
		returnTo: text("return_to"),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("integration_oauth_state_organization_id_idx").on(
			table.organizationId,
		),
		index("integration_oauth_state_user_id_idx").on(table.userId),
		index("integration_oauth_state_expires_at_idx").on(table.expiresAt),
	],
);

export const integrationConnectionRelations = relations(
	integrationConnection,
	({ one }) => ({
		organization: one(organization, {
			fields: [integrationConnection.organizationId],
			references: [organization.id],
		}),
		connectedBy: one(user, {
			fields: [integrationConnection.connectedByUserId],
			references: [user.id],
		}),
	}),
);

export const integrationOAuthStateRelations = relations(
	integrationOAuthState,
	({ one }) => ({
		organization: one(organization, {
			fields: [integrationOAuthState.organizationId],
			references: [organization.id],
		}),
		user: one(user, {
			fields: [integrationOAuthState.userId],
			references: [user.id],
		}),
	}),
);
