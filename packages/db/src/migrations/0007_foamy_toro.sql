-- Custom SQL migration file, put your code below! --
--> statement-breakpoint
DO $$ BEGIN
  -- Drop the old primary key on "key" if it exists
  ALTER TABLE "rate_limit" DROP CONSTRAINT IF EXISTS "rate_limit_pkey";
EXCEPTION WHEN others THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  -- Add "id" column only if it doesn't already exist
  ALTER TABLE "rate_limit" ADD COLUMN "id" text NOT NULL DEFAULT gen_random_uuid()::text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rate_limit" ADD PRIMARY KEY ("id");
EXCEPTION WHEN others THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rate_limit" ALTER COLUMN "id" DROP DEFAULT;
EXCEPTION WHEN others THEN NULL;
END $$;