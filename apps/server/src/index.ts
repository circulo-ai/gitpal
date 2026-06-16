import { createContext } from "@gitpal/api/context";
import {
	handleNowPaymentsWebhook,
} from "@gitpal/api/services/wallet";
import { receiveProviderWebhook } from "@gitpal/api/services/repository-webhooks";
import { appRouter } from "@gitpal/api/routers/index";
import { auth } from "@gitpal/auth";
import { env } from "@gitpal/env/server";
import { trpcServer } from "@hono/trpc-server";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { verifyNowPaymentsSignature } from "@gitpal/api/services/nowpayments";

const app = new Hono();

async function handleProviderWebhook(
	c: Context,
	providerId: string,
) {
	const rawBody = await c.req.text();
	const result = await receiveProviderWebhook({
		providerId,
		headers: c.req.raw.headers,
		rawBody,
	});

	return c.json(result.body, result.status as 200 | 202 | 400 | 401 | 404);
}

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

app.post("/webhooks/github", async (c) => {
	return handleProviderWebhook(c, "github");
});

app.post("/webhooks/gitlab", async (c) => {
	return handleProviderWebhook(c, "gitlab");
});

app.post("/webhooks/enterprise/:providerId", async (c) => {
	return handleProviderWebhook(
		c,
		`enterprise-git:${c.req.param("providerId")}`,
	);
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
