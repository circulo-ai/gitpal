import {
	notification,
	notificationChannel,
	notificationDelivery,
	observabilityEvent,
} from "@gitpal/db/schema";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { BaseRepository, type PageRequest } from "./shared/base.repository";
import { conflictUpdateAllExcept } from "./shared/sql";
import type { Executor } from "./shared/types";

type NotificationChannelInsert = typeof notificationChannel.$inferInsert;

export type Notification = typeof notification.$inferSelect;
export type NotificationChannel = typeof notificationChannel.$inferSelect;
export type NotificationDelivery = typeof notificationDelivery.$inferSelect;

/** Append-only structured audit/telemetry events. */
export class ObservabilityEventRepository extends BaseRepository<
	typeof observabilityEvent
> {
	constructor(executor: Executor) {
		super(executor, observabilityEvent);
	}

	findByDedupeKey(dedupeKey: string) {
		return this.findOne(eq(observabilityEvent.dedupeKey, dedupeKey));
	}

	async upsertByDedupeKey(values: typeof observabilityEvent.$inferInsert) {
		const [row] = await this.executor
			.insert(observabilityEvent)
			.values(values)
			.onConflictDoUpdate({
				target: observabilityEvent.dedupeKey,
				set: conflictUpdateAllExcept(observabilityEvent, [
					"id",
					"userId",
					"createdAt",
					"dedupeKey",
				]),
			})
			.returning();
		return row;
	}

	listByUser(userId: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(observabilityEvent.userId, userId),
			orderBy: desc(observabilityEvent.occurredAt),
			...page,
		});
	}

	listByUserAndStatus(userId: string, status: string, page: PageRequest = {}) {
		return this.findPage({
			where: and(
				eq(observabilityEvent.userId, userId),
				eq(observabilityEvent.status, status),
			),
			orderBy: desc(observabilityEvent.occurredAt),
			...page,
		});
	}

	listByReviewRun(reviewRunId: string) {
		return this.findMany({
			where: eq(observabilityEvent.reviewRunId, reviewRunId),
			orderBy: desc(observabilityEvent.occurredAt),
		});
	}

	listByReviewRunIds(reviewRunIds: string[]) {
		if (reviewRunIds.length === 0) return Promise.resolve([]);
		return this.findMany({
			where: inArray(observabilityEvent.reviewRunId, reviewRunIds),
			orderBy: observabilityEvent.occurredAt,
		});
	}

	listByTrace(traceId: string) {
		return this.findMany({
			where: eq(observabilityEvent.traceId, traceId),
			orderBy: observabilityEvent.occurredAt,
		});
	}

	listByRepository(repositoryId: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(observabilityEvent.repositoryId, repositoryId),
			orderBy: desc(observabilityEvent.occurredAt),
			...page,
		});
	}
}

/** In-app notifications addressed to a user. */
export class NotificationRepository extends BaseRepository<
	typeof notification
> {
	constructor(executor: Executor) {
		super(executor, notification);
	}

	findByDedupeKey(dedupeKey: string) {
		return this.findOne(eq(notification.dedupeKey, dedupeKey));
	}

	async upsertByDedupeKey(values: typeof notification.$inferInsert) {
		const [row] = await this.executor
			.insert(notification)
			.values(values)
			.onConflictDoUpdate({
				target: notification.dedupeKey,
				set: conflictUpdateAllExcept(notification, [
					"id",
					"userId",
					"createdAt",
					"dedupeKey",
				]),
			})
			.returning();
		return row;
	}

	listNotifications({
		userId,
		status = "active",
		limit = 40,
	}: {
		userId: string;
		status?: "active" | "all" | "archived" | "read" | "unread";
		limit?: number;
	}) {
		const conditions = [eq(notification.userId, userId)];

		if (status === "active") {
			conditions.push(isNull(notification.archivedAt));
		} else if (status !== "all") {
			conditions.push(eq(notification.status, status));
		}

		return this.findMany({
			where: and(...conditions),
			orderBy: desc(notification.createdAt),
			limit,
		});
	}

	listByUser(userId: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(notification.userId, userId),
			orderBy: desc(notification.createdAt),
			...page,
		});
	}

	listUnreadByUser(userId: string, page: PageRequest = {}) {
		return this.findPage({
			where: and(
				eq(notification.userId, userId),
				eq(notification.status, "unread"),
			),
			orderBy: desc(notification.createdAt),
			...page,
		});
	}

	countUnread(userId: string) {
		return this.count(
			and(
				eq(notification.userId, userId),
				eq(notification.status, "unread"),
				isNull(notification.archivedAt),
			),
		);
	}

	markAsRead(id: string, when: Date = new Date()) {
		return this.updateById(id, { status: "read", readAt: when });
	}

	archive(id: string, when: Date = new Date()) {
		return this.updateById(id, { status: "archived", archivedAt: when });
	}

	async markAllAsRead(userId: string, when: Date = new Date()) {
		const rows = await this.executor
			.update(notification)
			.set({ status: "read", readAt: when })
			.where(
				and(eq(notification.userId, userId), eq(notification.status, "unread")),
			)
			.returning({ id: notification.id });
		return rows.length;
	}

	async markReadMany(userId: string, ids: string[], when: Date = new Date()) {
		if (ids.length === 0) return 0;
		const rows = await this.executor
			.update(notification)
			.set({ status: "read", readAt: when, updatedAt: when })
			.where(
				and(eq(notification.userId, userId), inArray(notification.id, ids)),
			)
			.returning({ id: notification.id });
		return rows.length;
	}

	async markAllRead(userId: string, when: Date = new Date()) {
		const rows = await this.executor
			.update(notification)
			.set({ status: "read", readAt: when, updatedAt: when })
			.where(
				and(
					eq(notification.userId, userId),
					eq(notification.status, "unread"),
					isNull(notification.archivedAt),
				),
			)
			.returning({ id: notification.id });
		return rows.length;
	}

	async archiveMany(userId: string, ids: string[], when: Date = new Date()) {
		if (ids.length === 0) return 0;
		const rows = await this.executor
			.update(notification)
			.set({ status: "archived", archivedAt: when, updatedAt: when })
			.where(
				and(eq(notification.userId, userId), inArray(notification.id, ids)),
			)
			.returning({ id: notification.id });
		return rows.length;
	}

	async archiveByDedupeKey(
		userId: string,
		dedupeKey: string,
		when: Date = new Date(),
	) {
		const rows = await this.executor
			.update(notification)
			.set({ status: "archived", archivedAt: when, updatedAt: when })
			.where(
				and(
					eq(notification.userId, userId),
					eq(notification.dedupeKey, dedupeKey),
					isNull(notification.archivedAt),
				),
			)
			.returning({ id: notification.id });
		return rows.length;
	}
}

/** Outbound delivery channels (email, slack, ...), unique per (user, provider, label). */
export class NotificationChannelRepository extends BaseRepository<
	typeof notificationChannel
> {
	constructor(executor: Executor) {
		super(executor, notificationChannel);
	}

	findByUserProviderLabel(userId: string, provider: string, label: string) {
		return this.findOne(
			and(
				eq(notificationChannel.userId, userId),
				eq(notificationChannel.provider, provider),
				eq(notificationChannel.label, label),
			),
		);
	}

	listByUser(userId: string) {
		return this.findMany({
			where: eq(notificationChannel.userId, userId),
			orderBy: notificationChannel.label,
		});
	}

	listByUserOrdered(userId: string) {
		return this.findMany({
			where: eq(notificationChannel.userId, userId),
			orderBy: [
				asc(notificationChannel.provider),
				asc(notificationChannel.label),
			],
		});
	}

	listEnabledByUser(userId: string) {
		return this.findMany({
			where: and(
				eq(notificationChannel.userId, userId),
				eq(notificationChannel.enabled, true),
			),
			orderBy: notificationChannel.label,
		});
	}

	async upsert(values: NotificationChannelInsert) {
		const [row] = await this.executor
			.insert(notificationChannel)
			.values(values)
			.onConflictDoUpdate({
				target: [
					notificationChannel.userId,
					notificationChannel.provider,
					notificationChannel.label,
				],
				set: conflictUpdateAllExcept(notificationChannel, [
					"id",
					"userId",
					"provider",
					"label",
					"createdAt",
				]),
			})
			.returning();
		return row;
	}
}

/** Per-channel delivery attempts for a notification. */
export class NotificationDeliveryRepository extends BaseRepository<
	typeof notificationDelivery
> {
	constructor(executor: Executor) {
		super(executor, notificationDelivery);
	}

	listByNotification(notificationId: string) {
		return this.findMany({
			where: eq(notificationDelivery.notificationId, notificationId),
			orderBy: desc(notificationDelivery.createdAt),
		});
	}

	findByNotificationAndChannel(notificationId: string, channelId: string) {
		return this.findOne(
			and(
				eq(notificationDelivery.notificationId, notificationId),
				eq(notificationDelivery.channelId, channelId),
			),
		);
	}

	async upsertDelivery(values: typeof notificationDelivery.$inferInsert) {
		const [row] = await this.executor
			.insert(notificationDelivery)
			.values(values)
			.onConflictDoUpdate({
				target: [
					notificationDelivery.notificationId,
					notificationDelivery.channelId,
				],
				set: {
					provider: values.provider,
					status: values.status,
					attemptCount: sql`${notificationDelivery.attemptCount} + 1`,
					error: values.error ?? null,
					metadata: values.metadata ?? null,
					deliveredAt: values.deliveredAt ?? null,
				},
			})
			.returning();
		return row;
	}

	listByStatus(status: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(notificationDelivery.status, status),
			orderBy: desc(notificationDelivery.createdAt),
			...page,
		});
	}
}
