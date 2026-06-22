import { relations, sql } from "drizzle-orm";
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

export const repository = pgTable(
	"repository",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
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
		reconcileState: text("reconcile_state").default("idle").notNull(),
		lastReconcileStartedAt: timestamp("last_reconcile_started_at"),
		lastReconciledAt: timestamp("last_reconciled_at"),
		lastFullReconciledAt: timestamp("last_full_reconciled_at"),
		incrementalSyncCursor: timestamp("incremental_sync_cursor"),
		lastReconcileFailedAt: timestamp("last_reconcile_failed_at"),
		lastReconcileError: text("last_reconcile_error"),
		nextRetryAt: timestamp("next_retry_at"),
		retryHint: text("retry_hint"),
		webhookGapDetectedAt: timestamp("webhook_gap_detected_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("repository_organization_provider_repository_idx").on(
			table.organizationId,
			table.providerId,
			table.repositoryId,
		),
		index("repository_organization_id_idx").on(table.organizationId),
		index("repository_provider_path_idx").on(
			table.organizationId,
			table.providerId,
			table.repositoryPath,
		),
		index("repository_enabled_idx").on(table.enabled),
		index("repository_org_enabled_idx").on(table.organizationId, table.enabled),
		index("repository_reconcile_state_idx").on(table.reconcileState),
		index("repository_last_reconciled_at_idx").on(table.lastReconciledAt),
		index("repository_incremental_sync_cursor_idx").on(
			table.incrementalSyncCursor,
		),
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
		index("repository_access_user_enabled_seen_idx").on(
			table.userId,
			table.enabled,
			table.lastSeenAt,
		),
	],
);

export const providerWorkspaceMember = pgTable(
	"provider_workspace_member",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		providerId: text("provider_id").notNull(),
		providerType: text("provider_type").notNull(),
		providerMemberId: text("provider_member_id").notNull(),
		login: text("login"),
		name: text("name"),
		email: text("email"),
		avatarUrl: text("avatar_url"),
		htmlUrl: text("html_url"),
		role: text("role").default("member").notNull(),
		lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("provider_workspace_member_org_provider_member_idx").on(
			table.organizationId,
			table.providerId,
			table.providerMemberId,
		),
		index("provider_workspace_member_organization_id_idx").on(
			table.organizationId,
		),
		index("provider_workspace_member_provider_login_idx").on(
			table.providerId,
			table.login,
		),
		index("provider_workspace_member_role_idx").on(table.role),
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
		approvedAt: timestamp("approved_at"),
		approvalState: text("approval_state"),
		reviewStateUpdatedAt: timestamp("review_state_updated_at"),
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
		index("pull_request_repo_state_updated_idx").on(
			table.repositoryId,
			table.state,
			table.updatedAt,
		),
	],
);

export const issue = pgTable(
	"issue",
	{
		id: text("id").primaryKey(),
		repositoryId: text("repository_id")
			.notNull()
			.references(() => repository.id, { onDelete: "cascade" }),
		providerIssueId: text("provider_issue_id").notNull(),
		number: integer("number").notNull(),
		title: text("title").notNull(),
		body: text("body"),
		state: text("state").notNull(),
		htmlUrl: text("html_url").notNull(),
		authorLogin: text("author_login"),
		authorName: text("author_name"),
		authorAvatarUrl: text("author_avatar_url"),
		labels: jsonb("labels").$type<string[]>().default([]).notNull(),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
		closedAt: timestamp("closed_at"),
	},
	(table) => [
		uniqueIndex("issue_repository_number_idx").on(
			table.repositoryId,
			table.number,
		),
		index("issue_repository_id_idx").on(table.repositoryId),
		index("issue_state_idx").on(table.state),
		index("issue_updated_at_idx").on(table.updatedAt),
		index("issue_repo_state_updated_idx").on(
			table.repositoryId,
			table.state,
			table.updatedAt,
		),
	],
);

export const reviewRun = pgTable(
	"review_run",
	{
		id: text("id").primaryKey(),
		repositoryId: text("repository_id")
			.notNull()
			.references(() => repository.id, { onDelete: "cascade" }),
		pullRequestId: text("pull_request_id").references(() => pullRequest.id, {
			onDelete: "set null",
		}),
		issueId: text("issue_id").references(() => issue.id, {
			onDelete: "set null",
		}),
		requestedByUserId: text("requested_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		retryOfRunId: text("retry_of_run_id"),
		traceId: text("trace_id"),
		reviewKind: text("review_kind").default("review").notNull(),
		trigger: text("trigger").default("pull_request").notNull(),
		providerId: text("provider_id").notNull(),
		providerDeliveryId: text("provider_delivery_id"),
		providerEvent: text("provider_event"),
		providerAction: text("provider_action"),
		status: text("status").default("queued").notNull(),
		modelId: text("model_id"),
		thinkingEnabled: boolean("thinking_enabled").default(false).notNull(),
		promptVersion: text("prompt_version"),
		reviewTemplate: text("review_template"),
		confidenceLevel: text("confidence_level"),
		confidenceScore: integer("confidence_score"),
		confidenceSummary: text("confidence_summary"),
		summary: text("summary"),
		finalCommentBody: text("final_comment_body"),
		result: jsonb("result")
			.$type<Record<string, unknown> | null>()
			.default({})
			.notNull(),
		startedAt: timestamp("started_at"),
		completedAt: timestamp("completed_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("review_run_repository_id_idx").on(table.repositoryId),
		index("review_run_pull_request_id_idx").on(table.pullRequestId),
		index("review_run_issue_id_idx").on(table.issueId),
		index("review_run_trace_id_idx").on(table.traceId),
		index("review_run_retry_of_run_id_idx").on(table.retryOfRunId),
		index("review_run_status_idx").on(table.status),
		index("review_run_created_at_idx").on(table.createdAt),
		index("review_run_pull_request_created_idx").on(
			table.pullRequestId,
			table.createdAt,
		),
		index("review_run_issue_created_idx").on(table.issueId, table.createdAt),
		uniqueIndex("review_run_provider_delivery_kind_idx").on(
			table.providerId,
			table.providerDeliveryId,
			table.reviewKind,
		),
		uniqueIndex("review_run_active_pull_request_kind_idx")
			.on(table.pullRequestId, table.reviewKind)
			.where(
				sql`${table.pullRequestId} is not null and ${table.status} in ('queued', 'running')`,
			),
		uniqueIndex("review_run_active_issue_kind_idx")
			.on(table.issueId, table.reviewKind)
			.where(
				sql`${table.issueId} is not null and ${table.status} in ('queued', 'running')`,
			),
	],
);

export const reviewRunStep = pgTable(
	"review_run_step",
	{
		id: text("id").primaryKey(),
		reviewRunId: text("review_run_id")
			.notNull()
			.references(() => reviewRun.id, { onDelete: "cascade" }),
		parentStepId: text("parent_step_id"),
		stepKey: text("step_key").notNull(),
		position: integer("position").notNull(),
		attempt: integer("attempt").default(1).notNull(),
		status: text("status").default("pending").notNull(),
		title: text("title").notNull(),
		summary: text("summary"),
		details: jsonb("details")
			.$type<Record<string, unknown> | null>()
			.default({})
			.notNull(),
		errorCode: text("error_code"),
		startedAt: timestamp("started_at"),
		completedAt: timestamp("completed_at"),
		durationMs: integer("duration_ms"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("review_run_step_run_key_attempt_idx").on(
			table.reviewRunId,
			table.stepKey,
			table.attempt,
		),
		index("review_run_step_run_position_idx").on(
			table.reviewRunId,
			table.position,
		),
		index("review_run_step_status_idx").on(table.status),
	],
);

export const reviewComment = pgTable(
	"review_comment",
	{
		id: text("id").primaryKey(),
		reviewRunId: text("review_run_id").references(() => reviewRun.id, {
			onDelete: "set null",
		}),
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
		title: text("title"),
		body: text("body"),
		filePath: text("file_path"),
		line: integer("line"),
		startLine: integer("start_line"),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown> | null>()
			.default({})
			.notNull(),
		accepted: boolean("accepted").default(false).notNull(),
		resolved: boolean("resolved").default(false).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("review_comment_review_run_id_idx").on(table.reviewRunId),
		index("review_comment_repository_id_idx").on(table.repositoryId),
		index("review_comment_pull_request_id_idx").on(table.pullRequestId),
		index("review_comment_created_at_idx").on(table.createdAt),
		index("review_comment_severity_idx").on(table.severity),
		index("review_comment_category_idx").on(table.category),
		index("review_comment_file_path_idx").on(table.filePath),
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
		reviewRunId: text("review_run_id").references(() => reviewRun.id, {
			onDelete: "set null",
		}),
		repositoryId: text("repository_id")
			.notNull()
			.references(() => repository.id, { onDelete: "cascade" }),
		pullRequestId: text("pull_request_id").references(() => pullRequest.id, {
			onDelete: "set null",
		}),
		checkName: text("check_name").notNull(),
		checkType: text("check_type").default("built-in").notNull(),
		status: text("status").default("passed").notNull(),
		details: jsonb("details")
			.$type<Record<string, unknown> | null>()
			.default({})
			.notNull(),
		startedAt: timestamp("started_at").defaultNow().notNull(),
		completedAt: timestamp("completed_at"),
	},
	(table) => [
		index("pre_merge_check_run_review_run_id_idx").on(table.reviewRunId),
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
		toolName: text("tool_name"),
		timesApplied: integer("times_applied").default(0).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		lastAppliedAt: timestamp("last_applied_at"),
	},
	(table) => [
		index("knowledge_base_learning_repository_id_idx").on(table.repositoryId),
		index("knowledge_base_learning_created_at_idx").on(table.createdAt),
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

export const organizationSettings = pgTable(
	"organization_settings",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		settings: jsonb("settings").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("organization_settings_organization_id_idx").on(
			table.organizationId,
		),
	],
);

export const repositorySettings = pgTable(
	"repository_settings",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		repositoryId: text("repository_id")
			.notNull()
			.references(() => repository.id, { onDelete: "cascade" }),
		useOrganizationSettings: boolean("use_organization_settings")
			.default(true)
			.notNull(),
		settings: jsonb("settings").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("repository_settings_org_repository_idx").on(
			table.organizationId,
			table.repositoryId,
		),
		index("repository_settings_repository_id_idx").on(table.repositoryId),
		index("repository_settings_organization_id_idx").on(table.organizationId),
	],
);

export const repositoryWebhook = pgTable(
	"repository_webhook",
	{
		id: text("id").primaryKey(),
		repositoryId: text("repository_id")
			.notNull()
			.references(() => repository.id, { onDelete: "cascade" }),
		providerId: text("provider_id").notNull(),
		providerWebhookId: text("provider_webhook_id").notNull(),
		deliveryUrl: text("delivery_url").notNull(),
		events: jsonb("events").$type<string[]>().default([]).notNull(),
		enabled: boolean("enabled").default(true).notNull(),
		secretPreview: text("secret_preview"),
		verifiedAt: timestamp("verified_at"),
		lastDeliveredAt: timestamp("last_delivered_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("repository_webhook_repo_provider_hook_idx").on(
			table.repositoryId,
			table.providerId,
			table.providerWebhookId,
		),
		index("repository_webhook_repository_id_idx").on(table.repositoryId),
		index("repository_webhook_provider_id_idx").on(table.providerId),
		index("repository_webhook_repo_enabled_idx").on(
			table.repositoryId,
			table.enabled,
		),
	],
);

export const webhookEventReceipt = pgTable(
	"webhook_event_receipt",
	{
		id: text("id").primaryKey(),
		repositoryId: text("repository_id").references(() => repository.id, {
			onDelete: "set null",
		}),
		providerId: text("provider_id").notNull(),
		deliveryId: text("delivery_id").notNull(),
		repositoryPath: text("repository_path"),
		event: text("event").notNull(),
		action: text("action"),
		status: text("status").default("received").notNull(),
		payload: jsonb("payload")
			.$type<Record<string, unknown> | null>()
			.default({})
			.notNull(),
		receivedAt: timestamp("received_at").defaultNow().notNull(),
		processedAt: timestamp("processed_at"),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("webhook_event_receipt_provider_delivery_idx").on(
			table.providerId,
			table.deliveryId,
		),
		index("webhook_event_receipt_repository_id_idx").on(table.repositoryId),
		index("webhook_event_receipt_event_idx").on(table.event),
		index("webhook_event_receipt_status_idx").on(table.status),
		index("webhook_receipt_repo_received_idx").on(
			table.repositoryId,
			table.receivedAt,
		),
	],
);

export const repositoryRelations = relations(repository, ({ one, many }) => ({
	organization: one(organization, {
		fields: [repository.organizationId],
		references: [organization.id],
	}),
	access: many(repositoryAccess),
	settings: many(repositorySettings),
	pullRequests: many(pullRequest),
	issues: many(issue),
	reviewRuns: many(reviewRun),
	reviewComments: many(reviewComment),
	toolFindings: many(toolFinding),
	preMergeCheckRuns: many(preMergeCheckRun),
	knowledgeBaseLearnings: many(knowledgeBaseLearning),
	reportDeliveries: many(reportDelivery),
	webhooks: many(repositoryWebhook),
	webhookReceipts: many(webhookEventReceipt),
}));

export const issueRelations = relations(issue, ({ one, many }) => ({
	repository: one(repository, {
		fields: [issue.repositoryId],
		references: [repository.id],
	}),
	reviewRuns: many(reviewRun),
}));

export const organizationSettingsRelations = relations(
	organizationSettings,
	({ one }) => ({
		organization: one(organization, {
			fields: [organizationSettings.organizationId],
			references: [organization.id],
		}),
	}),
);

export const repositorySettingsRelations = relations(
	repositorySettings,
	({ one }) => ({
		organization: one(organization, {
			fields: [repositorySettings.organizationId],
			references: [organization.id],
		}),
		repository: one(repository, {
			fields: [repositorySettings.repositoryId],
			references: [repository.id],
		}),
	}),
);

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
	reviewRuns: many(reviewRun),
	reviewComments: many(reviewComment),
	toolFindings: many(toolFinding),
	preMergeCheckRuns: many(preMergeCheckRun),
	knowledgeBaseLearnings: many(knowledgeBaseLearning),
}));

export const reviewRunRelations = relations(reviewRun, ({ one, many }) => ({
	repository: one(repository, {
		fields: [reviewRun.repositoryId],
		references: [repository.id],
	}),
	pullRequest: one(pullRequest, {
		fields: [reviewRun.pullRequestId],
		references: [pullRequest.id],
	}),
	issue: one(issue, {
		fields: [reviewRun.issueId],
		references: [issue.id],
	}),
	requestedBy: one(user, {
		fields: [reviewRun.requestedByUserId],
		references: [user.id],
	}),
	steps: many(reviewRunStep),
	reviewComments: many(reviewComment),
	preMergeCheckRuns: many(preMergeCheckRun),
}));

export const reviewRunStepRelations = relations(reviewRunStep, ({ one }) => ({
	reviewRun: one(reviewRun, {
		fields: [reviewRunStep.reviewRunId],
		references: [reviewRun.id],
	}),
}));

export const reviewCommentRelations = relations(reviewComment, ({ one }) => ({
	reviewRun: one(reviewRun, {
		fields: [reviewComment.reviewRunId],
		references: [reviewRun.id],
	}),
	repository: one(repository, {
		fields: [reviewComment.repositoryId],
		references: [repository.id],
	}),
	pullRequest: one(pullRequest, {
		fields: [reviewComment.pullRequestId],
		references: [pullRequest.id],
	}),
}));

export const repositoryWebhookRelations = relations(
	repositoryWebhook,
	({ one }) => ({
		repository: one(repository, {
			fields: [repositoryWebhook.repositoryId],
			references: [repository.id],
		}),
	}),
);

export const webhookEventReceiptRelations = relations(
	webhookEventReceipt,
	({ one }) => ({
		repository: one(repository, {
			fields: [webhookEventReceipt.repositoryId],
			references: [repository.id],
		}),
	}),
);
