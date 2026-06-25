import {
	notification,
	notificationChannel,
	notificationDelivery,
	observabilityEvent,
} from "@gitpal/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { BaseRepository, type PageRequest } from "./shared/base.repository";
import { conflictUpdateAllExcept } from "./shared/sql";
import type { Executor } from "./shared/types";

type NotificationChannelInsert = typeof notificationChannel.$inferInsert;

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
			and(eq(notification.userId, userId), eq(notification.status, "unread")),
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
			)
		);
	}

	listByUser(userId: string) {
		return this.findMany({
			where: eq(notificationChannel.userId, userId),
			orderBy: notificationChannel.label,
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
			)
		);
	}

	listByStatus(status: string, page: PageRequest = {}) {
		return this.findPage({
			where: eq(notificationDelivery.status, status),
			orderBy: desc(notificationDelivery.createdAt),
			...page,
		});
	}
}
