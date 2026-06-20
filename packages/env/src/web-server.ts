import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const nodeEnvSchema = z
	.enum(["development", "production", "test"])
	.default("development");
const skipEnvValidation = ["1", "true"].includes(
	process.env.SKIP_ENV_VALIDATION?.trim().toLowerCase() ?? "",
);

export const env = createEnv({
	server: {
		NEXT_PUBLIC_SERVER_URL: z.url(),
		GITHUB_CLIENT_ID: z.string().optional(),
		GITHUB_CLIENT_SECRET: z.string().optional(),
		GITLAB_CLIENT_ID: z.string().optional(),
		GITLAB_CLIENT_SECRET: z.string().optional(),
		NEXT_PUBLIC_GITPAL_CLOUD_BILLING_ENABLED: z.stringbool().default(false),
		NODE_ENV: nodeEnvSchema,
	},
	runtimeEnv: process.env,
	skipValidation: skipEnvValidation,
	emptyStringAsUndefined: true,
});
