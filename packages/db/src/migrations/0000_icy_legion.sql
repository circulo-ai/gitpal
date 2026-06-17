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
CREATE TABLE "user_llm_api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"name" text NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"key_preview" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"force_direct" boolean DEFAULT false NOT NULL,
	"allowed_models" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"base_url" text,
	"last_validated_at" timestamp,
	"last_validation_status" text,
	"last_validation_error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_llm_routing_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"default_router" text DEFAULT 'ai-gateway' NOT NULL,
	"fallback_router" text,
	"prefer_user_keys" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apikey" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text DEFAULT 'default' NOT NULL,
	"name" text,
	"start" text,
	"prefix" text,
	"key" text NOT NULL,
	"reference_id" text NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp,
	"enabled" boolean DEFAULT true NOT NULL,
	"rate_limit_enabled" boolean DEFAULT true NOT NULL,
	"rate_limit_time_window" integer,
	"rate_limit_max" integer,
	"request_count" integer DEFAULT 0 NOT NULL,
	"remaining" integer,
	"last_request" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "enterprise_git_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"api_base_url" text NOT NULL,
	"client_id" text NOT NULL,
	"encrypted_client_secret" text NOT NULL,
	"github_app_name" text,
	"github_app_client_id" text,
	"webhook_secret" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"inviter_id" text,
	"organization_id" text NOT NULL,
	"team_id" text,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_role" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"permission" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"active_organization_id" text,
	"active_team_id" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sso_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"oidc_config" text,
	"saml_config" text,
	"user_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"organization_id" text,
	"domain" text NOT NULL,
	"domain_verified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sso_provider_provider_id_unique" UNIQUE("provider_id")
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_member" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"available_balance_cents" integer DEFAULT 0 NOT NULL,
	"total_deposited_cents" integer DEFAULT 0 NOT NULL,
	"total_credited_cents" integer DEFAULT 0 NOT NULL,
	"total_revenue_cents" integer DEFAULT 0 NOT NULL,
	"total_spent_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_ledger_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"balance_after_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"description" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_topup" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL,
	"user_id" text NOT NULL,
	"provider" text DEFAULT 'nowpayments' NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"order_id" text NOT NULL,
	"price_amount_usd_cents" integer NOT NULL,
	"price_currency" text DEFAULT 'usd' NOT NULL,
	"pay_currency" text,
	"pay_amount" text,
	"actually_paid" text,
	"outcome_amount" text,
	"outcome_currency" text,
	"pay_address" text,
	"payin_extra_id" text,
	"payin_hash" text,
	"payout_hash" text,
	"provider_invoice_id" text,
	"provider_payment_id" text,
	"provider_purchase_id" text,
	"provider_status" text,
	"invoice_url" text,
	"success_url" text,
	"cancel_url" text,
	"partially_paid_url" text,
	"revenue_amount_cents" integer DEFAULT 0 NOT NULL,
	"credited_amount_cents" integer DEFAULT 0 NOT NULL,
	"credited_at" timestamp,
	"external_created_at" timestamp,
	"external_updated_at" timestamp,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_base_learning" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"pull_request_id" text,
	"title" text NOT NULL,
	"source" text DEFAULT 'review' NOT NULL,
	"mcp_server" text,
	"tool_name" text,
	"times_applied" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_applied_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "organization_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"settings" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pre_merge_check_run" (
	"id" text PRIMARY KEY NOT NULL,
	"review_run_id" text,
	"repository_id" text NOT NULL,
	"pull_request_id" text,
	"check_name" text NOT NULL,
	"check_type" text DEFAULT 'built-in' NOT NULL,
	"status" text DEFAULT 'passed' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "pull_request" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"provider_pull_request_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"state" text NOT NULL,
	"draft" boolean DEFAULT false NOT NULL,
	"html_url" text NOT NULL,
	"source_branch" text NOT NULL,
	"target_branch" text NOT NULL,
	"author_login" text,
	"author_name" text,
	"author_avatar_url" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"merged_at" timestamp,
	"closed_at" timestamp,
	"first_human_review_at" timestamp,
	"last_human_review_at" timestamp,
	"last_commit_at" timestamp,
	"review_ready_at" timestamp,
	"merge_commit_sha" text
);
--> statement-breakpoint
CREATE TABLE "report_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"repository_id" text,
	"report_name" text NOT NULL,
	"report_type" text DEFAULT 'scheduled' NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"status" text DEFAULT 'delivered' NOT NULL,
	"delivered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"provider_type" text NOT NULL,
	"provider_name" text NOT NULL,
	"repository_id" text NOT NULL,
	"repository_path" text NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"html_url" text NOT NULL,
	"default_branch" text NOT NULL,
	"private" boolean DEFAULT true NOT NULL,
	"description" text,
	"owner_login" text,
	"owner_avatar_url" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"sync_state" text DEFAULT 'synced' NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_access" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"use_organization_settings" boolean DEFAULT true NOT NULL,
	"settings" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_webhook" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"provider_webhook_id" text NOT NULL,
	"delivery_url" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"secret_preview" text,
	"verified_at" timestamp,
	"last_delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"review_run_id" text,
	"pull_request_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"provider_comment_id" text,
	"author_type" text DEFAULT 'ai' NOT NULL,
	"author_login" text,
	"severity" text DEFAULT 'medium' NOT NULL,
	"category" text DEFAULT 'maintainability' NOT NULL,
	"title" text,
	"body" text,
	"file_path" text,
	"line" integer,
	"start_line" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"accepted" boolean DEFAULT false NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_run" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"pull_request_id" text,
	"review_kind" text DEFAULT 'review' NOT NULL,
	"trigger" text DEFAULT 'pull_request' NOT NULL,
	"provider_id" text NOT NULL,
	"provider_delivery_id" text,
	"provider_event" text,
	"provider_action" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"model_id" text,
	"thinking_enabled" boolean DEFAULT false NOT NULL,
	"summary" text,
	"final_comment_body" text,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_finding" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"pull_request_id" text,
	"tool_name" text NOT NULL,
	"tool_type" text DEFAULT 'other' NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"file_path" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "webhook_event_receipt" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text,
	"provider_id" text NOT NULL,
	"delivery_id" text NOT NULL,
	"repository_path" text,
	"event" text NOT NULL,
	"action" text,
	"status" text DEFAULT 'received' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_pull_request_id_pull_request_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation" ADD CONSTRAINT "ai_generation_review_run_id_review_run_id_fk" FOREIGN KEY ("review_run_id") REFERENCES "public"."review_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_llm_api_key" ADD CONSTRAINT "user_llm_api_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_llm_routing_settings" ADD CONSTRAINT "user_llm_routing_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_role" ADD CONSTRAINT "organization_role_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_organization_id_organization_id_fk" FOREIGN KEY ("active_organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_team_id_team_id_fk" FOREIGN KEY ("active_team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger_entry" ADD CONSTRAINT "wallet_ledger_entry_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger_entry" ADD CONSTRAINT "wallet_ledger_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_topup" ADD CONSTRAINT "wallet_topup_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_topup" ADD CONSTRAINT "wallet_topup_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_learning" ADD CONSTRAINT "knowledge_base_learning_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_learning" ADD CONSTRAINT "knowledge_base_learning_pull_request_id_pull_request_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_merge_check_run" ADD CONSTRAINT "pre_merge_check_run_review_run_id_review_run_id_fk" FOREIGN KEY ("review_run_id") REFERENCES "public"."review_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_merge_check_run" ADD CONSTRAINT "pre_merge_check_run_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_merge_check_run" ADD CONSTRAINT "pre_merge_check_run_pull_request_id_pull_request_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_request" ADD CONSTRAINT "pull_request_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_delivery" ADD CONSTRAINT "report_delivery_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_delivery" ADD CONSTRAINT "report_delivery_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository" ADD CONSTRAINT "repository_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_access" ADD CONSTRAINT "repository_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_access" ADD CONSTRAINT "repository_access_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_settings" ADD CONSTRAINT "repository_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_settings" ADD CONSTRAINT "repository_settings_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_webhook" ADD CONSTRAINT "repository_webhook_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comment" ADD CONSTRAINT "review_comment_review_run_id_review_run_id_fk" FOREIGN KEY ("review_run_id") REFERENCES "public"."review_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comment" ADD CONSTRAINT "review_comment_pull_request_id_pull_request_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comment" ADD CONSTRAINT "review_comment_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_run" ADD CONSTRAINT "review_run_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_run" ADD CONSTRAINT "review_run_pull_request_id_pull_request_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_finding" ADD CONSTRAINT "tool_finding_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_finding" ADD CONSTRAINT "tool_finding_pull_request_id_pull_request_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_event_receipt" ADD CONSTRAINT "webhook_event_receipt_repository_id_repository_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repository"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_generation_provider_generation_id_idx" ON "ai_generation" USING btree ("provider_generation_id");--> statement-breakpoint
CREATE INDEX "ai_generation_user_id_idx" ON "ai_generation" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_generation_repository_id_idx" ON "ai_generation" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "ai_generation_pull_request_id_idx" ON "ai_generation" USING btree ("pull_request_id");--> statement-breakpoint
CREATE INDEX "ai_generation_review_run_id_idx" ON "ai_generation" USING btree ("review_run_id");--> statement-breakpoint
CREATE INDEX "ai_generation_call_kind_idx" ON "ai_generation" USING btree ("call_kind");--> statement-breakpoint
CREATE INDEX "ai_generation_status_idx" ON "ai_generation" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_generation_created_at_idx" ON "ai_generation" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_llm_api_key_user_id_idx" ON "user_llm_api_key" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_llm_api_key_provider_id_idx" ON "user_llm_api_key" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "user_llm_api_key_enabled_idx" ON "user_llm_api_key" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "user_llm_routing_settings_user_id_idx" ON "user_llm_routing_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "apikey_reference_id_idx" ON "apikey" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "apikey_config_id_idx" ON "apikey" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "apikey_key_idx" ON "apikey" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "enterprise_git_provider_type_base_url_idx" ON "enterprise_git_provider" USING btree ("type","base_url");--> statement-breakpoint
CREATE INDEX "enterprise_git_provider_base_url_idx" ON "enterprise_git_provider" USING btree ("base_url");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "invitation_organization_id_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_org_email_idx" ON "invitation" USING btree ("organization_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "member_user_organization_idx" ON "member" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "member_user_id_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "member_organization_id_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_idx" ON "organization" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_role_organization_role_idx" ON "organization_role" USING btree ("organization_id","role");--> statement-breakpoint
CREATE INDEX "organization_role_organization_id_idx" ON "organization_role" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_key_idx" ON "rate_limit" USING btree ("key");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sso_provider_userId_idx" ON "sso_provider" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sso_provider_domain_idx" ON "sso_provider" USING btree ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX "team_organization_name_idx" ON "team" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "team_organization_id_idx" ON "team" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_member_team_user_idx" ON "team_member" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE INDEX "team_member_team_id_idx" ON "team_member" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_member_user_id_idx" ON "team_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_user_id_idx" ON "wallet" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wallet_currency_idx" ON "wallet" USING btree ("currency");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_ledger_source_idx" ON "wallet_ledger_entry" USING btree ("source_type","source_id","type");--> statement-breakpoint
CREATE INDEX "wallet_ledger_wallet_id_idx" ON "wallet_ledger_entry" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "wallet_ledger_user_id_idx" ON "wallet_ledger_entry" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wallet_ledger_created_at_idx" ON "wallet_ledger_entry" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_topup_order_id_idx" ON "wallet_topup" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_topup_provider_invoice_id_idx" ON "wallet_topup" USING btree ("provider_invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_topup_provider_payment_id_idx" ON "wallet_topup" USING btree ("provider_payment_id");--> statement-breakpoint
CREATE INDEX "wallet_topup_wallet_id_idx" ON "wallet_topup" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "wallet_topup_user_id_idx" ON "wallet_topup" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wallet_topup_status_idx" ON "wallet_topup" USING btree ("status");--> statement-breakpoint
CREATE INDEX "knowledge_base_learning_repository_id_idx" ON "knowledge_base_learning" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "knowledge_base_learning_created_at_idx" ON "knowledge_base_learning" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "knowledge_base_learning_mcp_server_idx" ON "knowledge_base_learning" USING btree ("mcp_server");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_settings_organization_id_idx" ON "organization_settings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "pre_merge_check_run_review_run_id_idx" ON "pre_merge_check_run" USING btree ("review_run_id");--> statement-breakpoint
CREATE INDEX "pre_merge_check_run_repository_id_idx" ON "pre_merge_check_run" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "pre_merge_check_run_started_at_idx" ON "pre_merge_check_run" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "pre_merge_check_run_status_idx" ON "pre_merge_check_run" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "pull_request_repository_number_idx" ON "pull_request" USING btree ("repository_id","number");--> statement-breakpoint
CREATE INDEX "pull_request_repository_id_idx" ON "pull_request" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "pull_request_state_idx" ON "pull_request" USING btree ("state");--> statement-breakpoint
CREATE INDEX "pull_request_merged_at_idx" ON "pull_request" USING btree ("merged_at");--> statement-breakpoint
CREATE INDEX "report_delivery_user_id_idx" ON "report_delivery" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "report_delivery_repository_id_idx" ON "report_delivery" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "report_delivery_delivered_at_idx" ON "report_delivery" USING btree ("delivered_at");--> statement-breakpoint
CREATE UNIQUE INDEX "repository_organization_provider_repository_idx" ON "repository" USING btree ("organization_id","provider_id","repository_id");--> statement-breakpoint
CREATE INDEX "repository_organization_id_idx" ON "repository" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "repository_provider_path_idx" ON "repository" USING btree ("organization_id","provider_id","repository_path");--> statement-breakpoint
CREATE INDEX "repository_enabled_idx" ON "repository" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "repository_access_user_repository_idx" ON "repository_access" USING btree ("user_id","repository_id");--> statement-breakpoint
CREATE INDEX "repository_access_user_id_idx" ON "repository_access" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "repository_access_repository_id_idx" ON "repository_access" USING btree ("repository_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repository_settings_org_repository_idx" ON "repository_settings" USING btree ("organization_id","repository_id");--> statement-breakpoint
CREATE INDEX "repository_settings_repository_id_idx" ON "repository_settings" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "repository_settings_organization_id_idx" ON "repository_settings" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repository_webhook_repo_provider_hook_idx" ON "repository_webhook" USING btree ("repository_id","provider_id","provider_webhook_id");--> statement-breakpoint
CREATE INDEX "repository_webhook_repository_id_idx" ON "repository_webhook" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "repository_webhook_provider_id_idx" ON "repository_webhook" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "review_comment_review_run_id_idx" ON "review_comment" USING btree ("review_run_id");--> statement-breakpoint
CREATE INDEX "review_comment_repository_id_idx" ON "review_comment" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "review_comment_pull_request_id_idx" ON "review_comment" USING btree ("pull_request_id");--> statement-breakpoint
CREATE INDEX "review_comment_created_at_idx" ON "review_comment" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "review_comment_severity_idx" ON "review_comment" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "review_comment_category_idx" ON "review_comment" USING btree ("category");--> statement-breakpoint
CREATE INDEX "review_comment_file_path_idx" ON "review_comment" USING btree ("file_path");--> statement-breakpoint
CREATE INDEX "review_run_repository_id_idx" ON "review_run" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "review_run_pull_request_id_idx" ON "review_run" USING btree ("pull_request_id");--> statement-breakpoint
CREATE INDEX "review_run_status_idx" ON "review_run" USING btree ("status");--> statement-breakpoint
CREATE INDEX "review_run_created_at_idx" ON "review_run" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_run_provider_delivery_kind_idx" ON "review_run" USING btree ("provider_id","provider_delivery_id","review_kind");--> statement-breakpoint
CREATE INDEX "tool_finding_repository_id_idx" ON "tool_finding" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "tool_finding_pull_request_id_idx" ON "tool_finding" USING btree ("pull_request_id");--> statement-breakpoint
CREATE INDEX "tool_finding_created_at_idx" ON "tool_finding" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tool_finding_severity_idx" ON "tool_finding" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "tool_finding_tool_type_idx" ON "tool_finding" USING btree ("tool_type");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_event_receipt_provider_delivery_idx" ON "webhook_event_receipt" USING btree ("provider_id","delivery_id");--> statement-breakpoint
CREATE INDEX "webhook_event_receipt_repository_id_idx" ON "webhook_event_receipt" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "webhook_event_receipt_event_idx" ON "webhook_event_receipt" USING btree ("event");--> statement-breakpoint
CREATE INDEX "webhook_event_receipt_status_idx" ON "webhook_event_receipt" USING btree ("status");