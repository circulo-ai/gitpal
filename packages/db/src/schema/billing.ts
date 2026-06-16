import { relations } from "drizzle-orm";
import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const wallet = pgTable(
	"wallet",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		currency: text("currency").default("USD").notNull(),
		availableBalanceCents: integer("available_balance_cents")
			.default(0)
			.notNull(),
		totalDepositedCents: integer("total_deposited_cents").default(0).notNull(),
		totalCreditedCents: integer("total_credited_cents").default(0).notNull(),
		totalRevenueCents: integer("total_revenue_cents").default(0).notNull(),
		totalSpentCents: integer("total_spent_cents").default(0).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("wallet_user_id_idx").on(table.userId),
		index("wallet_currency_idx").on(table.currency),
	],
);

export const walletTopup = pgTable(
	"wallet_topup",
	{
		id: text("id").primaryKey(),
		walletId: text("wallet_id")
			.notNull()
			.references(() => wallet.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		provider: text("provider").default("nowpayments").notNull(),
		status: text("status").default("created").notNull(),
		orderId: text("order_id").notNull(),
		priceAmountUsdCents: integer("price_amount_usd_cents").notNull(),
		priceCurrency: text("price_currency").default("usd").notNull(),
		payCurrency: text("pay_currency"),
		payAmount: text("pay_amount"),
		actuallyPaid: text("actually_paid"),
		outcomeAmount: text("outcome_amount"),
		outcomeCurrency: text("outcome_currency"),
		payAddress: text("pay_address"),
		payinExtraId: text("payin_extra_id"),
		payinHash: text("payin_hash"),
		payoutHash: text("payout_hash"),
		providerInvoiceId: text("provider_invoice_id"),
		providerPaymentId: text("provider_payment_id"),
		providerPurchaseId: text("provider_purchase_id"),
		providerStatus: text("provider_status"),
		invoiceUrl: text("invoice_url"),
		successUrl: text("success_url"),
		cancelUrl: text("cancel_url"),
		partiallyPaidUrl: text("partially_paid_url"),
		revenueAmountCents: integer("revenue_amount_cents").default(0).notNull(),
		creditedAmountCents: integer("credited_amount_cents").default(0).notNull(),
		creditedAt: timestamp("credited_at"),
		externalCreatedAt: timestamp("external_created_at"),
		externalUpdatedAt: timestamp("external_updated_at"),
		errorMessage: text("error_message"),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown> | null>()
			.default({})
			.notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("wallet_topup_order_id_idx").on(table.orderId),
		uniqueIndex("wallet_topup_provider_invoice_id_idx").on(
			table.providerInvoiceId,
		),
		uniqueIndex("wallet_topup_provider_payment_id_idx").on(
			table.providerPaymentId,
		),
		index("wallet_topup_wallet_id_idx").on(table.walletId),
		index("wallet_topup_user_id_idx").on(table.userId),
		index("wallet_topup_status_idx").on(table.status),
	],
);

export const walletLedgerEntry = pgTable(
	"wallet_ledger_entry",
	{
		id: text("id").primaryKey(),
		walletId: text("wallet_id")
			.notNull()
			.references(() => wallet.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		type: text("type").notNull(),
		amountCents: integer("amount_cents").notNull(),
		balanceAfterCents: integer("balance_after_cents").notNull(),
		currency: text("currency").default("USD").notNull(),
		description: text("description").notNull(),
		sourceType: text("source_type").notNull(),
		sourceId: text("source_id").notNull(),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown> | null>()
			.default({})
			.notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("wallet_ledger_source_idx").on(
			table.sourceType,
			table.sourceId,
			table.type,
		),
		index("wallet_ledger_wallet_id_idx").on(table.walletId),
		index("wallet_ledger_user_id_idx").on(table.userId),
		index("wallet_ledger_created_at_idx").on(table.createdAt),
	],
);

export const walletRelations = relations(wallet, ({ one, many }) => ({
	user: one(user, {
		fields: [wallet.userId],
		references: [user.id],
	}),
	topups: many(walletTopup),
	ledgerEntries: many(walletLedgerEntry),
}));

export const walletTopupRelations = relations(walletTopup, ({ one }) => ({
	wallet: one(wallet, {
		fields: [walletTopup.walletId],
		references: [wallet.id],
	}),
	user: one(user, {
		fields: [walletTopup.userId],
		references: [user.id],
	}),
}));

export const walletLedgerEntryRelations = relations(
	walletLedgerEntry,
	({ one }) => ({
		wallet: one(wallet, {
			fields: [walletLedgerEntry.walletId],
			references: [wallet.id],
		}),
		user: one(user, {
			fields: [walletLedgerEntry.userId],
			references: [user.id],
		}),
	}),
);
