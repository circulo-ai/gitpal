import { env } from "@gitpal/env/server";
import { createLogger } from "@gitpal/logger";
import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "gitpal",
  baseUrl: env.INNGEST_BASE_URL,
  eventKey: env.INNGEST_EVENT_KEY,
  signingKey: env.INNGEST_SIGNING_KEY,
  logger: createLogger("inngest"),
});
