CREATE TABLE "provider_workspace_member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"provider_type" text NOT NULL,
	"provider_member_id" text NOT NULL,
	"login" text,
	"name" text,
	"email" text,
	"avatar_url" text,
	"html_url" text,
	"role" text DEFAULT 'member' NOT NULL,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_workspace_member" ADD CONSTRAINT "provider_workspace_member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_workspace_member_org_provider_member_idx" ON "provider_workspace_member" USING btree ("organization_id","provider_id","provider_member_id");--> statement-breakpoint
CREATE INDEX "provider_workspace_member_organization_id_idx" ON "provider_workspace_member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "provider_workspace_member_provider_login_idx" ON "provider_workspace_member" USING btree ("provider_id","login");--> statement-breakpoint
CREATE INDEX "provider_workspace_member_role_idx" ON "provider_workspace_member" USING btree ("role");