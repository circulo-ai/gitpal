import { randomUUID } from "node:crypto";
import { createDb } from "@gitpal/db";
import * as authSchema from "@gitpal/db/schema/auth";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import * as observabilitySchema from "@gitpal/db/schema/observability";
import { and, eq, inArray } from "drizzle-orm";
import { recordObservabilityEvent } from "./observability";

const db: ReturnType<typeof createDb> = createDb();
type NotificationDbExecutor = Pick<typeof db, "insert">;

export type NotificationSeverity = "info" | "success" | "warning" | "error";

export type SendUserNotificationInput = {
	userId: string;
	organizationId?: string | null;
	repositoryId?: string | null;
	type: string;
	category: string;
	severity?: NotificationSeverity;
	title: string;
	body?: string | null;
	actionHref?: string | null;
	sourceType?: string | null;
	sourceId?: string | null;
	dedupeKey?: string | null;
	metadata?: Record<string, unknown> | null;
};

function notificationId() {
	return `ntf_${randomUUID()}`;
}

function buildNotificationDedupeKey(input: SendUserNotificationInput) {
	return input.dedupeKey ?? null;
}

export async function sendUserNotification(
	input: SendUserNotificationInput,
	executor: NotificationDbExecutor = db,
) {
	const now = new Date();
	const dedupeKey = buildNotificationDedupeKey(input);
	const values = {
		id: notificationId(),
		userId: input.userId,
		organizationId: input.organizationId ?? null,
		repositoryId: input.repositoryId ?? null,
		type: input.type,
		category: input.category,
		severity: input.severity ?? "info",
		status: "unread",
		title: input.title,
		body: input.body ?? null,
		actionHref: input.actionHref ?? null,
		sourceType: input.sourceType ?? null,
		sourceId: input.sourceId ?? null,
		dedupeKey,
		metadata: input.metadata ?? {},
		readAt: null,
		archivedAt: null,
		createdAt: now,
		updatedAt: now,
	};

	const [notification] = await executor
		.insert(observabilitySchema.notification)
		.values(values)
		.onConflictDoUpdate({
			target: observabilitySchema.notification.dedupeKey,
			set: {
				organizationId: values.organizationId,
				repositoryId: values.repositoryId,
				type: values.type,
				category: values.category,
				severity: values.severity,
				status: "unread",
				title: values.title,
				body: values.body,
				actionHref: values.actionHref,
				sourceType: values.sourceType,
				sourceId: values.sourceId,
				metadata: values.metadata,
				readAt: null,
				archivedAt: null,
				updatedAt: now,
			},
		})
		.returning();

	await recordObservabilityEvent({
		userId: input.userId,
		organizationId: input.organizationId,
		repositoryId: input.repositoryId,
		kind: "notification",
		action: input.type,
		status: "sent",
		severity: input.severity ?? "info",
		title: input.title,
		body: input.body,
		sourceType: input.sourceType ?? "notification",
		sourceId: input.sourceId ?? notification?.id ?? null,
		dedupeKey: dedupeKey ? `notification-event:${dedupeKey}` : null,
		metadata: {
			category: input.category,
			actionHref: input.actionHref ?? null,
			...(input.metadata ?? {}),
		},
	});

	return notification;
}

export async function sendManyUserNotifications(
	notifications: SendUserNotificationInput[],
) {
	return Promise.all(
		notifications.map((notification) => sendUserNotification(notification)),
	);
}

export async function sendRepositoryNotification({
	repositoryId,
	...notification
}: Omit<SendUserNotificationInput, "userId" | "repositoryId"> & {
	repositoryId: string;
}) {
	const accessRows = await db
		.select({
			userId: dashboardSchema.repositoryAccess.userId,
			organizationId: dashboardSchema.repository.organizationId,
		})
		.from(dashboardSchema.repositoryAccess)
		.innerJoin(
			dashboardSchema.repository,
			eq(
				dashboardSchema.repositoryAccess.repositoryId,
				dashboardSchema.repository.id,
			),
		)
		.where(
			and(
				eq(dashboardSchema.repositoryAccess.repositoryId, repositoryId),
				eq(dashboardSchema.repositoryAccess.enabled, true),
			),
		);

	return sendManyUserNotifications(
		accessRows.map((row) => ({
			...notification,
			userId: row.userId,
			organizationId: notification.organizationId ?? row.organizationId,
			repositoryId,
			dedupeKey: notification.dedupeKey
				? `${notification.dedupeKey}:${row.userId}`
				: null,
		})),
	);
}

export async function sendOrganizationNotification({
	organizationId,
	...notification
}: Omit<SendUserNotificationInput, "userId" | "organizationId"> & {
	organizationId: string;
}) {
	const members = await db
		.select({ userId: authSchema.member.userId })
		.from(authSchema.member)
		.where(eq(authSchema.member.organizationId, organizationId));

	return sendManyUserNotifications(
		members.map((member) => ({
			...notification,
			userId: member.userId,
			organizationId,
			dedupeKey: notification.dedupeKey
				? `${notification.dedupeKey}:${member.userId}`
				: null,
		})),
	);
}

export async function sendSelectedUserNotifications({
	userIds,
	...notification
}: Omit<SendUserNotificationInput, "userId"> & {
	userIds: string[];
}) {
	const uniqueUserIds = [...new Set(userIds)].filter(Boolean);

	if (uniqueUserIds.length === 0) {
		return [];
	}

	const users = await db
		.select({ id: authSchema.user.id })
		.from(authSchema.user)
		.where(inArray(authSchema.user.id, uniqueUserIds));

	return sendManyUserNotifications(
		users.map((user) => ({
			...notification,
			userId: user.id,
			dedupeKey: notification.dedupeKey
				? `${notification.dedupeKey}:${user.id}`
				: null,
		})),
	);
}
