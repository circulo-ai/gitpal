DROP TABLE IF EXISTS "rate_limit";
--> statement-breakpoint
CREATE TABLE "rate_limit" (
    "id" text PRIMARY KEY NOT NULL,
    "key" text NOT NULL,
    "count" integer DEFAULT 0 NOT NULL,
    "last_request" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_key_idx" ON "rate_limit" USING btree ("key");
--> statement-breakpoint
ALTER TABLE "rate_limit" ADD CONSTRAINT "rate_limit_key_unique" UNIQUE("key");