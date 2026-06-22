import { refreshExpiringProviderAccounts } from "@gitpal/auth";
import { db } from "@gitpal/db";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import { enqueuePullRequestSyncJob } from "@gitpal/jobs/inngest/functions/pr-sync";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { refreshExpiringIntegrationTokens } from "./integrations";
import { hasWebhookDeliveryGap } from "./reconcile-strategy";
import { expireStaleReviewRuns } from "./review-runs";

const WEBHOOK_RECEIPT_TIMEOUT_MS = 30 * 60 * 1_000;
const REPOSITORY_RECONCILE_TIMEOUT_MS = 60 * 60 * 1_000;

async function detectAndQueueWebhookGaps(now: Date) {
	const lastProviderActivityAt = sql<Date | null>`greatest(
		(select max(${dashboardSchema.pullRequest.updatedAt}) from ${dashboardSchema.pullRequest} where ${dashboardSchema.pullRequest.repositoryId} = ${dashboardSchema.repository.id}),
		(select max(${dashboardSchema.issue.updatedAt}) from ${dashboardSchema.issue} where ${dashboardSchema.issue.repositoryId} = ${dashboardSchema.repository.id})
	)`;
	const rows = await db
		.select({
			repositoryId: dashboardSchema.repository.id,
			webhookCreatedAt: dashboardSchema.repositoryWebhook.createdAt,
			lastDeliveredAt: dashboardSchema.repositoryWebhook.lastDeliveredAt,
			lastProviderActivityAt,
			lastReconciledAt: dashboardSchema.repository.lastReconciledAt,
			lastGapDetectedAt: dashboardSchema.repository.webhookGapDetectedAt,
		})
		.from(dashboardSchema.repositoryWebhook)
		.innerJoin(
			dashboardSchema.repository,
			eq(
				dashboardSchema.repositoryWebhook.repositoryId,
				dashboardSchema.repository.id,
			),
		)
		.where(eq(dashboardSchema.repositoryWebhook.enabled, true));
	const gaps = rows.filter(hasWebhookDeliveryGap);
	for (const gap of gaps) {
		await enqueuePullRequestSyncJob({
			repositoryId: gap.repositoryId,
			reason: "webhook-gap",
			requestId: `webhook-gap:${gap.lastProviderActivityAt?.toISOString() ?? now.toISOString()}`,
		});
		await db
			.update(dashboardSchema.repository)
			.set({ webhookGapDetectedAt: now, updatedAt: now })
			.where(eq(dashboardSchema.repository.id, gap.repositoryId));
	}
	return gaps.length;
}

export async function expireStaleDurableState() {
	const now = new Date();
	const [reviewRuns, webhookReceipts, repositories, webhookGaps] =
		await Promise.all([
			expireStaleReviewRuns(),
			db
				.update(dashboardSchema.webhookEventReceipt)
				.set({ status: "failed", processedAt: now, updatedAt: now })
				.where(
					and(
						inArray(dashboardSchema.webhookEventReceipt.status, [
							"received",
							"processing",
						]),
						lt(
							dashboardSchema.webhookEventReceipt.updatedAt,
							new Date(now.getTime() - WEBHOOK_RECEIPT_TIMEOUT_MS),
						),
					),
				)
				.returning({ id: dashboardSchema.webhookEventReceipt.id }),
			db
				.update(dashboardSchema.repository)
				.set({
					reconcileState: "failed",
					lastReconcileFailedAt: now,
					lastReconcileError: "Repository reconciliation timed out.",
					updatedAt: now,
				})
				.where(
					and(
						eq(dashboardSchema.repository.reconcileState, "running"),
						lt(
							dashboardSchema.repository.lastReconcileStartedAt,
							new Date(now.getTime() - REPOSITORY_RECONCILE_TIMEOUT_MS),
						),
					),
				)
				.returning({ id: dashboardSchema.repository.id }),
			detectAndQueueWebhookGaps(now),
		]);

	return {
		reviewRuns,
		webhookReceipts: webhookReceipts.length,
		repositories: repositories.length,
		webhookGaps,
	};
}

export async function refreshDurableCredentials() {
	const [providerAccounts, integrations] = await Promise.all([
		refreshExpiringProviderAccounts(),
		refreshExpiringIntegrationTokens(),
	]);
	return { providerAccounts, integrations };
}
