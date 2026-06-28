import {
	organizationBudget,
	wallet,
	walletLedgerEntry,
	walletTopup,
} from "@gitpal/db/schema";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { BaseRepository, type PageRequest } from "./shared/base.repository";
import { conflictUpdateAllExcept } from "./shared/sql";
import type { Executor } from "./shared/types";

type OrganizationBudgetInsert = typeof organizationBudget.$inferInsert;

/** Monthly spend caps, one per organization. */
export class OrganizationBudgetRepository extends BaseRepository<
	typeof organizationBudget
> {
	constructor(executor: Executor) {
		super(executor, organizationBudget);
	}

	findByOrganizationId(organizationId: string) {
		return this.findOne(eq(organizationBudget.organizationId, organizationId));
	}

	async upsertForOrganization(values: OrganizationBudgetInsert) {
		const [row] = await this.executor
			.insert(organizationBudget)
			.values(values)
			.onConflictDoUpdate({
				target: organizationBudget.organizationId,
				set: conflictUpdateAllExcept(organizationBudget, [
					"id",
					"organizationId",
					"createdAt",
				]),
			})
			.returning();
		return row;
	}
}

/** A user's prepaid balance (one wallet per user). */
export class WalletRepository extends BaseRepository<typeof wallet> {
	constructor(executor: Executor) {
		super(executor, wallet);
	}

	findByUserId(userId: string) {
		return this.findOne(eq(wallet.userId, userId));
	}

	async ensureWalletForUser(userId: string, walletId: string) {
		const now = new Date();
		const [created] = await this.executor
			.insert(wallet)
			.values({
				id: walletId,
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
				target: wallet.userId,
			})
			.returning();

		if (created) {
			return created;
		}

		const existing = await this.findByUserId(userId);
		if (!existing) {
			throw new Error("Unable to create wallet.");
		}
		return existing;
	}

	async debitWallet(walletId: string, amountCents: number, now: Date) {
		const [row] = await this.executor
			.update(wallet)
			.set({
				availableBalanceCents: sql`${wallet.availableBalanceCents} - ${amountCents}`,
				totalSpentCents: sql`${wallet.totalSpentCents} + ${amountCents}`,
				updatedAt: now,
			})
			.where(eq(wallet.id, walletId))
			.returning({
				id: wallet.id,
				availableBalanceCents: wallet.availableBalanceCents,
			});
		return row ?? null;
	}

	async creditWallet(
		walletId: string,
		values: {
			creditedAmount: number;
			priceAmount: number;
			revenueAmount: number;
			updatedAt: Date;
		},
	) {
		const [row] = await this.executor
			.update(wallet)
			.set({
				availableBalanceCents: sql`${wallet.availableBalanceCents} + ${values.creditedAmount}`,
				totalDepositedCents: sql`${wallet.totalDepositedCents} + ${values.priceAmount}`,
				totalCreditedCents: sql`${wallet.totalCreditedCents} + ${values.creditedAmount}`,
				totalRevenueCents: sql`${wallet.totalRevenueCents} + ${values.revenueAmount}`,
				updatedAt: values.updatedAt,
			})
			.where(eq(wallet.id, walletId))
			.returning({
				id: wallet.id,
				userId: wallet.userId,
				availableBalanceCents: wallet.availableBalanceCents,
			});
		return row ?? null;
	}
}

/** Crypto top-up orders against a wallet. */
export class WalletTopupRepository extends BaseRepository<typeof walletTopup> {
	constructor(executor: Executor) {
		super(executor, walletTopup);
	}

	findByOrderId(orderId: string) {
		return this.findOne(eq(walletTopup.orderId, orderId));
	}

	findByProviderInvoiceId(providerInvoiceId: string) {
		return this.findOne(eq(walletTopup.providerInvoiceId, providerInvoiceId));
	}

	findByProviderPaymentId(providerPaymentId: string) {
		return this.findOne(eq(walletTopup.providerPaymentId, providerPaymentId));
	}

	listByUser(userId: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(walletTopup.userId, userId),
			orderBy: desc(walletTopup.createdAt),
			...page,
		});
	}

	listByWallet(walletId: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(walletTopup.walletId, walletId),
			orderBy: desc(walletTopup.createdAt),
			...page,
		});
	}

	findRecentByWallet(walletId: string, limit: number) {
		return this.findMany({
			where: eq(walletTopup.walletId, walletId),
			orderBy: desc(walletTopup.createdAt),
			limit,
		});
	}

	listByStatus(status: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(walletTopup.status, status),
			orderBy: desc(walletTopup.createdAt),
			...page,
		});
	}

	findByWebhookIdentifiers({
		providerPaymentId,
		providerInvoiceId,
		orderId,
	}: {
		providerPaymentId?: string | null;
		providerInvoiceId?: string | null;
		orderId?: string | null;
	}) {
		return this.findOne(
			or(
				...(providerPaymentId
					? [eq(walletTopup.providerPaymentId, providerPaymentId)]
					: []),
				...(providerInvoiceId
					? [eq(walletTopup.providerInvoiceId, providerInvoiceId)]
					: []),
				...(orderId ? [eq(walletTopup.orderId, orderId)] : []),
				eq(walletTopup.id, "__missing__"),
			),
		);
	}

	async creditTopup(
		id: string,
		values: {
			creditedAt: Date;
			revenueAmountCents: number;
			creditedAmountCents: number;
			updatedAt: Date;
		},
	) {
		const [row] = await this.executor
			.update(walletTopup)
			.set(values)
			.where(and(eq(walletTopup.id, id), isNull(walletTopup.creditedAt)))
			.returning();
		return row ?? null;
	}
}

/** Immutable, double-entry-style ledger of wallet balance movements. */
export class WalletLedgerEntryRepository extends BaseRepository<
	typeof walletLedgerEntry
> {
	constructor(executor: Executor) {
		super(executor, walletLedgerEntry);
	}

	findBySource(sourceType: string, sourceId: string, type: string) {
		return this.findOne(
			and(
				eq(walletLedgerEntry.sourceType, sourceType),
				eq(walletLedgerEntry.sourceId, sourceId),
				eq(walletLedgerEntry.type, type),
			),
		);
	}

	listByWallet(walletId: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(walletLedgerEntry.walletId, walletId),
			orderBy: desc(walletLedgerEntry.createdAt),
			...page,
		});
	}

	findRecentByWallet(walletId: string, limit: number) {
		return this.findMany({
			where: eq(walletLedgerEntry.walletId, walletId),
			orderBy: desc(walletLedgerEntry.createdAt),
			limit,
		});
	}

	listByUser(userId: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(walletLedgerEntry.userId, userId),
			orderBy: desc(walletLedgerEntry.createdAt),
			...page,
		});
	}

	async createDoNothing(values: typeof walletLedgerEntry.$inferInsert) {
		const [row] = await this.executor
			.insert(walletLedgerEntry)
			.values(values)
			.onConflictDoNothing({
				target: [
					walletLedgerEntry.sourceType,
					walletLedgerEntry.sourceId,
					walletLedgerEntry.type,
				],
			})
			.returning({ id: walletLedgerEntry.id });
		return row ?? null;
	}
}
