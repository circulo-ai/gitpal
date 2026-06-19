import { relations } from "drizzle-orm";
import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth";
import { pullRequest, repository, reviewRun } from "./dashboard";

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
