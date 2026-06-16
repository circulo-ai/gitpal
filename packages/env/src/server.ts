import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		CORS_ORIGIN: z.url(),
		PORT: z.coerce.number().int().positive().default(3000),
		REDIS_URL: z.url().default("redis://localhost:6379"),
		WORKFLOW_REDIS_URI: z.url().default("redis://localhost:6379"),
		WORKFLOW_BASE_URL: z.url().optional(),
		WORKFLOW_TARGET_WORLD: z.string().default("@workflow-worlds/redis"),
		WORKFLOW_REDIS_KEY_PREFIX: z.string().default("gitpal"),
		WORKFLOW_REDIS_CONCURRENCY: z.coerce.number().int().positive().default(20),
		WORKFLOW_REDIS_MAX_RETRIES: z.coerce.number().int().positive().default(3),
		WORKFLOW_REDIS_IDEMPOTENCY_TTL_MS: z.coerce
			.number()
			.int()
			.positive()
			.default(60_000),
		WORKFLOW_REDIS_STREAM_MAX_LEN: z.coerce
			.number()
			.int()
			.positive()
			.default(10_000),
		AI_GATEWAY_API_KEY: z.string().optional(),
		OPENROUTER_API_KEY: z.string().optional(),
		OPENROUTER_BASE_URL: z
			.url()
			.default("https://openrouter.ai/api/v1"),
		GITPAL_AI_MODEL: z.string().default("anthropic/claude-sonnet-4.6"),
		GITPAL_WEBHOOK_BASE_URL: z.url().optional(),
		GITPAL_WALLET_REVENUE_SHARE_PERCENT: z.coerce
			.number()
			.min(0)
			.max(100)
			.default(5),
		GITHUB_CLIENT_ID: z.string().optional(),
		GITHUB_CLIENT_SECRET: z.string().optional(),
		GITHUB_WEBHOOK_SECRET: z.string().optional(),
		GITLAB_CLIENT_ID: z.string().optional(),
		GITLAB_CLIENT_SECRET: z.string().optional(),
		GITLAB_WEBHOOK_SECRET: z.string().optional(),
		NOWPAYMENTS_API_BASE_URL: z
			.url()
			.default("https://api.nowpayments.io"),
		NOWPAYMENTS_API_KEY: z.string().optional(),
		NOWPAYMENTS_IPN_SECRET: z.string().optional(),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
	},
	runtimeEnv: process.env,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
});
