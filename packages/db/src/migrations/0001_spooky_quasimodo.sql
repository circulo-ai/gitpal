CREATE TABLE "knowledge_base_learning" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"pull_request_id" text,
	"title" text NOT NULL,
	"source" text DEFAULT 'review' NOT NULL,
	"mcp_server" text,
	"tool_name" text,
	"times_applied" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_applied_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "pre_merge_check_run" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"pull_request_id" text,
	"check_name" text NOT NULL,
	"check_type" text DEFAULT 'built-in' NOT NULL,
	"status" text DEFAULT 'passed' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "pull_request" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"provider_pull_request_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"state" text NOT NULL,
	"draft" boolean DEFAULT false NOT NULL,
	"html_url" text NOT NULL,
	"source_branch" text NOT NULL,
	"target_branch" text NOT NULL,
	"author_login" text,
	"author_name" text,
	"author_avatar_url" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"merged_at" timestamp,
	"closed_at" timestamp,
	"first_human_review_at" timestamp,
	"last_human_review_at" timestamp,
	"last_commit_at" timestamp,
	"review_ready_at" timestamp,
	"merge_commit_sha" text
);
--> statement-breakpoint
CREATE TABLE "report_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"repository_id" text,
	"report_name" text NOT NULL,
	"report_type" text DEFAULT 'scheduled' NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"status" text DEFAULT 'delivered' NOT NULL,
	"delivered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"provider_type" text NOT NULL,
	"provider_name" text NOT NULL,
	"repository_id" text NOT NULL,
	"repository_path" text NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"html_url" text NOT NULL,
	"default_branch" text NOT NULL,
	"private" boolean DEFAULT true NOT NULL,
	"description" text,
	"owner_login" text,
	"owner_avatar_url" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"sync_state" text DEFAULT 'synced' NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_access" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"pull_request_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"provider_comment_id" text,
	"author_type" text DEFAULT 'ai' NOT NULL,
	"author_login" text,
	"severity" text DEFAULT 'medium' NOT NULL,
	"category" text DEFAULT 'maintainability' NOT NULL,
	"body" text,
	"accepted" boolean DEFAULT false NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_finding" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"pull_request_id" text,
	"tool_name" text NOT NULL,
	"tool_type" text DEFAULT 'other' NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"file_path" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "knowledge_base_learning" ADD CONSTRAINT "knowledge_base_learning_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_learning" ADD CONSTRAINT "knowledge_base_learning_pull_request_id_pull_request_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_merge_check_run" ADD CONSTRAINT "pre_merge_check_run_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_merge_check_run" ADD CONSTRAINT "pre_merge_check_run_pull_request_id_pull_request_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_request" ADD CONSTRAINT "pull_request_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_delivery" ADD CONSTRAINT "report_delivery_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_delivery" ADD CONSTRAINT "report_delivery_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_access" ADD CONSTRAINT "repository_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_access" ADD CONSTRAINT "repository_access_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comment" ADD CONSTRAINT "review_comment_pull_request_id_pull_request_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comment" ADD CONSTRAINT "review_comment_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_finding" ADD CONSTRAINT "tool_finding_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_finding" ADD CONSTRAINT "tool_finding_pull_request_id_pull_request_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_base_learning_repository_id_idx" ON "knowledge_base_learning" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "knowledge_base_learning_created_at_idx" ON "knowledge_base_learning" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "knowledge_base_learning_mcp_server_idx" ON "knowledge_base_learning" USING btree ("mcp_server");--> statement-breakpoint
CREATE INDEX "pre_merge_check_run_repository_id_idx" ON "pre_merge_check_run" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "pre_merge_check_run_started_at_idx" ON "pre_merge_check_run" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "pre_merge_check_run_status_idx" ON "pre_merge_check_run" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "pull_request_repository_number_idx" ON "pull_request" USING btree ("repository_id","number");--> statement-breakpoint
CREATE INDEX "pull_request_repository_id_idx" ON "pull_request" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "pull_request_state_idx" ON "pull_request" USING btree ("state");--> statement-breakpoint
CREATE INDEX "pull_request_merged_at_idx" ON "pull_request" USING btree ("merged_at");--> statement-breakpoint
CREATE INDEX "report_delivery_user_id_idx" ON "report_delivery" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "report_delivery_repository_id_idx" ON "report_delivery" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "report_delivery_delivered_at_idx" ON "report_delivery" USING btree ("delivered_at");--> statement-breakpoint
CREATE UNIQUE INDEX "repository_provider_repository_id_idx" ON "repository" USING btree ("provider_id","repository_id");--> statement-breakpoint
CREATE INDEX "repository_provider_path_idx" ON "repository" USING btree ("provider_id","repository_path");--> statement-breakpoint
CREATE INDEX "repository_enabled_idx" ON "repository" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "repository_access_user_repository_idx" ON "repository_access" USING btree ("user_id","repository_id");--> statement-breakpoint
CREATE INDEX "repository_access_user_id_idx" ON "repository_access" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "repository_access_repository_id_idx" ON "repository_access" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "review_comment_repository_id_idx" ON "review_comment" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "review_comment_pull_request_id_idx" ON "review_comment" USING btree ("pull_request_id");--> statement-breakpoint
CREATE INDEX "review_comment_created_at_idx" ON "review_comment" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "review_comment_severity_idx" ON "review_comment" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "review_comment_category_idx" ON "review_comment" USING btree ("category");--> statement-breakpoint
CREATE INDEX "tool_finding_repository_id_idx" ON "tool_finding" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "tool_finding_pull_request_id_idx" ON "tool_finding" USING btree ("pull_request_id");--> statement-breakpoint
CREATE INDEX "tool_finding_created_at_idx" ON "tool_finding" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tool_finding_severity_idx" ON "tool_finding" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "tool_finding_tool_type_idx" ON "tool_finding" USING btree ("tool_type");