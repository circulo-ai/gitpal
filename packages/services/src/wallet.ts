import { runTransactionWithRetry } from "@gitpal/db";
import { env } from "@gitpal/env/server";
import { createRepositories, repositories } from "@gitpal/repositories";
import { sendUserNotification } from "./notifications";
import {
	createNowPaymentsCheckout,
	isNowPaymentsCheckoutEnabled,
	type NowPaymentsWebhookPayment,
	normalizeNowPaymentsStatus,
} from "./nowpayments";
import { recordObservabilityEvent } from "./observability";
import { stableId } from "./stable-id";

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
	cloudBillingEnabled: boolean;
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

async function ensureWalletForUser(userId: string, executor?: any) {
	const repos = executor ? createRepositories(executor) : repositories;
	return repos.wallet.ensureWalletForUser(userId, getWalletId(userId));
}

export async function assertWalletCanStartUsage(userId: string) {
	const wallet = await ensureWalletForUser(userId);
	if (wallet.availableBalanceCents <= 0) {
		throw new Error(
			"Wallet balance is depleted. Add funds before starting AI work.",
		);
	}
	return wallet.availableBalanceCents;
}

export async function getWalletSummaryForUser(
	userId: string,
): Promise<WalletSummary> {
	const wallet = await ensureWalletForUser(userId);
	const cloudBillingEnabled = env.GITPAL_CLOUD_BILLING_ENABLED;
	const checkoutEnabled = cloudBillingEnabled && isNowPaymentsCheckoutEnabled();
	const [topups, entries] = await Promise.all([
		repositories.walletTopup.findRecentByWallet(wallet.id, 10),
		repositories.walletLedgerEntry.findRecentByWallet(wallet.id, 12),
	]);

	return {
		id: wallet.id,
		currency: wallet.currency,
		availableBalanceCents: wallet.availableBalanceCents,
		totalDepositedCents: wallet.totalDepositedCents,
		totalCreditedCents: wallet.totalCreditedCents,
		totalRevenueCents: wallet.totalRevenueCents,
		totalSpentCents: wallet.totalSpentCents,
		cloudBillingEnabled,
		revenueSharePercent: env.GITPAL_WALLET_REVENUE_SHARE_PERCENT,
		checkoutEnabled,
		checkoutDisabledReason: !cloudBillingEnabled
			? "Wallet top-ups are only available in GitPal Cloud."
			: checkoutEnabled
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
	if (!env.GITPAL_CLOUD_BILLING_ENABLED) {
		throw new Error("Wallet top-ups are only available in GitPal Cloud.");
	}

	if (!isNowPaymentsCheckoutEnabled()) {
		throw new Error("NOWPayments is not configured.");
	}

	if (
		!Number.isSafeInteger(amountUsdCents) ||
		amountUsdCents < 500 ||
		amountUsdCents > 1_000_000
	) {
		throw new Error("Top-up amount must be between $5.00 and $10,000.00.");
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
	const parsedInvoiceUrl = new URL(invoiceUrl);
	if (parsedInvoiceUrl.protocol !== "https:") {
		throw new Error("NOWPayments returned an unsafe invoice URL.");
	}

	const topup = await repositories.walletTopup.create({
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
		externalCreatedAt: invoice.created_at ? new Date(invoice.created_at) : null,
		externalUpdatedAt: invoice.updated_at ? new Date(invoice.updated_at) : null,
		metadata: invoice as unknown as Record<string, unknown>,
		createdAt: now,
		updatedAt: now,
	});

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
	return runTransactionWithRetry((tx) =>
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
	executor: any,
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

	const repos = createRepositories(executor);
	const wallet = await repos.wallet.ensureWalletForUser(
		userId,
		getWalletId(userId),
	);
	const entryId = getLedgerId(sourceType, sourceId, "usage-debit");
	const now = new Date();

	const insertedLedger = await repos.walletLedgerEntry.createDoNothing({
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
	});

	if (!insertedLedger) {
		const existingLedger = await repos.walletLedgerEntry.findById(entryId);

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

	const updatedWallet = await repos.wallet.debitWallet(
		wallet.id,
		amountCents,
		now,
	);

	if (!updatedWallet)
		throw new Error("Wallet not found during usage settlement.");

	await repos.walletLedgerEntry.updateById(entryId, {
		balanceAfterCents: updatedWallet.availableBalanceCents,
	});

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

	const existingTopup = await repositories.walletTopup.findByWebhookIdentifiers(
		{
			providerPaymentId,
			providerInvoiceId,
			orderId,
		},
	);

	if (!existingTopup) {
		return {
			updated: false,
			credited: false,
		};
	}
	const identifiersMatch =
		(!orderId || existingTopup.orderId === orderId) &&
		(!providerInvoiceId ||
			!existingTopup.providerInvoiceId ||
			existingTopup.providerInvoiceId === providerInvoiceId) &&
		(!providerPaymentId ||
			!existingTopup.providerPaymentId ||
			existingTopup.providerPaymentId === providerPaymentId);
	if (!identifiersMatch) {
		return { updated: false, credited: false };
	}

	let credited = false;
	const now = new Date();
	const revenueAmountCents = Math.round(
		existingTopup.priceAmountUsdCents *
			(env.GITPAL_WALLET_REVENUE_SHARE_PERCENT / 100),
	);
	const netAmountCents = existingTopup.priceAmountUsdCents - revenueAmountCents;

	await runTransactionWithRetry(async (tx) => {
		const repos = createRepositories(tx);
		await repos.walletTopup.updateById(existingTopup.id, {
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
				payment.outcome_amount !== undefined && payment.outcome_amount !== null
					? String(payment.outcome_amount)
					: existingTopup.outcomeAmount,
			outcomeCurrency:
				payment.outcome_currency ?? existingTopup.outcomeCurrency,
			payAddress: payment.pay_address ?? existingTopup.payAddress,
			payinExtraId:
				payment.payin_extra_id !== undefined && payment.payin_extra_id !== null
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
			updatedAt: now,
		});

		if (!TOPUP_FINAL_STATUSES.has(status)) {
			return;
		}

		const creditableTopup = await repos.walletTopup.creditTopup(
			existingTopup.id,
			{
				creditedAt: now,
				revenueAmountCents,
				creditedAmountCents: netAmountCents,
				updatedAt: now,
			},
		);

		if (!creditableTopup) {
			return;
		}

		const updatedWallet = await repos.wallet.creditWallet(
			creditableTopup.walletId,
			{
				creditedAmount: creditableTopup.creditedAmountCents,
				priceAmount: creditableTopup.priceAmountUsdCents,
				revenueAmount: creditableTopup.revenueAmountCents,
				updatedAt: now,
			},
		);

		if (!updatedWallet) {
			throw new Error("Wallet not found.");
		}

		const netBalance = updatedWallet.availableBalanceCents;
		const grossBalance = netBalance + creditableTopup.revenueAmountCents;

		await repos.walletLedgerEntry.createDoNothing({
			id: getLedgerId("wallet-topup", creditableTopup.id, "topup-credit"),
			walletId: updatedWallet.id,
			userId: updatedWallet.userId,
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
			createdAt: now,
		});

		if (revenueAmountCents > 0) {
			await repos.walletLedgerEntry.createDoNothing({
				id: getLedgerId("wallet-topup", creditableTopup.id, "topup-fee"),
				walletId: updatedWallet.id,
				userId: updatedWallet.userId,
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
				createdAt: now,
			});
		}

		credited = true;
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
		credited,
	};
}
