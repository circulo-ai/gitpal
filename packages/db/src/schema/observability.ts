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
import { issue, pullRequest, repository, reviewRun } from "./dashboard";

export const observabilityEvent = pgTable(
	"observability_event",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		organizationId: text("organization_id").references(() => organization.id, {
			onDelete: "set null",
		}),
		repositoryId: text("repository_id").references(() => repository.id, {
			onDelete: "set null",
		}),
		pullRequestId: text("pull_request_id").references(() => pullRequest.id, {
			onDelete: "set null",
		}),
		issueId: text("issue_id").references(() => issue.id, {
			onDelete: "set null",
		}),
		reviewRunId: text("review_run_id").references(() => reviewRun.id, {
			onDelete: "set null",
		}),
		traceId: text("trace_id"),
		parentEventId: text("parent_event_id"),
		kind: text("kind").notNull(),
		action: text("action").notNull(),
		status: text("status").notNull(),
		severity: text("severity").default("info").notNull(),
		title: text("title").notNull(),
		body: text("body"),
		sourceType: text("source_type"),
		sourceId: text("source_id"),
		dedupeKey: text("dedupe_key"),
		durationMs: integer("duration_ms"),
		costCents: integer("cost_cents"),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown> | null>()
			.default({})
			.notNull(),
		occurredAt: timestamp("occurred_at").defaultNow().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("observability_event_user_occurred_idx").on(
			table.userId,
			table.occurredAt,
		),
		index("observability_event_organization_idx").on(table.organizationId),
		index("observability_event_repository_idx").on(table.repositoryId),
		index("observability_event_pull_request_idx").on(table.pullRequestId),
		index("observability_event_issue_idx").on(table.issueId),
		index("observability_event_review_run_idx").on(table.reviewRunId),
		index("observability_event_trace_idx").on(table.traceId),
		index("observability_event_kind_idx").on(table.kind),
		index("observability_event_status_idx").on(table.status),
		uniqueIndex("observability_event_dedupe_key_idx").on(table.dedupeKey),
	],
);

export const notification = pgTable(
	"notification",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		organizationId: text("organization_id").references(() => organization.id, {
			onDelete: "set null",
		}),
		repositoryId: text("repository_id").references(() => repository.id, {
			onDelete: "set null",
		}),
		type: text("type").notNull(),
		category: text("category").notNull(),
		severity: text("severity").default("info").notNull(),
		status: text("status").default("unread").notNull(),
		title: text("title").notNull(),
		body: text("body"),
		actionHref: text("action_href"),
		sourceType: text("source_type"),
		sourceId: text("source_id"),
		dedupeKey: text("dedupe_key"),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown> | null>()
			.default({})
			.notNull(),
		readAt: timestamp("read_at"),
		archivedAt: timestamp("archived_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("notification_user_created_idx").on(table.userId, table.createdAt),
		index("notification_user_status_idx").on(table.userId, table.status),
		index("notification_organization_idx").on(table.organizationId),
		index("notification_repository_idx").on(table.repositoryId),
		index("notification_category_idx").on(table.category),
		uniqueIndex("notification_dedupe_key_idx").on(table.dedupeKey),
	],
);

export const notificationChannel = pgTable(
	"notification_channel",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		organizationId: text("organization_id").references(() => organization.id, {
			onDelete: "set null",
		}),
		provider: text("provider").notNull(),
		label: text("label").notNull(),
		targetId: text("target_id"),
		targetPreview: text("target_preview"),
		credentialEnvelope: text("credential_envelope").notNull(),
		settings: jsonb("settings")
			.$type<Record<string, unknown>>()
			.default({})
			.notNull(),
		status: text("status").default("configured").notNull(),
		enabled: boolean("enabled").default(true).notNull(),
		lastTestedAt: timestamp("last_tested_at"),
		lastError: text("last_error"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("notification_channel_user_provider_label_idx").on(
			table.userId,
			table.provider,
			table.label,
		),
		index("notification_channel_user_idx").on(table.userId),
		index("notification_channel_organization_idx").on(table.organizationId),
		index("notification_channel_provider_idx").on(table.provider),
		index("notification_channel_target_idx").on(table.provider, table.targetId),
		index("notification_channel_status_idx").on(table.status),
	],
);

export const notificationDelivery = pgTable(
	"notification_delivery",
	{
		id: text("id").primaryKey(),
		notificationId: text("notification_id")
			.notNull()
			.references(() => notification.id, { onDelete: "cascade" }),
		channelId: text("channel_id").references(() => notificationChannel.id, {
			onDelete: "set null",
		}),
		provider: text("provider").notNull(),
		status: text("status").notNull(),
		attemptCount: integer("attempt_count").default(1).notNull(),
		error: text("error"),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown> | null>()
			.default({})
			.notNull(),
		deliveredAt: timestamp("delivered_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("notification_delivery_notification_idx").on(table.notificationId),
		index("notification_delivery_channel_idx").on(table.channelId),
		index("notification_delivery_status_idx").on(table.status),
		uniqueIndex("notification_delivery_notification_channel_idx").on(
			table.notificationId,
			table.channelId,
		),
	],
);

export const observabilityEventRelations = relations(
	observabilityEvent,
	({ one }) => ({
		user: one(user, {
			fields: [observabilityEvent.userId],
			references: [user.id],
		}),
		organization: one(organization, {
			fields: [observabilityEvent.organizationId],
			references: [organization.id],
		}),
		repository: one(repository, {
			fields: [observabilityEvent.repositoryId],
			references: [repository.id],
		}),
		pullRequest: one(pullRequest, {
			fields: [observabilityEvent.pullRequestId],
			references: [pullRequest.id],
		}),
		issue: one(issue, {
			fields: [observabilityEvent.issueId],
			references: [issue.id],
		}),
		reviewRun: one(reviewRun, {
			fields: [observabilityEvent.reviewRunId],
			references: [reviewRun.id],
		}),
	}),
);

export const notificationRelations = relations(notification, ({ one }) => ({
	user: one(user, {
		fields: [notification.userId],
		references: [user.id],
	}),
	organization: one(organization, {
		fields: [notification.organizationId],
		references: [organization.id],
	}),
	repository: one(repository, {
		fields: [notification.repositoryId],
		references: [repository.id],
	}),
}));

export const notificationChannelRelations = relations(
	notificationChannel,
	({ one, many }) => ({
		user: one(user, {
			fields: [notificationChannel.userId],
			references: [user.id],
		}),
		organization: one(organization, {
			fields: [notificationChannel.organizationId],
			references: [organization.id],
		}),
		deliveries: many(notificationDelivery),
	}),
);

export const notificationDeliveryRelations = relations(
	notificationDelivery,
	({ one }) => ({
		notification: one(notification, {
			fields: [notificationDelivery.notificationId],
			references: [notification.id],
		}),
		channel: one(notificationChannel, {
			fields: [notificationDelivery.channelId],
			references: [notificationChannel.id],
		}),
	}),
);
