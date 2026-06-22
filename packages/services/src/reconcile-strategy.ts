const FULL_RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const INCREMENTAL_CURSOR_OVERLAP_MS = 2 * 60 * 1_000;
const WEBHOOK_GAP_GRACE_MS = 2 * 60 * 1_000;

export function getIncrementalReconcileWindow(
	repository: {
		incrementalSyncCursor: Date | null;
		lastFullReconciledAt: Date | null;
	},
	now = new Date(),
) {
	const full =
		!repository.lastFullReconciledAt ||
		now.getTime() - repository.lastFullReconciledAt.getTime() >=
			FULL_RECONCILE_INTERVAL_MS;
	return {
		full,
		updatedAfter:
			full || !repository.incrementalSyncCursor
				? undefined
				: new Date(
						repository.incrementalSyncCursor.getTime() -
							INCREMENTAL_CURSOR_OVERLAP_MS,
					).toISOString(),
	};
}

export function hasWebhookDeliveryGap({
	webhookCreatedAt,
	lastDeliveredAt,
	lastProviderActivityAt,
	lastReconciledAt,
	lastGapDetectedAt,
}: {
	webhookCreatedAt: Date;
	lastDeliveredAt: Date | null;
	lastProviderActivityAt: Date | null;
	lastReconciledAt: Date | null;
	lastGapDetectedAt: Date | null;
}) {
	if (!lastProviderActivityAt || !lastReconciledAt) return false;
	if (lastProviderActivityAt <= webhookCreatedAt) return false;
	if (lastReconciledAt < lastProviderActivityAt) return false;
	if (lastGapDetectedAt && lastGapDetectedAt >= lastProviderActivityAt) {
		return false;
	}
	return (
		!lastDeliveredAt ||
		lastProviderActivityAt.getTime() - lastDeliveredAt.getTime() >
			WEBHOOK_GAP_GRACE_MS
	);
}
