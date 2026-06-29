import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const skipEnvValidation = ["1", "true"].includes(
	process.env.SKIP_ENV_VALIDATION?.trim().toLowerCase() ?? "",
);

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		BETTER_AUTH_COOKIE_DOMAIN: z.string().min(1).optional(),
		CORS_ORIGIN: z.url(),
		NEXT_PUBLIC_SERVER_URL: z.url(),
		GITPAL_CLOUD_BILLING_ENABLED: z.stringbool().default(false),
		LOG_LEVEL: z
			.enum(["fatal", "error", "warn", "info", "debug", "trace"])
			.default("info"),
		PORT: z.coerce.number().int().positive().default(3000),
		HTTP_MAX_REQUEST_BODY_BYTES: z.coerce
			.number()
			.int()
			.positive()
			.default(5 * 1024 * 1024),
		TRUST_PROXY_HEADERS: z.stringbool().default(false),
		GITPAL_DB_POOL_MAX: z.coerce.number().int().positive().default(10),
		GITPAL_DB_POOL_IDLE_TIMEOUT_MS: z.coerce
			.number()
			.int()
			.positive()
			.default(30_000),
		GITPAL_DB_POOL_CONNECTION_TIMEOUT_MS: z.coerce
			.number()
			.int()
			.positive()
			.default(10_000),
		REDIS_URL: z.url().default("redis://localhost:6379"),
		GITPAL_QUEUE_PREFIX: z.string().min(1).default("gitpal"),
		GITPAL_CHAT_STATE_KEY_PREFIX: z.string().min(1).default("gitpal:chat"),
		GITPAL_CHAT_REDIS_URL: z.url().optional(),
		GITPAL_QUEUE_PRODUCER_MAX_RETRIES_PER_REQUEST: z.coerce
			.number()
			.int()
			.min(0)
			.default(3),
		GITPAL_QUEUE_JOB_ATTEMPTS: z.coerce.number().int().min(1).default(5),
		GITPAL_QUEUE_JOB_BACKOFF_MS: z.coerce
			.number()
			.int()
			.positive()
			.default(1_000),
		GITPAL_QUEUE_REMOVE_ON_COMPLETE: z.coerce
			.number()
			.int()
			.min(0)
			.default(1_000),
		GITPAL_QUEUE_REMOVE_ON_FAIL: z.coerce.number().int().min(0).default(5_000),
		GITPAL_PROVIDER_WEBHOOK_WORKER_CONCURRENCY: z.coerce
			.number()
			.int()
			.min(1)
			.default(5),
		GITPAL_PROVIDER_WEBHOOK_QUEUE_RATE_LIMIT_MAX: z.coerce
			.number()
			.int()
			.min(0)
			.default(0),
		GITPAL_PROVIDER_WEBHOOK_QUEUE_RATE_LIMIT_DURATION_MS: z.coerce
			.number()
			.int()
			.min(1_000)
			.default(1000),
		GITPAL_REPO_SYNC_ACCOUNT_CONCURRENCY: z.coerce
			.number()
			.int()
			.min(1)
			.default(4),
		GITPAL_REPO_SYNC_USER_CONCURRENCY: z.coerce
			.number()
			.int()
			.min(1)
			.default(1),
		GITPAL_REPO_SYNC_THROTTLE_LIMIT: z.coerce.number().int().min(1).default(20),
		GITPAL_REPO_SYNC_THROTTLE_PERIOD_SECONDS: z.coerce
			.number()
			.int()
			.min(1)
			.default(60),
		GITPAL_REPO_SYNC_RATE_LIMIT: z.coerce.number().int().min(1).default(120),
		GITPAL_REPO_SYNC_RATE_LIMIT_PERIOD_SECONDS: z.coerce
			.number()
			.int()
			.min(1)
			.default(3600),
		GITPAL_AI_WORKFLOW_ACCOUNT_CONCURRENCY: z.coerce
			.number()
			.int()
			.min(1)
			.default(4),
		GITPAL_AI_WORKFLOW_REPOSITORY_CONCURRENCY: z.coerce
			.number()
			.int()
			.min(1)
			.default(1),
		GITPAL_AI_WORKFLOW_THROTTLE_LIMIT: z.coerce
			.number()
			.int()
			.min(1)
			.default(30),
		GITPAL_AI_WORKFLOW_THROTTLE_PERIOD_SECONDS: z.coerce
			.number()
			.int()
			.min(1)
			.default(60),
		AI_GATEWAY_API_KEY: z.string().optional(),
		OPENROUTER_API_KEY: z.string().optional(),
		OPENROUTER_BASE_URL: z.url().default("https://openrouter.ai/api/v1"),
		OLLAMA_API_KEY: z.string().optional(),
		OLLAMA_BASE_URL: z.url().default("http://localhost:11434/api"),
		GITPAL_AI_MODEL: z.string().default("anthropic/claude-sonnet-4.6"),
		GITPAL_WEBHOOK_BASE_URL: z.url().optional(),
		GITPAL_WALLET_REVENUE_SHARE_PERCENT: z.coerce
			.number()
			.min(0)
			.max(100)
			.default(5),
		GITHUB_CLIENT_ID: z.string().optional(),
		GITHUB_CLIENT_SECRET: z.string().optional(),
		GITHUB_APP_ID: z.string().optional(),
		GITHUB_APP_PRIVATE_KEY: z.string().optional(),
		GITHUB_WEBHOOK_SECRET: z.string().optional(),
		GITLAB_CLIENT_ID: z.string().optional(),
		GITLAB_CLIENT_SECRET: z.string().optional(),
		GITLAB_WEBHOOK_SIGNING_SECRET: z.string().optional(),
		GITLAB_WEBHOOK_SECRET: z.string().optional(),
		NOTION_OAUTH_CLIENT_ID: z.string().optional(),
		NOTION_OAUTH_CLIENT_SECRET: z.string().optional(),
		LINEAR_OAUTH_CLIENT_ID: z.string().optional(),
		LINEAR_OAUTH_CLIENT_SECRET: z.string().optional(),
		TELEGRAM_BOT_TOKEN: z.string().optional(),
		TELEGRAM_WEBHOOK_SECRET_TOKEN: z.string().optional(),
		TELEGRAM_BOT_USERNAME: z.string().optional(),
		SLACK_BOT_TOKEN: z.string().optional(),
		SLACK_SIGNING_SECRET: z.string().optional(),
		SLACK_CLIENT_ID: z.string().optional(),
		SLACK_CLIENT_SECRET: z.string().optional(),
		SLACK_ENCRYPTION_KEY: z.string().optional(),
		SLACK_BOT_USERNAME: z.string().optional(),
		TEAMS_APP_ID: z.string().optional(),
		TEAMS_APP_PASSWORD: z.string().optional(),
		TEAMS_APP_TENANT_ID: z.string().optional(),
		TEAMS_BOT_USERNAME: z.string().optional(),
		LINEAR_API_KEY: z.string().optional(),
		LINEAR_ACCESS_TOKEN: z.string().optional(),
		LINEAR_CLIENT_ID: z.string().optional(),
		LINEAR_CLIENT_SECRET: z.string().optional(),
		LINEAR_WEBHOOK_SECRET: z.string().optional(),
		LINEAR_BOT_USERNAME: z.string().optional(),
		RESEND_API_KEY: z.string().optional(),
		RESEND_WEBHOOK_SECRET: z.string().optional(),
		RESEND_FROM_ADDRESS: z.string().optional(),
		RESEND_FROM_NAME: z.string().optional(),
		NOWPAYMENTS_API_BASE_URL: z.url().default("https://api.nowpayments.io"),
		NOWPAYMENTS_API_KEY: z.string().optional(),
		NOWPAYMENTS_IPN_SECRET: z.string().optional(),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		INNGEST_BASE_URL: z.url().optional(),
		INNGEST_DEV: z.stringbool().default(true),
		INNGEST_EVENT_KEY: z.string().trim().min(32).optional(),
		INNGEST_SIGNING_KEY: z.string().trim().min(32).optional(),
	},
	runtimeEnv: process.env,
	skipValidation: skipEnvValidation,
	emptyStringAsUndefined: true,
});
