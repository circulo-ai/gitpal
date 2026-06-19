import { createContext } from "@gitpal/api/context";
import { appRouter } from "@gitpal/api/routers/index";
import {
	isNowPaymentsWebhookEnabled,
	NowPaymentsValidationError,
	parseNowPaymentsWebhook,
} from "@gitpal/api/services/nowpayments";
import {
	dispatchPullRequestReconcile,
	reconcilePullRequestsForRepository,
} from "@gitpal/api/services/pr-reconcile";
import { processRepositoryWebhookSyncJob } from "@gitpal/api/services/repository-webhook-sync";
import {
	processProviderWebhookReceiptJob,
	receiveProviderWebhook,
} from "@gitpal/api/services/repository-webhooks";
import { handleNowPaymentsWebhook } from "@gitpal/api/services/wallet";
import { auth } from "@gitpal/auth";
import { env } from "@gitpal/env/server";
import { createFunctions, inngest } from "@gitpal/jobs";
import { createLogger } from "@gitpal/logger";
import { trpcServer } from "@hono/trpc-server";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { serve } from "inngest/hono";

const app = new Hono();
const log = createLogger("server");
const functions = createFunctions({
	processProviderWebhookReceiptJob,
	processRepositoryWebhookSyncJob,
	dispatchPullRequestReconcile,
	reconcilePullRequestsForRepository,
});

async function handleProviderWebhook(c: Context, providerId: string) {
	const rawBody = await c.req.text();
	const result = await receiveProviderWebhook({
		providerId,
		headers: c.req.raw.headers,
		rawBody,
	});

	return c.json(
		result.body,
		result.status as 200 | 202 | 400 | 401 | 404 | 503,
	);
}

app.use(logger());
app.use(
	secureHeaders({
		strictTransportSecurity: false,
	}),
);
app.use(
	"/*",
	cors({
		origin: env.CORS_ORIGIN,
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	}),
);
app.use(
	"/*",
	bodyLimit({
		maxSize: env.HTTP_MAX_REQUEST_BODY_BYTES,
		onError: (c) => c.json({ ok: false, error: "payload_too_large" }, 413),
	}),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

async function handleNowPaymentsWebhookRequest(c: Context) {
	if (!isNowPaymentsWebhookEnabled()) {
		log.warn(
			{
				path: c.req.path,
			},
			"NOWPayments webhook received before IPN secret was configured.",
		);

		return c.json({ ok: false, error: "nowpayments_not_configured" }, 503);
	}

	const signature = c.req.header("x-nowpayments-sig") ?? null;
	const rawBody = await c.req.text();

	try {
		const event = parseNowPaymentsWebhook({
			rawBody,
			signature,
		});

		if (event.type !== "payment.status_changed") {
			return c.json({
				ok: true,
				ignored: true,
			});
		}

		await handleNowPaymentsWebhook(event.payment);

		return c.json({ ok: true });
	} catch (error) {
		if (error instanceof SyntaxError) {
			log.warn(
				{
					path: c.req.path,
				},
				"NOWPayments webhook payload could not be parsed as JSON.",
			);
			return c.json({ ok: false, error: "invalid_payload" }, 400);
		}

		if (error instanceof NowPaymentsValidationError) {
			log.warn(
				{
					path: c.req.path,
				},
				"NOWPayments webhook signature verification failed.",
			);
			return c.json({ ok: false, error: "invalid_signature" }, 401);
		}

		log.error(
			{
				err: error,
				path: c.req.path,
			},
			"NOWPayments webhook processing failed.",
		);

		return c.json({ ok: false, error: "webhook_processing_failed" }, 500);
	}
}

app.post("/webhooks/nowpayments", handleNowPaymentsWebhookRequest);

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

app.on(
	["GET", "PUT", "POST"],
	"/api/inngest",
	serve({
		client: inngest,
		functions,
	}),
);

app.get("/", (c) => {
	return c.text("OK");
});

export default app;
