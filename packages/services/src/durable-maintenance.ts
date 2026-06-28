import { refreshExpiringProviderAccounts } from "@gitpal/auth";
import { enqueuePullRequestSyncJob } from "@gitpal/jobs/inngest/functions/pr-sync";
import { repositories } from "@gitpal/repositories";
import { refreshExpiringIntegrationTokens } from "./integrations";
import { hasWebhookDeliveryGap } from "./reconcile-strategy";
import { expireStaleReviewRuns } from "./review-runs";

const WEBHOOK_RECEIPT_TIMEOUT_MS = 30 * 60 * 1_000;
const REPOSITORY_RECONCILE_TIMEOUT_MS = 60 * 60 * 1_000;

async function detectAndQueueWebhookGaps(now: Date) {
	const rows = await repositories.repositoryWebhook.listWebhookGapCandidates();
	const gaps = rows.filter(hasWebhookDeliveryGap);
	for (const gap of gaps) {
		await enqueuePullRequestSyncJob({
			repositoryId: gap.repositoryId,
			reason: "webhook-gap",
			requestId: `webhook-gap:${gap.lastProviderActivityAt?.toISOString() ?? now.toISOString()}`,
		});
		await repositories.repository.updateById(gap.repositoryId, {
			webhookGapDetectedAt: now,
			updatedAt: now,
		});
	}
	return gaps.length;
}

export async function expireStaleDurableState() {
	const now = new Date();
	const [reviewRuns, webhookReceipts, expiredRepos, webhookGaps] =
		await Promise.all([
			expireStaleReviewRuns(),
			repositories.webhookEventReceipt.expireStaleReceipts(
				now,
				WEBHOOK_RECEIPT_TIMEOUT_MS,
			),
			repositories.repository.expireStaleReconciliations(
				now,
				REPOSITORY_RECONCILE_TIMEOUT_MS,
			),
			detectAndQueueWebhookGaps(now),
		]);

	return {
		reviewRuns,
		webhookReceipts: webhookReceipts.length,
		repositories: expiredRepos.length,
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
