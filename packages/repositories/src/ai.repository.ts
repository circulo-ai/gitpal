import {
	aiGeneration,
	userLlmApiKey,
	userLlmRoutingSettings,
} from "@gitpal/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { BaseRepository, type PageRequest } from "./shared/base.repository";
import { conflictUpdateAllExcept } from "./shared/sql";
import type { Executor } from "./shared/types";

type RoutingSettingsInsert = typeof userLlmRoutingSettings.$inferInsert;
type LlmApiKeyInsert = typeof userLlmApiKey.$inferInsert;

/** Per-user LLM routing preferences (one row per user). */
export class UserLlmRoutingSettingsRepository extends BaseRepository<
	typeof userLlmRoutingSettings
> {
	constructor(executor: Executor) {
		super(executor, userLlmRoutingSettings);
	}

	findByUserId(userId: string) {
		return this.findOne(eq(userLlmRoutingSettings.userId, userId));
	}

	async upsertForUser(values: RoutingSettingsInsert) {
		const [row] = await this.executor
			.insert(userLlmRoutingSettings)
			.values(values)
			.onConflictDoUpdate({
				target: userLlmRoutingSettings.userId,
				set: conflictUpdateAllExcept(userLlmRoutingSettings, [
					"id",
					"userId",
					"createdAt",
				]),
			})
			.returning();
		return row;
	}
}

/** Bring-your-own-key LLM credentials, unique per (user, provider, name). */
export class UserLlmApiKeyRepository extends BaseRepository<
	typeof userLlmApiKey
> {
	constructor(executor: Executor) {
		super(executor, userLlmApiKey);
	}

	findByUserProviderName(userId: string, providerId: string, name: string) {
		return this.findOne(
			and(
				eq(userLlmApiKey.userId, userId),
				eq(userLlmApiKey.providerId, providerId),
				eq(userLlmApiKey.name, name),
			)
		);
	}

	listByUser(userId: string) {
		return this.findMany({
			where: eq(userLlmApiKey.userId, userId),
			orderBy: [desc(userLlmApiKey.enabled), userLlmApiKey.priority],
		});
	}

	listEnabledByUserAndProvider(userId: string, providerId: string) {
		return this.findMany({
			where: and(
				eq(userLlmApiKey.userId, userId),
				eq(userLlmApiKey.providerId, providerId),
				eq(userLlmApiKey.enabled, true),
			),
			orderBy: userLlmApiKey.priority,
		});
	}

	async upsertForUser(values: LlmApiKeyInsert) {
		const [row] = await this.executor
			.insert(userLlmApiKey)
			.values(values)
			.onConflictDoUpdate({
				target: [
					userLlmApiKey.userId,
					userLlmApiKey.providerId,
					userLlmApiKey.name,
				],
				set: conflictUpdateAllExcept(userLlmApiKey, [
					"id",
					"userId",
					"providerId",
					"name",
					"createdAt",
				]),
			})
			.returning();
		return row;
	}

	setEnabled(id: string, enabled: boolean) {
		return this.updateById(id, { enabled });
	}
}

/** Append-only log of individual LLM generations / billing events. */
export class AiGenerationRepository extends BaseRepository<
	typeof aiGeneration
> {
	constructor(executor: Executor) {
		super(executor, aiGeneration);
	}

	findByProviderGenerationId(providerGenerationId: string) {
		return this.findOne(
			eq(aiGeneration.providerGenerationId, providerGenerationId),
		);
	}

	listByUser(userId: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(aiGeneration.userId, userId),
			orderBy: desc(aiGeneration.createdAt),
			...page,
		});
	}

	listByOrganization(organizationId: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(aiGeneration.organizationId, organizationId),
			orderBy: desc(aiGeneration.createdAt),
			...page,
		});
	}

	listByReviewRun(reviewRunId: string) {
		return this.findMany({
			where: eq(aiGeneration.reviewRunId, reviewRunId),
			orderBy: desc(aiGeneration.createdAt),
		});
	}

	listByRepository(repositoryId: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(aiGeneration.repositoryId, repositoryId),
			orderBy: desc(aiGeneration.createdAt),
			...page,
		});
	}

	listByStatus(status: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(aiGeneration.status, status),
			orderBy: desc(aiGeneration.createdAt),
			...page,
		});
	}
}
