DROP INDEX "knowledge_base_learning_mcp_server_idx";--> statement-breakpoint
ALTER TABLE "pull_request" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "pull_request" ADD COLUMN "approval_state" text;--> statement-breakpoint
ALTER TABLE "knowledge_base_learning" DROP COLUMN "mcp_server";