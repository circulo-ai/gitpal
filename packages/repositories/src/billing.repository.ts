import {
	organizationBudget,
	wallet,
	walletLedgerEntry,
	walletTopup,
} from "@gitpal/db/schema";
import { and, desc, eq } from "drizzle-orm";
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

	listByStatus(status: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(walletTopup.status, status),
			orderBy: desc(walletTopup.createdAt),
			...page,
		});
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

	listByUser(userId: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(walletLedgerEntry.userId, userId),
			orderBy: desc(walletLedgerEntry.createdAt),
			...page,
		});
	}
}
