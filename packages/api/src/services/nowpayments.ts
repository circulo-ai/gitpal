import { createHmac } from "node:crypto";
import { env } from "@gitpal/env/server";

export type NowPaymentsInvoice = {
	id: string;
	order_id: string | null;
	order_description: string | null;
	price_amount: string;
	price_currency: string;
	pay_currency: string | null;
	ipn_callback_url: string | null;
	invoice_url: string;
	success_url: string | null;
	cancel_url: string | null;
	partially_paid_url?: string | null;
	created_at: string;
	updated_at: string;
};

export type NowPaymentsWebhookPayload = {
	payment_id?: string | number | null;
	invoice_id?: string | number | null;
	payment_status?: string | null;
	pay_address?: string | null;
	payin_extra_id?: string | number | null;
	price_amount?: number | string | null;
	price_currency?: string | null;
	pay_amount?: number | string | null;
	actually_paid?: number | string | null;
	pay_currency?: string | null;
	order_id?: string | null;
	order_description?: string | null;
	purchase_id?: string | number | null;
	outcome_amount?: number | string | null;
	outcome_currency?: string | null;
	payout_hash?: string | null;
	payin_hash?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
	[key: string]: unknown;
};

type CreateInvoiceInput = {
	priceAmountUsd: number;
	orderId: string;
	orderDescription: string;
	ipnCallbackUrl: string;
	successUrl: string;
	cancelUrl: string;
	partiallyPaidUrl: string;
};

function requireNowPaymentsApiKey() {
	if (!env.NOWPAYMENTS_API_KEY) {
		throw new Error("NOWPayments API key is not configured.");
	}

	return env.NOWPAYMENTS_API_KEY;
}

function getNowPaymentsApiUrl(path: string) {
	return `${env.NOWPAYMENTS_API_BASE_URL.replace(/\/+$/, "")}${path}`;
}

function sortObject(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => sortObject(item));
	}

	if (value && typeof value === "object") {
		return Object.keys(value as Record<string, unknown>)
			.sort()
			.reduce<Record<string, unknown>>((result, key) => {
				result[key] = sortObject((value as Record<string, unknown>)[key]);
				return result;
			}, {});
	}

	return value;
}

export function verifyNowPaymentsSignature({
	rawBody,
	signature,
}: {
	rawBody: string;
	signature: string | null;
}) {
	if (!env.NOWPAYMENTS_IPN_SECRET) {
		throw new Error("NOWPayments IPN secret is not configured.");
	}

	if (!signature) {
		return false;
	}

	const payload = JSON.parse(rawBody) as unknown;
	const normalized = JSON.stringify(sortObject(payload));
	const digest = createHmac("sha512", env.NOWPAYMENTS_IPN_SECRET)
		.update(normalized)
		.digest("hex");

	return digest === signature;
}

export async function createNowPaymentsInvoice(
	input: CreateInvoiceInput,
): Promise<NowPaymentsInvoice> {
	const response = await fetch(getNowPaymentsApiUrl("/v1/invoice"), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": requireNowPaymentsApiKey(),
		},
		body: JSON.stringify({
			price_amount: Number(input.priceAmountUsd.toFixed(2)),
			price_currency: "usd",
			order_id: input.orderId,
			order_description: input.orderDescription,
			ipn_callback_url: input.ipnCallbackUrl,
			success_url: input.successUrl,
			cancel_url: input.cancelUrl,
			partially_paid_url: input.partiallyPaidUrl,
		}),
	});

	if (!response.ok) {
		const message = await response.text().catch(() => "");
		throw new Error(
			message || `NOWPayments invoice creation failed with ${response.status}.`,
		);
	}

	return (await response.json()) as NowPaymentsInvoice;
}
