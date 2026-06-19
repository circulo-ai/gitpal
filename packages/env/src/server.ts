import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		CORS_ORIGIN: z.url(),
		NEXT_PUBLIC_SERVER_URL: z.url(),
		LOG_LEVEL: z
			.enum(["fatal", "error", "warn", "info", "debug", "trace"])
			.default("info"),
		PORT: z.coerce.number().int().positive().default(3000),
		HTTP_MAX_REQUEST_BODY_BYTES: z.coerce
			.number()
			.int()
			.positive()
			.default(5 * 1024 * 1024),
		TRUST_PROXY_HEADERS: z.coerce.boolean().default(false),
		REDIS_URL: z.url().default("redis://localhost:6379"),
		GITPAL_QUEUE_PREFIX: z.string().min(1).default("gitpal"),
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
			.min(1)
			.default(5),
		GITPAL_PROVIDER_WEBHOOK_QUEUE_RATE_LIMIT_MAX: z.coerce
			.number()
			.min(0)
			.default(0),
		GITPAL_PROVIDER_WEBHOOK_QUEUE_RATE_LIMIT_DURATION_MS: z.coerce
			.number()
			.min(0)
			.default(1000),
		REDIS_URI: z.url().default("redis://localhost:6379"),
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
		NOWPAYMENTS_API_BASE_URL: z.url().default("https://api.nowpayments.io"),
		NOWPAYMENTS_API_KEY: z.string().optional(),
		NOWPAYMENTS_IPN_SECRET: z.string().optional(),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		INNGEST_BASE_URL: z.url().optional(),
		INNGEST_EVENT_KEY: z.string().min(32).optional(),
		INNGEST_SIGNING_KEY: z.string().min(32).optional(),
	},
	runtimeEnv: process.env,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
});
