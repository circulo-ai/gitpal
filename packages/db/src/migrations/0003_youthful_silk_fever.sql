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
ALTER TABLE "user_llm_api_key" ADD CONSTRAINT "user_llm_api_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_llm_routing_settings" ADD CONSTRAINT "user_llm_routing_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger_entry" ADD CONSTRAINT "wallet_ledger_entry_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger_entry" ADD CONSTRAINT "wallet_ledger_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_topup" ADD CONSTRAINT "wallet_topup_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_topup" ADD CONSTRAINT "wallet_topup_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_llm_api_key_user_id_idx" ON "user_llm_api_key" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_llm_api_key_provider_id_idx" ON "user_llm_api_key" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "user_llm_api_key_enabled_idx" ON "user_llm_api_key" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "user_llm_routing_settings_user_id_idx" ON "user_llm_routing_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "apikey_reference_id_idx" ON "apikey" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "apikey_config_id_idx" ON "apikey" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "apikey_key_idx" ON "apikey" USING btree ("key");--> statement-breakpoint
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
CREATE INDEX "wallet_topup_status_idx" ON "wallet_topup" USING btree ("status");