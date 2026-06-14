import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		CORS_ORIGIN: z.url(),
		GITHUB_CLIENT_ID: z.string().optional(),
		GITHUB_CLIENT_SECRET: z.string().optional(),
		GITHUB_ENTERPRISE_CLIENT_ID: z.string().optional(),
		GITHUB_ENTERPRISE_CLIENT_SECRET: z.string().optional(),
		GITHUB_ENTERPRISE_URL: z.url().optional(),
		GITLAB_CLIENT_ID: z.string().optional(),
		GITLAB_CLIENT_SECRET: z.string().optional(),
		GITLAB_ENTERPRISE_CLIENT_ID: z.string().optional(),
		GITLAB_ENTERPRISE_CLIENT_SECRET: z.string().optional(),
		GITLAB_ENTERPRISE_URL: z.url().optional(),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
	},
	runtimeEnv: process.env,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
});
