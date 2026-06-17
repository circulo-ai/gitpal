CREATE TABLE "ai_generation" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"repository_id" text,
	"pull_request_id" text,
	"review_run_id" text,
	"call_kind" text NOT NULL,
	"billing_mode" text NOT NULL,
	"route_id" text NOT NULL,
	"route_label" text,
	"model_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"provider_label" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"input_no_cache_tokens" integer DEFAULT 0 NOT NULL,
	"input_cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"input_cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"output_text_tokens" integer DEFAULT 0 NOT NULL,
	"output_reasoning_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_cents" integer,
	"actual_cost_cents" integer,
	"wallet_debit_cents" integer DEFAULT 0 NOT NULL,
	"wallet_balance_after_cents" integer,
	"provider_generation_id" text,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_pull_request_id_pull_request_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_review_run_id_review_run_id_fk" FOREIGN KEY ("review_run_id") REFERENCES "public"."review_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_generation_provider_generation_id_idx" ON "ai_generation" USING btree ("provider_generation_id");--> statement-breakpoint
CREATE INDEX "ai_generation_user_id_idx" ON "ai_generation" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_generation_repository_id_idx" ON "ai_generation" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "ai_generation_pull_request_id_idx" ON "ai_generation" USING btree ("pull_request_id");--> statement-breakpoint
CREATE INDEX "ai_generation_review_run_id_idx" ON "ai_generation" USING btree ("review_run_id");--> statement-breakpoint
CREATE INDEX "ai_generation_call_kind_idx" ON "ai_generation" USING btree ("call_kind");--> statement-breakpoint
CREATE INDEX "ai_generation_status_idx" ON "ai_generation" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_generation_created_at_idx" ON "ai_generation" USING btree ("created_at");