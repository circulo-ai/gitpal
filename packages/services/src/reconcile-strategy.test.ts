import { describe, expect, test } from "bun:test";
import {
	getIncrementalReconcileWindow,
	hasWebhookDeliveryGap,
} from "./reconcile-strategy";

describe("incremental reconciliation", () => {
	const now = new Date("2026-06-22T12:00:00.000Z");

	test("performs a full sweep when a repository has never completed one", () => {
		expect(
			getIncrementalReconcileWindow(
				{ incrementalSyncCursor: null, lastFullReconciledAt: null },
				now,
			),
		).toEqual({ full: true, updatedAfter: undefined });
	});

	test("overlaps incremental cursors to avoid timestamp boundary gaps", () => {
		expect(
			getIncrementalReconcileWindow(
				{
					incrementalSyncCursor: new Date("2026-06-22T11:30:00.000Z"),
					lastFullReconciledAt: new Date("2026-06-22T06:00:00.000Z"),
				},
				now,
			),
		).toEqual({
			full: false,
			updatedAfter: "2026-06-22T11:28:00.000Z",
		});
	});

	test("returns to a full sweep after 24 hours", () => {
		expect(
			getIncrementalReconcileWindow(
				{
					incrementalSyncCursor: new Date("2026-06-22T11:30:00.000Z"),
					lastFullReconciledAt: new Date("2026-06-21T12:00:00.000Z"),
				},
				now,
			),
		).toEqual({ full: true, updatedAfter: undefined });
	});
});

describe("webhook gap detection", () => {
	const webhookCreatedAt = new Date("2026-06-22T10:00:00.000Z");
	const lastProviderActivityAt = new Date("2026-06-22T11:00:00.000Z");
	const lastReconciledAt = new Date("2026-06-22T11:05:00.000Z");

	test("detects provider activity that has no nearby delivery", () => {
		expect(
			hasWebhookDeliveryGap({
				webhookCreatedAt,
				lastDeliveredAt: new Date("2026-06-22T10:30:00.000Z"),
				lastProviderActivityAt,
				lastReconciledAt,
				lastGapDetectedAt: null,
			}),
		).toBe(true);
	});

	test("does not enqueue the same observed gap twice", () => {
		expect(
			hasWebhookDeliveryGap({
				webhookCreatedAt,
				lastDeliveredAt: null,
				lastProviderActivityAt,
				lastReconciledAt,
				lastGapDetectedAt: lastProviderActivityAt,
			}),
		).toBe(false);
	});
});
