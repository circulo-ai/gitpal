CREATE TABLE "issue" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"provider_issue_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"state" text NOT NULL,
	"html_url" text NOT NULL,
	"author_login" text,
	"author_name" text,
	"author_avatar_url" text,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "review_run_step" (
	"id" text PRIMARY KEY NOT NULL,
	"review_run_id" text NOT NULL,
	"parent_step_id" text,
	"step_key" text NOT NULL,
	"position" integer NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_generation" ADD COLUMN "issue_id" text;--> statement-breakpoint
ALTER TABLE "review_run" ADD COLUMN "issue_id" text;--> statement-breakpoint
ALTER TABLE "review_run" ADD COLUMN "requested_by_user_id" text;--> statement-breakpoint
ALTER TABLE "review_run" ADD COLUMN "retry_of_run_id" text;--> statement-breakpoint
ALTER TABLE "review_run" ADD COLUMN "trace_id" text;--> statement-breakpoint
ALTER TABLE "observability_event" ADD COLUMN "issue_id" text;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_run_step" ADD CONSTRAINT "review_run_step_review_run_id_review_run_id_fk" FOREIGN KEY ("review_run_id") REFERENCES "public"."review_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_repository_number_idx" ON "issue" USING btree ("repository_id","number");--> statement-breakpoint
CREATE INDEX "issue_repository_id_idx" ON "issue" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "issue_state_idx" ON "issue" USING btree ("state");--> statement-breakpoint
CREATE INDEX "issue_updated_at_idx" ON "issue" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_run_step_run_key_attempt_idx" ON "review_run_step" USING btree ("review_run_id","step_key","attempt");--> statement-breakpoint
CREATE INDEX "review_run_step_run_position_idx" ON "review_run_step" USING btree ("review_run_id","position");--> statement-breakpoint
CREATE INDEX "review_run_step_status_idx" ON "review_run_step" USING btree ("status");--> statement-breakpoint
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_run" ADD CONSTRAINT "review_run_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_run" ADD CONSTRAINT "review_run_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observability_event" ADD CONSTRAINT "observability_event_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_generation_issue_id_idx" ON "ai_generation" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "review_run_issue_id_idx" ON "review_run" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "review_run_trace_id_idx" ON "review_run" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "review_run_retry_of_run_id_idx" ON "review_run" USING btree ("retry_of_run_id");--> statement-breakpoint
CREATE INDEX "observability_event_issue_idx" ON "observability_event" USING btree ("issue_id");