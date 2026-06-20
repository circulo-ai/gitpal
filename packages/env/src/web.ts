import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const skipEnvValidation = ["1", "true"].includes(
	process.env.SKIP_ENV_VALIDATION?.trim().toLowerCase() ?? "",
);

export const env = createEnv({
	client: {
		NEXT_PUBLIC_SERVER_URL: z.url(),
		NEXT_PUBLIC_DOCS_URL: z.url().optional(),
		NEXT_PUBLIC_GITPAL_CLOUD_BILLING_ENABLED: z.stringbool().default(false),
	},
	runtimeEnv: {
		NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
		NEXT_PUBLIC_DOCS_URL: process.env.NEXT_PUBLIC_DOCS_URL,
		NEXT_PUBLIC_GITPAL_CLOUD_BILLING_ENABLED:
			process.env.NEXT_PUBLIC_GITPAL_CLOUD_BILLING_ENABLED,
	},
	skipValidation: skipEnvValidation,
	emptyStringAsUndefined: true,
});
