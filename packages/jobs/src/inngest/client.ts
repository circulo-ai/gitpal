import { env, skipEnvValidation } from "@gitpal/env/server";
import { createLogger } from "@gitpal/logger";
import { Inngest } from "inngest";

if (
	env.NODE_ENV === "production" &&
	!skipEnvValidation &&
	(!env.INNGEST_BASE_URL || !env.INNGEST_EVENT_KEY || !env.INNGEST_SIGNING_KEY)
) {
	throw new Error(
		"INNGEST_BASE_URL, INNGEST_EVENT_KEY, and INNGEST_SIGNING_KEY are required in production.",
	);
}

export const inngest = new Inngest({
	id: "gitpal",
	baseUrl: env.INNGEST_BASE_URL,
	eventKey: env.INNGEST_EVENT_KEY,
	signingKey: env.INNGEST_SIGNING_KEY,
	env: env.NODE_ENV,
	logger: createLogger("inngest"),
});
