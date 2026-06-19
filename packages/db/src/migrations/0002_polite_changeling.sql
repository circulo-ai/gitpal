CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"repository_id" text,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"status" text DEFAULT 'unread' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"action_href" text,
	"source_type" text,
	"source_id" text,
	"dedupe_key" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observability_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"repository_id" text,
	"pull_request_id" text,
	"review_run_id" text,
	"trace_id" text,
	"parent_event_id" text,
	"kind" text NOT NULL,
	"action" text NOT NULL,
	"status" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"source_type" text,
	"source_id" text,
	"dedupe_key" text,
	"duration_ms" integer,
	"cost_cents" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observability_event" ADD CONSTRAINT "observability_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observability_event" ADD CONSTRAINT "observability_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observability_event" ADD CONSTRAINT "observability_event_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observability_event" ADD CONSTRAINT "observability_event_pull_request_id_pull_request_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observability_event" ADD CONSTRAINT "observability_event_review_run_id_review_run_id_fk" FOREIGN KEY ("review_run_id") REFERENCES "public"."review_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_user_created_idx" ON "notification" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_user_status_idx" ON "notification" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "notification_organization_idx" ON "notification" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notification_repository_idx" ON "notification" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "notification_category_idx" ON "notification" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_dedupe_key_idx" ON "notification" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "observability_event_user_occurred_idx" ON "observability_event" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "observability_event_organization_idx" ON "observability_event" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "observability_event_repository_idx" ON "observability_event" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "observability_event_pull_request_idx" ON "observability_event" USING btree ("pull_request_id");--> statement-breakpoint
CREATE INDEX "observability_event_review_run_idx" ON "observability_event" USING btree ("review_run_id");--> statement-breakpoint
CREATE INDEX "observability_event_trace_idx" ON "observability_event" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "observability_event_kind_idx" ON "observability_event" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "observability_event_status_idx" ON "observability_event" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "observability_event_dedupe_key_idx" ON "observability_event" USING btree ("dedupe_key");