import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const repository = pgTable(
	"repository",
	{
		id: text("id").primaryKey(),
		providerId: text("provider_id").notNull(),
		providerType: text("provider_type").notNull(),
		providerName: text("provider_name").notNull(),
		repositoryId: text("repository_id").notNull(),
		repositoryPath: text("repository_path").notNull(),
		name: text("name").notNull(),
		fullName: text("full_name").notNull(),
		htmlUrl: text("html_url").notNull(),
		defaultBranch: text("default_branch").notNull(),
		private: boolean("private").default(true).notNull(),
		description: text("description"),
		ownerLogin: text("owner_login"),
		ownerAvatarUrl: text("owner_avatar_url"),
		enabled: boolean("enabled").default(true).notNull(),
		syncState: text("sync_state").default("synced").notNull(),
		lastSyncedAt: timestamp("last_synced_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("repository_provider_repository_id_idx").on(
			table.providerId,
			table.repositoryId,
		),
		index("repository_provider_path_idx").on(
			table.providerId,
			table.repositoryPath,
		),
		index("repository_enabled_idx").on(table.enabled),
	],
);

export const repositoryAccess = pgTable(
	"repository_access",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		repositoryId: text("repository_id")
			.notNull()
			.references(() => repository.id, { onDelete: "cascade" }),
		role: text("role").default("member").notNull(),
		enabled: boolean("enabled").default(true).notNull(),
		lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("repository_access_user_repository_idx").on(
			table.userId,
			table.repositoryId,
		),
		index("repository_access_user_id_idx").on(table.userId),
		index("repository_access_repository_id_idx").on(table.repositoryId),
	],
);

export const pullRequest = pgTable(
	"pull_request",
	{
		id: text("id").primaryKey(),
		repositoryId: text("repository_id")
			.notNull()
			.references(() => repository.id, { onDelete: "cascade" }),
		providerPullRequestId: text("provider_pull_request_id").notNull(),
		number: integer("number").notNull(),
		title: text("title").notNull(),
		state: text("state").notNull(),
		draft: boolean("draft").default(false).notNull(),
		htmlUrl: text("html_url").notNull(),
		sourceBranch: text("source_branch").notNull(),
		targetBranch: text("target_branch").notNull(),
		authorLogin: text("author_login"),
		authorName: text("author_name"),
		authorAvatarUrl: text("author_avatar_url"),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
		mergedAt: timestamp("merged_at"),
		closedAt: timestamp("closed_at"),
		firstHumanReviewAt: timestamp("first_human_review_at"),
		lastHumanReviewAt: timestamp("last_human_review_at"),
		lastCommitAt: timestamp("last_commit_at"),
		reviewReadyAt: timestamp("review_ready_at"),
		mergeCommitSha: text("merge_commit_sha"),
	},
	(table) => [
		uniqueIndex("pull_request_repository_number_idx").on(
			table.repositoryId,
			table.number,
		),
		index("pull_request_repository_id_idx").on(table.repositoryId),
		index("pull_request_state_idx").on(table.state),
		index("pull_request_merged_at_idx").on(table.mergedAt),
	],
);

export const reviewComment = pgTable(
	"review_comment",
	{
		id: text("id").primaryKey(),
		pullRequestId: text("pull_request_id")
			.notNull()
			.references(() => pullRequest.id, { onDelete: "cascade" }),
		repositoryId: text("repository_id")
			.notNull()
			.references(() => repository.id, { onDelete: "cascade" }),
		providerCommentId: text("provider_comment_id"),
		authorType: text("author_type").default("ai").notNull(),
		authorLogin: text("author_login"),
		severity: text("severity").default("medium").notNull(),
		category: text("category").default("maintainability").notNull(),
		body: text("body"),
		accepted: boolean("accepted").default(false).notNull(),
		resolved: boolean("resolved").default(false).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("review_comment_repository_id_idx").on(table.repositoryId),
		index("review_comment_pull_request_id_idx").on(table.pullRequestId),
		index("review_comment_created_at_idx").on(table.createdAt),
		index("review_comment_severity_idx").on(table.severity),
		index("review_comment_category_idx").on(table.category),
	],
);

export const toolFinding = pgTable(
	"tool_finding",
	{
		id: text("id").primaryKey(),
		repositoryId: text("repository_id")
			.notNull()
			.references(() => repository.id, { onDelete: "cascade" }),
		pullRequestId: text("pull_request_id").references(() => pullRequest.id, {
			onDelete: "set null",
		}),
		toolName: text("tool_name").notNull(),
		toolType: text("tool_type").default("other").notNull(),
		severity: text("severity").default("medium").notNull(),
		status: text("status").default("open").notNull(),
		title: text("title").notNull(),
		filePath: text("file_path"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		resolvedAt: timestamp("resolved_at"),
	},
	(table) => [
		index("tool_finding_repository_id_idx").on(table.repositoryId),
		index("tool_finding_pull_request_id_idx").on(table.pullRequestId),
		index("tool_finding_created_at_idx").on(table.createdAt),
		index("tool_finding_severity_idx").on(table.severity),
		index("tool_finding_tool_type_idx").on(table.toolType),
	],
);

export const preMergeCheckRun = pgTable(
	"pre_merge_check_run",
	{
		id: text("id").primaryKey(),
		repositoryId: text("repository_id")
			.notNull()
			.references(() => repository.id, { onDelete: "cascade" }),
		pullRequestId: text("pull_request_id").references(() => pullRequest.id, {
			onDelete: "set null",
		}),
		checkName: text("check_name").notNull(),
		checkType: text("check_type").default("built-in").notNull(),
		status: text("status").default("passed").notNull(),
		startedAt: timestamp("started_at").defaultNow().notNull(),
		completedAt: timestamp("completed_at"),
	},
	(table) => [
		index("pre_merge_check_run_repository_id_idx").on(table.repositoryId),
		index("pre_merge_check_run_started_at_idx").on(table.startedAt),
		index("pre_merge_check_run_status_idx").on(table.status),
	],
);

export const knowledgeBaseLearning = pgTable(
	"knowledge_base_learning",
	{
		id: text("id").primaryKey(),
		repositoryId: text("repository_id")
			.notNull()
			.references(() => repository.id, { onDelete: "cascade" }),
		pullRequestId: text("pull_request_id").references(() => pullRequest.id, {
			onDelete: "set null",
		}),
		title: text("title").notNull(),
		source: text("source").default("review").notNull(),
		mcpServer: text("mcp_server"),
		toolName: text("tool_name"),
		timesApplied: integer("times_applied").default(0).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		lastAppliedAt: timestamp("last_applied_at"),
	},
	(table) => [
		index("knowledge_base_learning_repository_id_idx").on(table.repositoryId),
		index("knowledge_base_learning_created_at_idx").on(table.createdAt),
		index("knowledge_base_learning_mcp_server_idx").on(table.mcpServer),
	],
);

export const reportDelivery = pgTable(
	"report_delivery",
	{
		id: text("id").primaryKey(),
		userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
		repositoryId: text("repository_id").references(() => repository.id, {
			onDelete: "set null",
		}),
		reportName: text("report_name").notNull(),
		reportType: text("report_type").default("scheduled").notNull(),
		channel: text("channel").default("email").notNull(),
		status: text("status").default("delivered").notNull(),
		deliveredAt: timestamp("delivered_at").defaultNow().notNull(),
	},
	(table) => [
		index("report_delivery_user_id_idx").on(table.userId),
		index("report_delivery_repository_id_idx").on(table.repositoryId),
		index("report_delivery_delivered_at_idx").on(table.deliveredAt),
	],
);

export const repositoryRelations = relations(repository, ({ many }) => ({
	access: many(repositoryAccess),
	pullRequests: many(pullRequest),
	reviewComments: many(reviewComment),
	toolFindings: many(toolFinding),
	preMergeCheckRuns: many(preMergeCheckRun),
	knowledgeBaseLearnings: many(knowledgeBaseLearning),
	reportDeliveries: many(reportDelivery),
}));

export const repositoryAccessRelations = relations(
	repositoryAccess,
	({ one }) => ({
		user: one(user, {
			fields: [repositoryAccess.userId],
			references: [user.id],
		}),
		repository: one(repository, {
			fields: [repositoryAccess.repositoryId],
			references: [repository.id],
		}),
	}),
);

export const pullRequestRelations = relations(pullRequest, ({ one, many }) => ({
	repository: one(repository, {
		fields: [pullRequest.repositoryId],
		references: [repository.id],
	}),
	reviewComments: many(reviewComment),
	toolFindings: many(toolFinding),
	preMergeCheckRuns: many(preMergeCheckRun),
	knowledgeBaseLearnings: many(knowledgeBaseLearning),
}));

export const reviewCommentRelations = relations(reviewComment, ({ one }) => ({
	repository: one(repository, {
		fields: [reviewComment.repositoryId],
		references: [repository.id],
	}),
	pullRequest: one(pullRequest, {
		fields: [reviewComment.pullRequestId],
		references: [pullRequest.id],
	}),
}));
