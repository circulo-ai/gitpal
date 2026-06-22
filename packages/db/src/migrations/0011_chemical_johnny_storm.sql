CREATE TABLE "organization_budget" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"monthly_limit_cents" integer NOT NULL,
	"alert_threshold_percent" integer DEFAULT 80 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_generation" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "repository" ADD COLUMN "last_full_reconciled_at" timestamp;--> statement-breakpoint
ALTER TABLE "repository" ADD COLUMN "incremental_sync_cursor" timestamp;--> statement-breakpoint
ALTER TABLE "repository" ADD COLUMN "next_retry_at" timestamp;--> statement-breakpoint
ALTER TABLE "repository" ADD COLUMN "retry_hint" text;--> statement-breakpoint
ALTER TABLE "repository" ADD COLUMN "webhook_gap_detected_at" timestamp;--> statement-breakpoint
ALTER TABLE "review_run" ADD COLUMN "prompt_version" text;--> statement-breakpoint
ALTER TABLE "review_run" ADD COLUMN "review_template" text;--> statement-breakpoint
ALTER TABLE "review_run" ADD COLUMN "confidence_level" text;--> statement-breakpoint
ALTER TABLE "review_run" ADD COLUMN "confidence_score" integer;--> statement-breakpoint
ALTER TABLE "review_run" ADD COLUMN "confidence_summary" text;--> statement-breakpoint
ALTER TABLE "organization_budget" ADD CONSTRAINT "organization_budget_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_budget_organization_id_idx" ON "organization_budget" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_generation_organization_created_idx" ON "ai_generation" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "repository_incremental_sync_cursor_idx" ON "repository" USING btree ("incremental_sync_cursor");