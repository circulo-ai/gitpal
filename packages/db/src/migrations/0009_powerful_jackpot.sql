ALTER TABLE "pull_request" ADD COLUMN "review_state_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "repository" ADD COLUMN "reconcile_state" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "repository" ADD COLUMN "last_reconcile_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "repository" ADD COLUMN "last_reconciled_at" timestamp;--> statement-breakpoint
ALTER TABLE "repository" ADD COLUMN "last_reconcile_failed_at" timestamp;--> statement-breakpoint
ALTER TABLE "repository" ADD COLUMN "last_reconcile_error" text;--> statement-breakpoint
CREATE INDEX "repository_reconcile_state_idx" ON "repository" USING btree ("reconcile_state");--> statement-breakpoint
CREATE INDEX "repository_last_reconciled_at_idx" ON "repository" USING btree ("last_reconciled_at");