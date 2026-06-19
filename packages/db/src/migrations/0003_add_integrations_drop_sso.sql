CREATE TABLE "integration_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"provider_type" text NOT NULL,
	"label" text NOT NULL,
	"server_url" text,
	"usage_guidance" text,
	"auth_method" text NOT NULL,
	"credential_envelope" text,
	"header_preview" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'configured' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"rate_limit_window_seconds" integer DEFAULT 60 NOT NULL,
	"rate_limit_max_requests" integer DEFAULT 30 NOT NULL,
	"connected_by_user_id" text,
	"last_validated_at" timestamp,
	"last_used_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_oauth_state" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"state" text NOT NULL,
	"code_verifier" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"return_to" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "integration_oauth_state_state_unique" UNIQUE("state")
);
--> statement-breakpoint
ALTER TABLE "integration_connection" ADD CONSTRAINT "integration_connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connection" ADD CONSTRAINT "integration_connection_connected_by_user_id_user_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_oauth_state" ADD CONSTRAINT "integration_oauth_state_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_oauth_state" ADD CONSTRAINT "integration_oauth_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connection_org_provider_label_idx" ON "integration_connection" USING btree ("organization_id","provider_id","label");--> statement-breakpoint
CREATE INDEX "integration_connection_organization_id_idx" ON "integration_connection" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "integration_connection_provider_type_idx" ON "integration_connection" USING btree ("provider_type");--> statement-breakpoint
CREATE INDEX "integration_connection_status_idx" ON "integration_connection" USING btree ("status");--> statement-breakpoint
CREATE INDEX "integration_oauth_state_organization_id_idx" ON "integration_oauth_state" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "integration_oauth_state_user_id_idx" ON "integration_oauth_state" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "integration_oauth_state_expires_at_idx" ON "integration_oauth_state" USING btree ("expires_at");--> statement-breakpoint
DROP TABLE IF EXISTS "sso_provider";
