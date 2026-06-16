import { createContext } from "@gitpal/api/context";
import {
	handleNowPaymentsWebhook,
} from "@gitpal/api/services/wallet";
import { appRouter } from "@gitpal/api/routers/index";
import { auth } from "@gitpal/auth";
import { env } from "@gitpal/env/server";
import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { verifyNowPaymentsSignature } from "@gitpal/api/services/nowpayments";

const app = new Hono();

app.use(logger());
app.use(
	"/*",
	cors({
		origin: env.CORS_ORIGIN,
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	}),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.post("/nowpayments/webhook", async (c) => {
	const signature = c.req.header("x-nowpayments-sig") ?? null;
	const rawBody = await c.req.text();

	try {
		if (!verifyNowPaymentsSignature({ rawBody, signature })) {
			return c.json({ ok: false, error: "invalid_signature" }, 401);
		}

		const payload = JSON.parse(rawBody) as Record<string, unknown>;
		await handleNowPaymentsWebhook(payload);

		return c.json({ ok: true });
	} catch (error) {
		if (env.NODE_ENV !== "production") {
			console.error("NOWPayments webhook error", error);
		}

		return c.json({ ok: false, error: "webhook_processing_failed" }, 500);
	}
});

app.use(
	"/trpc/*",
	trpcServer({
		router: appRouter,
		createContext: (_opts, context) => {
			return createContext({ context });
		},
	}),
);

app.get("/", (c) => {
	return c.text("OK");
});

export default app;
