ALTER TABLE "notification_channel" ADD COLUMN "target_id" text;--> statement-breakpoint
WITH "ranked_user_llm_api_key" AS (
	SELECT
		"id",
		"name",
		row_number() OVER (
			PARTITION BY "user_id", "provider_id", "name"
			ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
		) AS "duplicate_rank"
	FROM "user_llm_api_key"
)
UPDATE "user_llm_api_key"
SET
	"name" = "ranked_user_llm_api_key"."name" || ' (' || "ranked_user_llm_api_key"."duplicate_rank" || ')',
	"updated_at" = now()
FROM "ranked_user_llm_api_key"
WHERE
	"user_llm_api_key"."id" = "ranked_user_llm_api_key"."id"
	AND "ranked_user_llm_api_key"."duplicate_rank" > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "user_llm_api_key_user_provider_name_idx" ON "user_llm_api_key" USING btree ("user_id","provider_id","name");--> statement-breakpoint
CREATE INDEX "notification_channel_target_idx" ON "notification_channel" USING btree ("provider","target_id");--> statement-breakpoint
WITH "ranked_notification_delivery" AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "notification_id", "channel_id"
			ORDER BY "delivered_at" DESC NULLS LAST, "created_at" DESC, "id" DESC
		) AS "duplicate_rank"
	FROM "notification_delivery"
	WHERE "channel_id" IS NOT NULL
)
DELETE FROM "notification_delivery"
USING "ranked_notification_delivery"
WHERE
	"notification_delivery"."id" = "ranked_notification_delivery"."id"
	AND "ranked_notification_delivery"."duplicate_rank" > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_delivery_notification_channel_idx" ON "notification_delivery" USING btree ("notification_id","channel_id");
