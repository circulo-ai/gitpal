import {
	integrationConnection,
	integrationOAuthState,
} from "@gitpal/db/schema";
import { and, eq, lte } from "drizzle-orm";
import { BaseRepository } from "./shared/base.repository";
import { conflictUpdateAllExcept } from "./shared/sql";
import type { Executor } from "./shared/types";

export type IntegrationConnection = typeof integrationConnection.$inferSelect;
export type IntegrationConnectionInsert =
	typeof integrationConnection.$inferInsert;
export type IntegrationOAuthState = typeof integrationOAuthState.$inferSelect;
export type IntegrationOAuthStateInsert =
	typeof integrationOAuthState.$inferInsert;

/** Configured third-party integrations, unique per (org, provider, label). */
export class IntegrationConnectionRepository extends BaseRepository<
	typeof integrationConnection
> {
	constructor(executor: Executor) {
		super(executor, integrationConnection);
	}

	findByOrgProviderLabel(
		organizationId: string,
		providerId: string,
		label: string,
	) {
		return this.findOne(
			and(
				eq(integrationConnection.organizationId, organizationId),
				eq(integrationConnection.providerId, providerId),
				eq(integrationConnection.label, label),
			),
		);
	}

	listByOrganization(organizationId: string) {
		return this.findMany({
			where: eq(integrationConnection.organizationId, organizationId),
			orderBy: integrationConnection.label,
		});
	}

	listByOrganizationSorted(organizationId: string) {
		return this.findMany({
			where: eq(integrationConnection.organizationId, organizationId),
			orderBy: [
				integrationConnection.providerType,
				integrationConnection.label,
			],
		});
	}

	listEnabledByType(organizationId: string, providerType: string) {
		return this.findMany({
			where: and(
				eq(integrationConnection.organizationId, organizationId),
				eq(integrationConnection.providerType, providerType),
				eq(integrationConnection.enabled, true),
			),
			orderBy: integrationConnection.label,
		});
	}

	async upsert(values: IntegrationConnectionInsert) {
		const [row] = await this.executor
			.insert(integrationConnection)
			.values(values)
			.onConflictDoUpdate({
				target: [
					integrationConnection.organizationId,
					integrationConnection.providerId,
					integrationConnection.label,
				],
				set: conflictUpdateAllExcept(integrationConnection, [
					"id",
					"organizationId",
					"providerId",
					"label",
					"createdAt",
				]),
			})
			.returning();
		return row;
	}

	async upsertById(values: IntegrationConnectionInsert) {
		const [row] = await this.executor
			.insert(integrationConnection)
			.values(values)
			.onConflictDoUpdate({
				target: integrationConnection.id,
				set: conflictUpdateAllExcept(integrationConnection, [
					"id",
					"organizationId",
					"providerId",
					"createdAt",
				]),
			})
			.returning();
		return row;
	}

	findByIdAndOrg(id: string, organizationId: string) {
		return this.findOne(
			and(
				eq(integrationConnection.id, id),
				eq(integrationConnection.organizationId, organizationId),
			),
		);
	}

	async setEnabled(id: string, organizationId: string, enabled: boolean) {
		const [row] = await this.executor
			.update(integrationConnection)
			.set({
				enabled,
				status: enabled ? "connected" : "disabled",
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(integrationConnection.id, id),
					eq(integrationConnection.organizationId, organizationId),
				),
			)
			.returning();
		return row ?? null;
	}

	async deleteByIdAndOrg(id: string, organizationId: string) {
		const deleted = await this.executor
			.delete(integrationConnection)
			.where(
				and(
					eq(integrationConnection.id, id),
					eq(integrationConnection.organizationId, organizationId),
				),
			)
			.returning({ id: integrationConnection.id });
		return deleted.length > 0;
	}

	listEnabledByOrg(organizationId: string) {
		return this.findMany({
			where: and(
				eq(integrationConnection.organizationId, organizationId),
				eq(integrationConnection.enabled, true),
			),
			orderBy: integrationConnection.label,
		});
	}

	listEnabledOAuthConnections() {
		return this.findMany({
			where: and(
				eq(integrationConnection.authMethod, "oauth"),
				eq(integrationConnection.enabled, true),
			),
		});
	}

	findEnabledByOrgAndProvider(organizationId: string, providerId: string) {
		return this.findOne(
			and(
				eq(integrationConnection.organizationId, organizationId),
				eq(integrationConnection.providerId, providerId),
				eq(integrationConnection.enabled, true),
			),
		);
	}

	async findByIdForUpdate(id: string) {
		const [row] = await this.executor
			.select()
			.from(integrationConnection)
			.where(eq(integrationConnection.id, id))
			.limit(1)
			.for("update");
		return row ?? null;
	}

	touchLastUsed(id: string, when: Date = new Date()) {
		return this.updateById(id, { lastUsedAt: when });
	}
}

/** Short-lived OAuth/PKCE handshake state, unique by `state`. */
export class IntegrationOAuthStateRepository extends BaseRepository<
	typeof integrationOAuthState
> {
	constructor(executor: Executor) {
		super(executor, integrationOAuthState);
	}

	findByState(state: string) {
		return this.findOne(eq(integrationOAuthState.state, state));
	}

	deleteByState(state: string) {
		return this.deleteMany(eq(integrationOAuthState.state, state));
	}

	async deleteAndReturnByState(state: string) {
		const [row] = await this.executor
			.delete(integrationOAuthState)
			.where(eq(integrationOAuthState.state, state))
			.returning();
		return row ?? null;
	}

	/** Garbage-collect expired handshakes; returns the number deleted. */
	deleteExpired(now: Date = new Date()) {
		return this.deleteMany(lte(integrationOAuthState.expiresAt, now));
	}
}
