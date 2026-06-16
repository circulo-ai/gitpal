CREATE TABLE "repository_webhook" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"provider_webhook_id" text NOT NULL,
	"delivery_url" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"secret_preview" text,
	"verified_at" timestamp,
	"last_delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_run" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"pull_request_id" text,
	"review_kind" text DEFAULT 'review' NOT NULL,
	"trigger" text DEFAULT 'pull_request' NOT NULL,
	"provider_id" text NOT NULL,
	"provider_delivery_id" text,
	"provider_event" text,
	"provider_action" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"model_id" text,
	"thinking_enabled" boolean DEFAULT false NOT NULL,
	"summary" text,
	"final_comment_body" text,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_event_receipt" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text,
	"provider_id" text NOT NULL,
	"delivery_id" text NOT NULL,
	"repository_path" text,
	"event" text NOT NULL,
	"action" text,
	"status" text DEFAULT 'received' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pre_merge_check_run" ADD COLUMN "review_run_id" text;--> statement-breakpoint
ALTER TABLE "pre_merge_check_run" ADD COLUMN "details" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "review_comment" ADD COLUMN "review_run_id" text;--> statement-breakpoint
ALTER TABLE "review_comment" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "review_comment" ADD COLUMN "file_path" text;--> statement-breakpoint
ALTER TABLE "review_comment" ADD COLUMN "line" integer;--> statement-breakpoint
ALTER TABLE "review_comment" ADD COLUMN "start_line" integer;--> statement-breakpoint
ALTER TABLE "review_comment" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "repository_webhook" ADD CONSTRAINT "repository_webhook_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_run" ADD CONSTRAINT "review_run_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_run" ADD CONSTRAINT "review_run_pull_request_id_pull_request_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_event_receipt" ADD CONSTRAINT "webhook_event_receipt_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "repository_webhook_repo_provider_hook_idx" ON "repository_webhook" USING btree ("repository_id","provider_id","provider_webhook_id");--> statement-breakpoint
CREATE INDEX "repository_webhook_repository_id_idx" ON "repository_webhook" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "repository_webhook_provider_id_idx" ON "repository_webhook" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "review_run_repository_id_idx" ON "review_run" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "review_run_pull_request_id_idx" ON "review_run" USING btree ("pull_request_id");--> statement-breakpoint
CREATE INDEX "review_run_status_idx" ON "review_run" USING btree ("status");--> statement-breakpoint
CREATE INDEX "review_run_created_at_idx" ON "review_run" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_run_provider_delivery_kind_idx" ON "review_run" USING btree ("provider_id","provider_delivery_id","review_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_event_receipt_provider_delivery_idx" ON "webhook_event_receipt" USING btree ("provider_id","delivery_id");--> statement-breakpoint
CREATE INDEX "webhook_event_receipt_repository_id_idx" ON "webhook_event_receipt" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "webhook_event_receipt_event_idx" ON "webhook_event_receipt" USING btree ("event");--> statement-breakpoint
CREATE INDEX "webhook_event_receipt_status_idx" ON "webhook_event_receipt" USING btree ("status");--> statement-breakpoint
ALTER TABLE "pre_merge_check_run" ADD CONSTRAINT "pre_merge_check_run_review_run_id_review_run_id_fk" FOREIGN KEY ("review_run_id") REFERENCES "public"."review_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comment" ADD CONSTRAINT "review_comment_review_run_id_review_run_id_fk" FOREIGN KEY ("review_run_id") REFERENCES "public"."review_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pre_merge_check_run_review_run_id_idx" ON "pre_merge_check_run" USING btree ("review_run_id");--> statement-breakpoint
CREATE INDEX "review_comment_review_run_id_idx" ON "review_comment" USING btree ("review_run_id");--> statement-breakpoint
CREATE INDEX "review_comment_file_path_idx" ON "review_comment" USING btree ("file_path");