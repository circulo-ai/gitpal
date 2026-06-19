import { createHash } from "node:crypto";
import { db } from "@gitpal/db";
import * as billingSchema from "@gitpal/db/schema/billing";
import { env } from "@gitpal/env/server";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { sendUserNotification } from "./notifications";
import {
	createNowPaymentsCheckout,
	isNowPaymentsCheckoutEnabled,
	type NowPaymentsWebhookPayment,
	normalizeNowPaymentsStatus,
} from "./nowpayments";
import { recordObservabilityEvent } from "./observability";

type WalletDbExecutor = Pick<typeof db, "select" | "insert" | "update">;
const TOPUP_FINAL_STATUSES = new Set(["paid"]);
const TOPUP_FAILURE_STATUSES = new Set([
	"failed",
	"refunded",
	"expired",
	"cancelled",
]);

export type WalletSummary = {
	id: string;
	currency: string;
	availableBalanceCents: number;
	totalDepositedCents: number;
	totalCreditedCents: number;
	totalRevenueCents: number;
	totalSpentCents: number;
	revenueSharePercent: number;
	checkoutEnabled: boolean;
	checkoutDisabledReason: string | null;
	recentTopups: Array<{
		id: string;
		status: string;
		priceAmountUsdCents: number;
		revenueAmountCents: number;
		creditedAmountCents: number;
		providerInvoiceId: string | null;
		invoiceUrl: string | null;
		createdAt: string;
		updatedAt: string;
	}>;
	recentEntries: Array<{
		id: string;
		type: string;
		amountCents: number;
		balanceAfterCents: number;
		description: string;
		createdAt: string;
	}>;
};

function stableId(parts: Array<string | number | boolean | null | undefined>) {
	return createHash("sha256")
		.update(parts.map((part) => String(part ?? "")).join(":"))
		.digest("hex");
}

function getWalletId(userId: string) {
	return `wallet_${stableId([userId]).slice(0, 32)}`;
}

function getTopupId(userId: string, orderId: string) {
	return `topup_${stableId([userId, orderId]).slice(0, 32)}`;
}

function getLedgerId(sourceType: string, sourceId: string, entryType: string) {
	return `ledger_${stableId([sourceType, sourceId, entryType]).slice(0, 32)}`;
}

function toUsdAmount(priceAmountUsdCents: number) {
	return Number((priceAmountUsdCents / 100).toFixed(2));
}

function formatUsd(cents: number) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
	}).format(cents / 100);
}

async function ensureWalletForUser(
	userId: string,
	executor: WalletDbExecutor = db,
) {
	const now = new Date();
	const [created] = await executor
		.insert(billingSchema.wallet)
		.values({
			id: getWalletId(userId),
			userId,
			currency: "USD",
			availableBalanceCents: 0,
			totalDepositedCents: 0,
			totalCreditedCents: 0,
			totalRevenueCents: 0,
			totalSpentCents: 0,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing({
			target: billingSchema.wallet.userId,
		})
		.returning();

	if (created) {
		return created;
	}

	const [existing] = await executor
		.select()
		.from(billingSchema.wallet)
		.where(eq(billingSchema.wallet.userId, userId))
		.limit(1);

	if (!existing) {
		throw new Error("Unable to create wallet.");
	}

	return existing;
}

export async function getWalletSummaryForUser(
	userId: string,
): Promise<WalletSummary> {
	const wallet = await ensureWalletForUser(userId);
	const [topups, entries] = await Promise.all([
		db
			.select()
			.from(billingSchema.walletTopup)
			.where(eq(billingSchema.walletTopup.walletId, wallet.id))
			.orderBy(desc(billingSchema.walletTopup.createdAt))
			.limit(10),
		db
			.select()
			.from(billingSchema.walletLedgerEntry)
			.where(eq(billingSchema.walletLedgerEntry.walletId, wallet.id))
			.orderBy(desc(billingSchema.walletLedgerEntry.createdAt))
			.limit(12),
	]);

	return {
		id: wallet.id,
		currency: wallet.currency,
		availableBalanceCents: wallet.availableBalanceCents,
		totalDepositedCents: wallet.totalDepositedCents,
		totalCreditedCents: wallet.totalCreditedCents,
		totalRevenueCents: wallet.totalRevenueCents,
		totalSpentCents: wallet.totalSpentCents,
		revenueSharePercent: env.GITPAL_WALLET_REVENUE_SHARE_PERCENT,
		checkoutEnabled: isNowPaymentsCheckoutEnabled(),
		checkoutDisabledReason: isNowPaymentsCheckoutEnabled()
			? null
			: "Wallet top-ups are not available until NOWPayments is configured.",
		recentTopups: topups.map((topup) => ({
			id: topup.id,
			status: topup.status,
			priceAmountUsdCents: topup.priceAmountUsdCents,
			revenueAmountCents: topup.revenueAmountCents,
			creditedAmountCents: topup.creditedAmountCents,
			providerInvoiceId: topup.providerInvoiceId,
			invoiceUrl: topup.invoiceUrl,
			createdAt: topup.createdAt.toISOString(),
			updatedAt: topup.updatedAt.toISOString(),
		})),
		recentEntries: entries.map((entry) => ({
			id: entry.id,
			type: entry.type,
			amountCents: entry.amountCents,
			balanceAfterCents: entry.balanceAfterCents,
			description: entry.description,
			createdAt: entry.createdAt.toISOString(),
		})),
	};
}

export async function createWalletTopupForUser({
	userId,
	amountUsdCents,
}: {
	userId: string;
	amountUsdCents: number;
}) {
	if (!isNowPaymentsCheckoutEnabled()) {
		throw new Error("NOWPayments is not configured.");
	}

	if (amountUsdCents < 500) {
		throw new Error("Minimum top-up amount is $5.00.");
	}

	const wallet = await ensureWalletForUser(userId);
	const now = new Date();
	const orderId = `GITPAL-${now.getTime()}-${stableId([userId, amountUsdCents]).slice(0, 8).toUpperCase()}`;
	const successUrl = `${env.CORS_ORIGIN}/account/billing?topup=success`;
	const cancelUrl = `${env.CORS_ORIGIN}/account/billing?topup=cancelled`;
	const partiallyPaidUrl = `${env.CORS_ORIGIN}/account/billing?topup=partial`;
	const invoice = await createNowPaymentsCheckout({
		priceAmountUsd: toUsdAmount(amountUsdCents),
		orderId,
		orderDescription: `GitPal wallet top-up for ${userId}`,
		ipnCallbackUrl: `${env.BETTER_AUTH_URL}/webhooks/nowpayments`,
		successUrl,
		cancelUrl,
		partiallyPaidUrl,
	});
	const providerInvoiceId = invoice.id ?? invoice.token_id ?? null;
	const invoiceUrl = invoice.invoice_url ?? invoice.invoiceUrl;

	if (!invoiceUrl) {
		throw new Error("NOWPayments did not return an invoice URL.");
	}

	const [topup] = await db
		.insert(billingSchema.walletTopup)
		.values({
			id: getTopupId(userId, orderId),
			walletId: wallet.id,
			userId,
			provider: "nowpayments",
			status: "waiting",
			orderId,
			priceAmountUsdCents: amountUsdCents,
			priceCurrency: "usd",
			payCurrency: invoice.pay_currency,
			providerInvoiceId,
			invoiceUrl,
			successUrl: invoice.success_url ?? successUrl,
			cancelUrl: invoice.cancel_url ?? cancelUrl,
			partiallyPaidUrl: invoice.partially_paid_url ?? partiallyPaidUrl,
			externalCreatedAt: invoice.created_at
				? new Date(invoice.created_at)
				: null,
			externalUpdatedAt: invoice.updated_at
				? new Date(invoice.updated_at)
				: null,
			metadata: invoice as unknown as Record<string, unknown>,
			createdAt: now,
			updatedAt: now,
		})
		.returning();

	if (!topup) {
		throw new Error("Unable to create wallet top-up.");
	}

	await recordObservabilityEvent({
		userId,
		kind: "billing",
		action: "wallet-topup",
		status: topup.status,
		severity: "warning",
		title: "Wallet top-up checkout created",
		body: `${formatUsd(topup.priceAmountUsdCents)} checkout opened with NOWPayments.`,
		sourceType: "wallet-topup",
		sourceId: topup.id,
		dedupeKey: `wallet-topup:${topup.id}:created`,
		costCents: topup.priceAmountUsdCents,
		metadata: {
			orderId,
			provider: "nowpayments",
			providerInvoiceId,
			invoiceUrl,
		},
		occurredAt: now,
	});

	return {
		id: topup.id,
		invoiceUrl,
		status: topup.status,
		priceAmountUsdCents: topup.priceAmountUsdCents,
	};
}

export async function applyWalletUsageDebit({
	userId,
	amountCents,
	description,
	sourceId,
	sourceType = "usage",
	metadata = {},
}: {
	userId: string;
	amountCents: number;
	description: string;
	sourceId: string;
	sourceType?: string;
	metadata?: Record<string, unknown>;
}) {
	return db.transaction((tx) =>
		applyWalletUsageDebitInTransaction(tx, {
			userId,
			amountCents,
			description,
			sourceId,
			sourceType,
			metadata,
		}),
	);
}

export async function applyWalletUsageDebitInTransaction(
	executor: WalletDbExecutor,
	{
		userId,
		amountCents,
		description,
		sourceId,
		sourceType = "usage",
		metadata = {},
	}: {
		userId: string;
		amountCents: number;
		description: string;
		sourceId: string;
		sourceType?: string;
		metadata?: Record<string, unknown>;
	},
) {
	if (amountCents <= 0) {
		return {
			applied: false,
			balanceAfterCents: null,
			ledgerEntryId: null,
			walletId: null,
		};
	}

	const wallet = await ensureWalletForUser(userId, executor);
	const entryId = getLedgerId(sourceType, sourceId, "usage-debit");
	const now = new Date();

	const [insertedLedger] = await executor
		.insert(billingSchema.walletLedgerEntry)
		.values({
			id: entryId,
			walletId: wallet.id,
			userId,
			type: "usage-debit",
			amountCents: amountCents * -1,
			balanceAfterCents: wallet.availableBalanceCents,
			currency: "USD",
			description,
			sourceType,
			sourceId,
			metadata,
			createdAt: now,
		})
		.onConflictDoNothing({
			target: [
				billingSchema.walletLedgerEntry.sourceType,
				billingSchema.walletLedgerEntry.sourceId,
				billingSchema.walletLedgerEntry.type,
			],
		})
		.returning({
			id: billingSchema.walletLedgerEntry.id,
		});

	if (!insertedLedger) {
		const [existingLedger] = await executor
			.select()
			.from(billingSchema.walletLedgerEntry)
			.where(eq(billingSchema.walletLedgerEntry.id, entryId))
			.limit(1);

		if (!existingLedger) {
			throw new Error("Unable to resolve existing wallet usage debit.");
		}

		return {
			applied: false,
			balanceAfterCents: existingLedger.balanceAfterCents,
			ledgerEntryId: existingLedger.id,
			walletId: existingLedger.walletId,
		};
	}

	const [updatedWallet] = await executor
		.update(billingSchema.wallet)
		.set({
			availableBalanceCents: sql`${billingSchema.wallet.availableBalanceCents} - ${amountCents}`,
			totalSpentCents: sql`${billingSchema.wallet.totalSpentCents} + ${amountCents}`,
			updatedAt: now,
		})
		.where(
			and(
				eq(billingSchema.wallet.id, wallet.id),
				sql`${billingSchema.wallet.availableBalanceCents} - ${amountCents} >= -10`,
			),
		)
		.returning({
			id: billingSchema.wallet.id,
			availableBalanceCents: billingSchema.wallet.availableBalanceCents,
		});

	if (!updatedWallet) {
		throw new Error("Insufficient wallet balance.");
	}

	await executor
		.update(billingSchema.walletLedgerEntry)
		.set({
			balanceAfterCents: updatedWallet.availableBalanceCents,
		})
		.where(eq(billingSchema.walletLedgerEntry.id, entryId));

	return {
		applied: true,
		balanceAfterCents: updatedWallet.availableBalanceCents,
		ledgerEntryId: entryId,
		walletId: wallet.id,
	};
}

export async function handleNowPaymentsWebhook(
	payment: NowPaymentsWebhookPayment,
) {
	const providerInvoiceId = payment.invoice_id
		? String(payment.invoice_id)
		: null;
	const providerPaymentId = payment.payment_id
		? String(payment.payment_id)
		: null;
	const orderId = payment.order_id?.trim() || null;
	const status = normalizeNowPaymentsStatus(payment.status);
	const providerStatus = payment.payment_status?.trim().toLowerCase() || status;

	const [existingTopup] = await db
		.select()
		.from(billingSchema.walletTopup)
		.where(
			or(
				...(providerPaymentId
					? [eq(billingSchema.walletTopup.providerPaymentId, providerPaymentId)]
					: []),
				...(providerInvoiceId
					? [eq(billingSchema.walletTopup.providerInvoiceId, providerInvoiceId)]
					: []),
				...(orderId ? [eq(billingSchema.walletTopup.orderId, orderId)] : []),
				eq(billingSchema.walletTopup.id, "__missing__"),
			),
		)
		.limit(1);

	if (!existingTopup) {
		return {
			updated: false,
			credited: false,
		};
	}

	await db.transaction(async (tx) => {
		await tx
			.update(billingSchema.walletTopup)
			.set({
				status,
				providerStatus,
				payCurrency: payment.pay_currency ?? existingTopup.payCurrency,
				payAmount:
					payment.pay_amount !== undefined && payment.pay_amount !== null
						? String(payment.pay_amount)
						: existingTopup.payAmount,
				actuallyPaid:
					payment.actually_paid !== undefined && payment.actually_paid !== null
						? String(payment.actually_paid)
						: existingTopup.actuallyPaid,
				outcomeAmount:
					payment.outcome_amount !== undefined &&
					payment.outcome_amount !== null
						? String(payment.outcome_amount)
						: existingTopup.outcomeAmount,
				outcomeCurrency:
					payment.outcome_currency ?? existingTopup.outcomeCurrency,
				payAddress: payment.pay_address ?? existingTopup.payAddress,
				payinExtraId:
					payment.payin_extra_id !== undefined &&
					payment.payin_extra_id !== null
						? String(payment.payin_extra_id)
						: existingTopup.payinExtraId,
				payinHash: payment.payin_hash ?? existingTopup.payinHash,
				payoutHash: payment.payout_hash ?? existingTopup.payoutHash,
				providerPaymentId: providerPaymentId ?? existingTopup.providerPaymentId,
				providerInvoiceId: providerInvoiceId ?? existingTopup.providerInvoiceId,
				providerPurchaseId:
					payment.purchase_id !== undefined && payment.purchase_id !== null
						? String(payment.purchase_id)
						: existingTopup.providerPurchaseId,
				externalCreatedAt: payment.created_at
					? new Date(payment.created_at)
					: existingTopup.externalCreatedAt,
				externalUpdatedAt: payment.updated_at
					? new Date(payment.updated_at)
					: existingTopup.externalUpdatedAt,
				errorMessage: TOPUP_FAILURE_STATUSES.has(status)
					? `NOWPayments marked this top-up as ${status}.`
					: existingTopup.errorMessage,
				metadata: payment as unknown as Record<string, unknown>,
				updatedAt: new Date(),
			})
			.where(eq(billingSchema.walletTopup.id, existingTopup.id));

		if (!TOPUP_FINAL_STATUSES.has(status)) {
			return;
		}

		const [creditableTopup] = await tx
			.update(billingSchema.walletTopup)
			.set({
				creditedAt: new Date(),
				revenueAmountCents: Math.round(
					existingTopup.priceAmountUsdCents *
						(env.GITPAL_WALLET_REVENUE_SHARE_PERCENT / 100),
				),
				creditedAmountCents:
					existingTopup.priceAmountUsdCents -
					Math.round(
						existingTopup.priceAmountUsdCents *
							(env.GITPAL_WALLET_REVENUE_SHARE_PERCENT / 100),
					),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(billingSchema.walletTopup.id, existingTopup.id),
					isNull(billingSchema.walletTopup.creditedAt),
				),
			)
			.returning();

		if (!creditableTopup) {
			return;
		}

		const [wallet] = await tx
			.select()
			.from(billingSchema.wallet)
			.where(eq(billingSchema.wallet.id, creditableTopup.walletId))
			.limit(1);

		if (!wallet) {
			throw new Error("Wallet not found.");
		}

		const revenueAmountCents = creditableTopup.revenueAmountCents;
		const netAmountCents = creditableTopup.creditedAmountCents;
		const grossBalance =
			wallet.availableBalanceCents + creditableTopup.priceAmountUsdCents;
		const netBalance = grossBalance - revenueAmountCents;

		await tx
			.update(billingSchema.wallet)
			.set({
				availableBalanceCents: netBalance,
				totalDepositedCents:
					wallet.totalDepositedCents + creditableTopup.priceAmountUsdCents,
				totalCreditedCents: wallet.totalCreditedCents + netAmountCents,
				totalRevenueCents: wallet.totalRevenueCents + revenueAmountCents,
				updatedAt: new Date(),
			})
			.where(eq(billingSchema.wallet.id, wallet.id));

		await tx.insert(billingSchema.walletLedgerEntry).values({
			id: getLedgerId("wallet-topup", creditableTopup.id, "topup-credit"),
			walletId: wallet.id,
			userId: wallet.userId,
			type: "topup-credit",
			amountCents: creditableTopup.priceAmountUsdCents,
			balanceAfterCents: grossBalance,
			currency: "USD",
			description: "Wallet top-up received",
			sourceType: "wallet-topup",
			sourceId: creditableTopup.id,
			metadata: {
				provider: "nowpayments",
				paymentId: providerPaymentId,
				invoiceId: providerInvoiceId,
			},
			createdAt: new Date(),
		});

		if (revenueAmountCents > 0) {
			await tx.insert(billingSchema.walletLedgerEntry).values({
				id: getLedgerId("wallet-topup", creditableTopup.id, "topup-fee"),
				walletId: wallet.id,
				userId: wallet.userId,
				type: "topup-fee",
				amountCents: revenueAmountCents * -1,
				balanceAfterCents: netBalance,
				currency: "USD",
				description: "Platform top-up fee",
				sourceType: "wallet-topup",
				sourceId: creditableTopup.id,
				metadata: {
					provider: "nowpayments",
					feePercent: env.GITPAL_WALLET_REVENUE_SHARE_PERCENT,
				},
				createdAt: new Date(),
			});
		}
	});

	await recordObservabilityEvent({
		userId: existingTopup.userId,
		kind: "billing",
		action: "wallet-topup",
		status,
		severity: TOPUP_FAILURE_STATUSES.has(status)
			? "error"
			: TOPUP_FINAL_STATUSES.has(status)
				? "success"
				: "info",
		title: `Wallet top-up ${status}`,
		body: TOPUP_FAILURE_STATUSES.has(status)
			? `NOWPayments marked ${formatUsd(existingTopup.priceAmountUsdCents)} as ${status}.`
			: TOPUP_FINAL_STATUSES.has(status)
				? `${formatUsd(existingTopup.priceAmountUsdCents)} payment confirmed.`
				: `NOWPayments status changed to ${status}.`,
		sourceType: "wallet-topup",
		sourceId: existingTopup.id,
		dedupeKey: `wallet-topup:${existingTopup.id}:${status}`,
		costCents: existingTopup.priceAmountUsdCents,
		metadata: {
			orderId: existingTopup.orderId,
			provider: "nowpayments",
			providerStatus,
			providerInvoiceId,
			providerPaymentId,
		},
	});

	if (TOPUP_FINAL_STATUSES.has(status) || TOPUP_FAILURE_STATUSES.has(status)) {
		await sendUserNotification({
			userId: existingTopup.userId,
			type: TOPUP_FINAL_STATUSES.has(status)
				? "wallet_topup_paid"
				: "wallet_topup_failed",
			category: "billing",
			severity: TOPUP_FINAL_STATUSES.has(status) ? "success" : "error",
			title: TOPUP_FINAL_STATUSES.has(status)
				? "Wallet top-up confirmed"
				: "Wallet top-up failed",
			body: TOPUP_FINAL_STATUSES.has(status)
				? `${formatUsd(existingTopup.priceAmountUsdCents)} payment was confirmed and credited.`
				: `NOWPayments marked this top-up as ${status}.`,
			actionHref: "/account/billing",
			sourceType: "wallet-topup",
			sourceId: existingTopup.id,
			dedupeKey: `wallet-topup:${existingTopup.id}:notification:${status}`,
			metadata: {
				orderId: existingTopup.orderId,
				status,
				providerPaymentId,
				providerInvoiceId,
			},
		});
	}

	return {
		updated: true,
		credited: TOPUP_FINAL_STATUSES.has(status),
	};
}
