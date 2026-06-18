import { env } from "@gitpal/env/server";
import {
	APIError,
	type CheckoutSession,
	ConfigurationError,
	NetworkError,
	NowPaymentsSDK,
	type Payment,
	type PaymentStatus,
	ValidationError,
} from "@nowpaymentsio/nowpayments-sdk-nodejs";

export { ValidationError as NowPaymentsValidationError } from "@nowpaymentsio/nowpayments-sdk-nodejs";

export type NowPaymentsCheckout = CheckoutSession;
export type NowPaymentsWebhookPayment = Payment;
export type NowPaymentsWebhookEvent = ReturnType<
	NowPaymentsSDK["parseWebhook"]
>;

type CreateCheckoutInput = {
	priceAmountUsd: number;
	orderId: string;
	orderDescription: string;
	ipnCallbackUrl: string;
	successUrl: string;
	cancelUrl: string;
	partiallyPaidUrl: string;
};

const NOWPAYMENTS_RETRYABLE_HTTP_STATUSES = new Set([
	408, 425, 429, 500, 502, 503, 504,
]);

let checkoutSdk: NowPaymentsSDK | null = null;
let webhookSdk: NowPaymentsSDK | null = null;

function createSdk() {
	return new NowPaymentsSDK({
		apiKey: env.NOWPAYMENTS_API_KEY ?? undefined,
		ipnSecret: env.NOWPAYMENTS_IPN_SECRET ?? undefined,
		baseUrl: env.NOWPAYMENTS_API_BASE_URL,
		timeoutMs: 15_000,
		userAgent: "GitPal",
	});
}

function getCheckoutSdk() {
	if (!env.NOWPAYMENTS_API_KEY) {
		throw new Error("NOWPayments API key is not configured.");
	}

	if (!env.NOWPAYMENTS_IPN_SECRET) {
		throw new Error("NOWPayments IPN secret is not configured.");
	}

	checkoutSdk ??= createSdk();
	return checkoutSdk;
}

function getWebhookSdk() {
	if (!env.NOWPAYMENTS_IPN_SECRET) {
		throw new Error("NOWPayments IPN secret is not configured.");
	}

	webhookSdk ??= createSdk();
	return webhookSdk;
}

function isRetryableNowPaymentsError(error: unknown) {
	if (error instanceof NetworkError) {
		return true;
	}

	if (error instanceof APIError && typeof error.httpStatus === "number") {
		return NOWPAYMENTS_RETRYABLE_HTTP_STATUSES.has(error.httpStatus);
	}

	return false;
}

async function withNowPaymentsRetry<T>(
	operation: () => Promise<T>,
	operationName: string,
) {
	const maxAttempts = 3;
	let lastError: unknown = null;

	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;

			if (
				error instanceof ConfigurationError ||
				error instanceof ValidationError ||
				!isRetryableNowPaymentsError(error) ||
				attempt === maxAttempts - 1
			) {
				throw error;
			}

			const backoffMs = Math.min(250 * 2 ** attempt, 2_000);
			const jitterMs = Math.round(Math.random() * 125);

			await new Promise((resolve) => {
				setTimeout(resolve, backoffMs + jitterMs);
			});
		}
	}

	throw lastError instanceof Error
		? lastError
		: new Error(`NOWPayments ${operationName} failed.`);
}

export function isNowPaymentsCheckoutEnabled() {
	return Boolean(env.NOWPAYMENTS_API_KEY && env.NOWPAYMENTS_IPN_SECRET);
}

export function isNowPaymentsWebhookEnabled() {
	return Boolean(env.NOWPAYMENTS_IPN_SECRET);
}

export function parseNowPaymentsWebhook({
	rawBody,
	signature,
}: {
	rawBody: string;
	signature: string | null;
}): NowPaymentsWebhookEvent {
	const payload = JSON.parse(rawBody) as Record<string, unknown>;
	return getWebhookSdk().parseWebhook(payload, signature ?? undefined);
}

export async function createNowPaymentsCheckout(
	input: CreateCheckoutInput,
): Promise<NowPaymentsCheckout> {
	const sdk = getCheckoutSdk();

	return withNowPaymentsRetry(
		() =>
			sdk.createCheckout({
				amount: Number(input.priceAmountUsd.toFixed(2)),
				currency: "usd",
				orderId: input.orderId,
				description: input.orderDescription,
				ipnCallbackUrl: input.ipnCallbackUrl,
				successUrl: input.successUrl,
				cancelUrl: input.cancelUrl,
				partiallyPaidUrl: input.partiallyPaidUrl,
			}),
		"checkout creation",
	);
}

export function normalizeNowPaymentsStatus(status: PaymentStatus | null) {
	return status ?? "unknown";
}
