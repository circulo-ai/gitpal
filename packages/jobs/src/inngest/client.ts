import { env } from "@gitpal/env/server";
import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "gitpal",
  baseUrl: env.INNGEST_API_BASE_URL,
  eventKey: env.INNGEST_EVENT_KEY,
  signingKey: env.INNGEST_SIGNING_KEY,
  isDev: process.env.NODE_ENV === "development"
});
