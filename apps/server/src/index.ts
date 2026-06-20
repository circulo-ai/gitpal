import { createContext } from "@gitpal/api/context";
import { appRouter } from "@gitpal/api/routers/index";
import { auth } from "@gitpal/auth";
import { type Database, db } from "@gitpal/db";
import { env } from "@gitpal/env/server";
import { createFunctions, inngest } from "@gitpal/jobs";
import { createLogger } from "@gitpal/logger";
import { expireStaleDurableState } from "@gitpal/services/durable-maintenance";
import { completeIntegrationOAuthCallback } from "@gitpal/services/integrations";
import {
	isNowPaymentsWebhookEnabled,
	NowPaymentsValidationError,
	parseNowPaymentsWebhook,
} from "@gitpal/services/nowpayments";
import {
	dispatchPullRequestReconcile,
	markPullRequestReconcileFailed,
	reconcilePullRequestsForRepository,
} from "@gitpal/services/pr-reconcile";
import { processRepositorySyncJob } from "@gitpal/services/repository-sync";
import { processRepositoryWebhookSyncJob } from "@gitpal/services/repository-webhook-sync";
import {
	processProviderWebhookFailure,
	processProviderWebhookReceiptJob,
	processRepositoryLabelerRunJob,
	processRepositoryReviewRunJob,
	receiveProviderWebhook,
} from "@gitpal/services/repository-webhooks";
import { failActiveReviewRun } from "@gitpal/services/review-runs";
import { handleNowPaymentsWebhook } from "@gitpal/services/wallet";
import { trpcServer } from "@hono/trpc-server";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { serve } from "inngest/hono";

type ServerEnv = {
	Variables: {
		db: Database;
	};
};

const app = new Hono<ServerEnv>();
const log = createLogger("server");
const functions = createFunctions({
	processProviderWebhookReceiptJob,
	processProviderWebhookFailure,
	processRepositoryWebhookSyncJob,
	processRepositorySyncJob,
	processRepositoryReviewRunJob,
	processRepositoryLabelerRunJob,
	processRepositoryRunFailure: ({ runId, errorMessage }) =>
		failActiveReviewRun({
			runId,
			reason: "inngest_function_failed",
			errorMessage,
		}),
	expireStaleDurableState,
	dispatchPullRequestReconcile,
	reconcilePullRequestsForRepository,
	markPullRequestReconcileFailed,
});

async function handleProviderWebhook(
	c: Context<ServerEnv>,
	providerId: string,
) {
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

app.use("*", async (c, next) => {
	c.set("db", db);
	await next();
});
app.use("*", async (c, next) => {
	const startedAt = Date.now();

	try {
		await next();
	} catch (error) {
		log.error("HTTP request crashed.", {
			err: error,
			method: c.req.method,
			path: c.req.path,
			durationMs: Date.now() - startedAt,
		});
		throw error;
	}

	const context = {
		method: c.req.method,
		path: c.req.path,
		status: c.res.status,
		durationMs: Date.now() - startedAt,
	};

	if (c.res.status >= 500) {
		log.error("HTTP request failed.", context);
		return;
	}

	log.debug("HTTP request completed.", context);
});
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

app.use("/trpc/*", async (c, next) => {
	if (c.req.method !== "POST") {
		await next();
		return;
	}

	const origin = c.req.header("origin");
	if (!origin || origin !== new URL(env.CORS_ORIGIN).origin) {
		return c.json({ ok: false, error: "invalid_origin" }, 403);
	}

	await next();
});

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/integrations/oauth/callback", async (c) => {
	const fallbackUrl = new URL(
		`${env.CORS_ORIGIN.replace(/\/$/, "")}/integrations`,
	);
	const code = c.req.query("code");
	const state = c.req.query("state");
	const oauthError = c.req.query("error");

	if (oauthError) {
		fallbackUrl.searchParams.set("integration_oauth", "cancelled");
		return c.redirect(fallbackUrl.toString());
	}

	if (!code || !state) {
		fallbackUrl.searchParams.set("integration_oauth", "missing_code");
		return c.redirect(fallbackUrl.toString());
	}

	try {
		const result = await completeIntegrationOAuthCallback({ code, state });
		const returnUrl = new URL(result.returnTo);
		returnUrl.searchParams.set("integration_oauth", "connected");
		returnUrl.searchParams.set("connectionId", result.connection.id);

		return c.redirect(returnUrl.toString());
	} catch (error) {
		log.warn("Integration OAuth callback failed.", {
			err: error,
		});
		fallbackUrl.searchParams.set("integration_oauth", "error");
		return c.redirect(fallbackUrl.toString());
	}
});

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
			return createContext({ context, db: context.get("db") });
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
