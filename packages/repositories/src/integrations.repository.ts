import { and, eq, lte } from "drizzle-orm";

import { integrationConnection, integrationOAuthState } from "@gitpal/db/schema";
import { BaseRepository } from "./shared/base.repository";
import { conflictUpdateAllExcept } from "./shared/sql";
import type { Executor } from "./shared/types";

type IntegrationConnectionInsert = typeof integrationConnection.$inferInsert;

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
			)
		);
	}

	listByOrganization(organizationId: string) {
		return this.findMany({
			where: eq(integrationConnection.organizationId, organizationId),
			orderBy: integrationConnection.label,
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

	/** Garbage-collect expired handshakes; returns the number deleted. */
	deleteExpired(now: Date = new Date()) {
		return this.deleteMany(lte(integrationOAuthState.expiresAt, now));
	}
}
