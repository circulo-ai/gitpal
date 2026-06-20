import { db } from "@gitpal/db";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import { and, eq, inArray, lt } from "drizzle-orm";
import { expireStaleReviewRuns } from "./review-runs";

const WEBHOOK_RECEIPT_TIMEOUT_MS = 30 * 60 * 1_000;
const REPOSITORY_RECONCILE_TIMEOUT_MS = 60 * 60 * 1_000;

export async function expireStaleDurableState() {
	const now = new Date();
	const [reviewRuns, webhookReceipts, repositories] = await Promise.all([
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
	]);

	return {
		reviewRuns,
		webhookReceipts: webhookReceipts.length,
		repositories: repositories.length,
	};
}
