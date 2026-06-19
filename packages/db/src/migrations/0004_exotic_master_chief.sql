CREATE TABLE "notification_channel" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"provider" text NOT NULL,
	"label" text NOT NULL,
	"target_preview" text,
	"credential_envelope" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'configured' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_tested_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"notification_id" text NOT NULL,
	"channel_id" text,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_channel" ADD CONSTRAINT "notification_channel_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_channel" ADD CONSTRAINT "notification_channel_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_notification_id_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notification"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_channel_id_notification_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."notification_channel"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_channel_user_provider_label_idx" ON "notification_channel" USING btree ("user_id","provider","label");--> statement-breakpoint
CREATE INDEX "notification_channel_user_idx" ON "notification_channel" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_channel_organization_idx" ON "notification_channel" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notification_channel_provider_idx" ON "notification_channel" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "notification_channel_status_idx" ON "notification_channel" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notification_delivery_notification_idx" ON "notification_delivery" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "notification_delivery_channel_idx" ON "notification_delivery" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "notification_delivery_status_idx" ON "notification_delivery" USING btree ("status");