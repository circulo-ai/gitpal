import { randomUUID } from "node:crypto";
import { db } from "@gitpal/db";
import * as authSchema from "@gitpal/db/schema/auth";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import * as observabilitySchema from "@gitpal/db/schema/observability";
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { recordObservabilityEvent } from "./observability";
import {
	decryptSecretEnvelope,
	encryptSecretEnvelope,
} from "./secret-envelope";

type NotificationDbExecutor = Pick<typeof db, "insert">;

export type NotificationSeverity = "info" | "success" | "warning" | "error";
export type NotificationChannelProvider = "telegram";
export type NotificationChannelStatus =
	| "configured"
	| "connected"
	| "disabled"
	| "error";

export const notificationCategoryOptions = [
	"review",
	"billing",
	"ai",
	"webhook",
	"correctness",
	"security",
	"performance",
	"maintainability",
	"testing",
	"documentation",
	"architecture",
] as const;

export const notificationSeverityOptions = [
	"info",
	"success",
	"warning",
	"error",
] as const;

const notificationChannelProviderSchema = z.enum(["telegram"]);
const notificationChannelSettingsSchema = z.object({
	categories: z
		.array(z.string().min(1))
		.default([...notificationCategoryOptions]),
	severities: z
		.array(z.enum(notificationSeverityOptions))
		.default(["success", "warning", "error"]),
});
const telegramCredentialSchema = z.object({
	botToken: z.string().min(1),
	chatId: z.string().min(1),
});
const notificationChannelCredentialSchema = z.object({
	telegram: telegramCredentialSchema.optional(),
});

export type NotificationChannelSettings = z.infer<
	typeof notificationChannelSettingsSchema
>;

export type NotificationChannelUpsertInput = {
	channelId?: string;
	provider: NotificationChannelProvider;
	label: string;
	enabled: boolean;
	settings: NotificationChannelSettings;
	telegram?: {
		botToken?: string;
		chatId?: string;
	};
};

export type NotificationChannelPublic = ReturnType<
	typeof serializeNotificationChannel
>;

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

function notificationChannelId() {
	return `ntc_${randomUUID()}`;
}

function notificationDeliveryId() {
	return `ntd_${randomUUID()}`;
}

function buildNotificationDedupeKey(input: SendUserNotificationInput) {
	return input.dedupeKey ?? null;
}

function redactSecret(value: string | null | undefined) {
	if (!value) {
		return null;
	}

	if (value.length <= 8) {
		return "****";
	}

	return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : "Unknown notification error.";
}

function parseChannelSettings(value: unknown) {
	return notificationChannelSettingsSchema.parse(value ?? {});
}

function parseChannelStatus(value: string): NotificationChannelStatus {
	if (
		value === "configured" ||
		value === "connected" ||
		value === "disabled" ||
		value === "error"
	) {
		return value;
	}

	return "configured";
}

function serializeNotificationChannel(
	row: typeof observabilitySchema.notificationChannel.$inferSelect,
) {
	const credentials = decryptSecretEnvelope(
		row.credentialEnvelope,
		notificationChannelCredentialSchema,
	);

	return {
		id: row.id,
		userId: row.userId,
		organizationId: row.organizationId,
		provider: notificationChannelProviderSchema.parse(row.provider),
		label: row.label,
		targetPreview: row.targetPreview,
		credentialPreview: redactSecret(credentials?.telegram?.botToken),
		settings: parseChannelSettings(row.settings),
		status: parseChannelStatus(row.status),
		enabled: row.enabled,
		lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
		lastError: row.lastError,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function shouldDeliverToChannel({
	channel,
	notification,
}: {
	channel: typeof observabilitySchema.notificationChannel.$inferSelect;
	notification: typeof observabilitySchema.notification.$inferSelect;
}) {
	if (!channel.enabled || channel.status === "disabled") {
		return false;
	}

	const settings = parseChannelSettings(channel.settings);
	return (
		settings.categories.includes(notification.category) &&
		settings.severities.includes(notification.severity as NotificationSeverity)
	);
}

function buildTelegramMessage(
	notification: typeof observabilitySchema.notification.$inferSelect,
) {
	return [
		`GitPal: ${notification.title}`,
		notification.body ? `\n${notification.body}` : null,
		notification.actionHref ? `\nOpen: ${notification.actionHref}` : null,
		`\nCategory: ${notification.category}`,
		`Severity: ${notification.severity}`,
	]
		.filter(Boolean)
		.join("\n");
}

async function sendTelegramNotification({
	credential,
	notification,
}: {
	credential: z.infer<typeof telegramCredentialSchema>;
	notification: typeof observabilitySchema.notification.$inferSelect;
}) {
	const response = await fetch(
		`https://api.telegram.org/bot${credential.botToken}/sendMessage`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				chat_id: credential.chatId,
				text: buildTelegramMessage(notification),
				disable_web_page_preview: true,
			}),
		},
	);

	if (!response.ok) {
		throw new Error(`Telegram returned ${response.status}.`);
	}
}

async function recordNotificationDelivery({
	channel,
	notification,
	status,
	error,
}: {
	channel: typeof observabilitySchema.notificationChannel.$inferSelect;
	notification: typeof observabilitySchema.notification.$inferSelect;
	status: "delivered" | "failed" | "skipped";
	error?: string | null;
}) {
	await db.insert(observabilitySchema.notificationDelivery).values({
		id: notificationDeliveryId(),
		notificationId: notification.id,
		channelId: channel.id,
		provider: channel.provider,
		status,
		attemptCount: 1,
		error: error ?? null,
		metadata: {
			notificationType: notification.type,
			notificationCategory: notification.category,
			notificationSeverity: notification.severity,
		},
		deliveredAt: status === "delivered" ? new Date() : null,
	});
}

async function deliverNotificationToChannel({
	channel,
	notification,
	force = false,
}: {
	channel: typeof observabilitySchema.notificationChannel.$inferSelect;
	notification: typeof observabilitySchema.notification.$inferSelect;
	force?: boolean;
}) {
	if (!(force || shouldDeliverToChannel({ channel, notification }))) {
		await recordNotificationDelivery({
			channel,
			notification,
			status: "skipped",
		});
		return;
	}

	const credential = decryptSecretEnvelope(
		channel.credentialEnvelope,
		notificationChannelCredentialSchema,
	);

	try {
		if (channel.provider === "telegram" && credential?.telegram) {
			await sendTelegramNotification({
				credential: credential.telegram,
				notification,
			});
		} else {
			throw new Error("Notification channel credentials are incomplete.");
		}

		await recordNotificationDelivery({
			channel,
			notification,
			status: "delivered",
		});
		await db
			.update(observabilitySchema.notificationChannel)
			.set({
				status: "connected",
				lastError: null,
				updatedAt: new Date(),
			})
			.where(eq(observabilitySchema.notificationChannel.id, channel.id));
	} catch (error) {
		const message = getErrorMessage(error);
		await recordNotificationDelivery({
			channel,
			notification,
			status: "failed",
			error: message,
		});
		await db
			.update(observabilitySchema.notificationChannel)
			.set({
				status: "error",
				lastError: message,
				updatedAt: new Date(),
			})
			.where(eq(observabilitySchema.notificationChannel.id, channel.id));
	}
}

async function dispatchNotificationToChannels(
	notification:
		| typeof observabilitySchema.notification.$inferSelect
		| undefined,
) {
	if (!notification) {
		return;
	}

	const channels = await db
		.select()
		.from(observabilitySchema.notificationChannel)
		.where(
			eq(observabilitySchema.notificationChannel.userId, notification.userId),
		);

	await Promise.all(
		channels.map((channel) =>
			deliverNotificationToChannel({ channel, notification }),
		),
	);
}

export function serializeNotification(
	row: typeof observabilitySchema.notification.$inferSelect,
) {
	return {
		id: row.id,
		type: row.type,
		category: row.category,
		severity: row.severity,
		status: row.status,
		title: row.title,
		body: row.body,
		actionHref: row.actionHref,
		sourceType: row.sourceType,
		sourceId: row.sourceId,
		metadata: row.metadata ?? {},
		readAt: row.readAt?.toISOString() ?? null,
		archivedAt: row.archivedAt?.toISOString() ?? null,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

export async function listNotificationChannelsForUser({
	userId,
}: {
	userId: string;
}) {
	const rows = await db
		.select()
		.from(observabilitySchema.notificationChannel)
		.where(eq(observabilitySchema.notificationChannel.userId, userId))
		.orderBy(
			asc(observabilitySchema.notificationChannel.provider),
			asc(observabilitySchema.notificationChannel.label),
		);

	return rows.map(serializeNotificationChannel);
}

async function getNotificationChannelForUser({
	userId,
	channelId,
}: {
	userId: string;
	channelId: string;
}) {
	const [row] = await db
		.select()
		.from(observabilitySchema.notificationChannel)
		.where(
			and(
				eq(observabilitySchema.notificationChannel.userId, userId),
				eq(observabilitySchema.notificationChannel.id, channelId),
			),
		)
		.limit(1);

	return row ?? null;
}

function buildChannelCredential({
	input,
	existingEnvelope,
}: {
	input: NotificationChannelUpsertInput;
	existingEnvelope: string | null;
}) {
	const existing = decryptSecretEnvelope(
		existingEnvelope,
		notificationChannelCredentialSchema,
	);

	if (input.provider === "telegram") {
		const botToken =
			input.telegram?.botToken?.trim() || existing?.telegram?.botToken;
		const chatId = input.telegram?.chatId?.trim() || existing?.telegram?.chatId;

		if (!botToken || !chatId) {
			throw new Error("Telegram bot token and chat ID are required.");
		}

		return {
			credential: { telegram: { botToken, chatId } },
			targetPreview: `Telegram chat ${redactSecret(chatId) ?? "configured"}`,
		};
	}

	throw new Error("Unsupported notification channel provider.");
}

export async function upsertNotificationChannelForUser({
	userId,
	input,
}: {
	userId: string;
	input: NotificationChannelUpsertInput;
}) {
	const provider = notificationChannelProviderSchema.parse(input.provider);
	const settings = notificationChannelSettingsSchema.parse(input.settings);
	const existing = input.channelId
		? await getNotificationChannelForUser({
				userId,
				channelId: input.channelId,
			})
		: null;
	const { credential, targetPreview } = buildChannelCredential({
		input: {
			...input,
			provider,
			settings,
		},
		existingEnvelope: existing?.credentialEnvelope ?? null,
	});
	const credentialEnvelope = encryptSecretEnvelope(credential);
	if (!credentialEnvelope) {
		throw new Error("Notification channel credentials are required.");
	}

	const now = new Date();
	const values = {
		id: existing?.id ?? notificationChannelId(),
		userId,
		organizationId: existing?.organizationId ?? null,
		provider,
		label: input.label.trim() || "Telegram",
		targetPreview,
		credentialEnvelope,
		settings,
		status: input.enabled ? "configured" : "disabled",
		enabled: input.enabled,
		lastError: null,
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
	};

	if (existing) {
		const [row] = await db
			.update(observabilitySchema.notificationChannel)
			.set({
				label: values.label,
				targetPreview: values.targetPreview,
				credentialEnvelope: values.credentialEnvelope,
				settings: values.settings,
				status: values.status,
				enabled: values.enabled,
				lastError: values.lastError,
				updatedAt: values.updatedAt,
			})
			.where(
				and(
					eq(observabilitySchema.notificationChannel.userId, userId),
					eq(observabilitySchema.notificationChannel.id, existing.id),
				),
			)
			.returning();

		if (!row) {
			throw new Error("Unable to save notification channel.");
		}

		return serializeNotificationChannel(row);
	}

	const [row] = await db
		.insert(observabilitySchema.notificationChannel)
		.values(values)
		.onConflictDoUpdate({
			target: [
				observabilitySchema.notificationChannel.userId,
				observabilitySchema.notificationChannel.provider,
				observabilitySchema.notificationChannel.label,
			],
			set: {
				targetPreview: values.targetPreview,
				credentialEnvelope: values.credentialEnvelope,
				settings: values.settings,
				status: values.status,
				enabled: values.enabled,
				lastError: values.lastError,
				updatedAt: values.updatedAt,
			},
		})
		.returning();

	if (!row) {
		throw new Error("Unable to save notification channel.");
	}

	return serializeNotificationChannel(row);
}

export async function setNotificationChannelEnabledForUser({
	userId,
	channelId,
	enabled,
}: {
	userId: string;
	channelId: string;
	enabled: boolean;
}) {
	const now = new Date();
	const [row] = await db
		.update(observabilitySchema.notificationChannel)
		.set({
			enabled,
			status: enabled ? "configured" : "disabled",
			...(enabled ? { lastError: null } : {}),
			updatedAt: now,
		})
		.where(
			and(
				eq(observabilitySchema.notificationChannel.userId, userId),
				eq(observabilitySchema.notificationChannel.id, channelId),
			),
		)
		.returning();

	if (!row) {
		throw new Error("Notification channel was not found.");
	}

	return serializeNotificationChannel(row);
}

export async function deleteNotificationChannelForUser({
	userId,
	channelId,
}: {
	userId: string;
	channelId: string;
}) {
	const rows = await db
		.delete(observabilitySchema.notificationChannel)
		.where(
			and(
				eq(observabilitySchema.notificationChannel.userId, userId),
				eq(observabilitySchema.notificationChannel.id, channelId),
			),
		)
		.returning({ id: observabilitySchema.notificationChannel.id });

	return { deleted: rows.length };
}

export async function testNotificationChannelForUser({
	userId,
	channelId,
}: {
	userId: string;
	channelId: string;
}) {
	const channel = await getNotificationChannelForUser({ userId, channelId });

	if (!channel) {
		throw new Error("Notification channel was not found.");
	}

	if (!channel.enabled) {
		throw new Error("Enable this notification channel before sending a test.");
	}

	const now = new Date();
	const testNotificationValues = {
		id: notificationId(),
		userId,
		organizationId: channel.organizationId,
		repositoryId: null,
		type: "notification_channel.test",
		category: "ai",
		severity: "success",
		status: "unread",
		title: "Telegram notifications are connected",
		body: "GitPal can now deliver the selected notifications to this channel.",
		actionHref: null,
		sourceType: "notification_channel",
		sourceId: channel.id,
		dedupeKey: null,
		metadata: {},
		readAt: null,
		archivedAt: null,
		createdAt: now,
		updatedAt: now,
	} satisfies typeof observabilitySchema.notification.$inferSelect;

	const [testNotification] = await db
		.insert(observabilitySchema.notification)
		.values(testNotificationValues)
		.returning();

	if (!testNotification) {
		throw new Error("Unable to create test notification.");
	}

	await deliverNotificationToChannel({
		channel,
		notification: testNotification,
		force: true,
	});
	await db
		.update(observabilitySchema.notificationChannel)
		.set({
			lastTestedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(observabilitySchema.notificationChannel.id, channelId));

	const refreshed = await getNotificationChannelForUser({ userId, channelId });

	if (refreshed?.status === "error") {
		throw new Error(
			refreshed.lastError ?? "Test notification could not be delivered.",
		);
	}

	return {
		channel: refreshed ? serializeNotificationChannel(refreshed) : null,
	};
}

export async function listNotificationsForUser({
	userId,
	status = "active",
	limit = 40,
}: {
	userId: string;
	status?: "active" | "all" | "archived" | "read" | "unread";
	limit?: number;
}) {
	const conditions = [eq(observabilitySchema.notification.userId, userId)];

	if (status === "active") {
		conditions.push(isNull(observabilitySchema.notification.archivedAt));
	} else if (status !== "all") {
		conditions.push(eq(observabilitySchema.notification.status, status));
	}

	const rows = await db
		.select()
		.from(observabilitySchema.notification)
		.where(and(...conditions))
		.orderBy(desc(observabilitySchema.notification.createdAt))
		.limit(limit);

	return rows.map(serializeNotification);
}

export async function countUnreadNotificationsForUser({
	userId,
}: {
	userId: string;
}) {
	const [row] = await db
		.select({ total: count() })
		.from(observabilitySchema.notification)
		.where(
			and(
				eq(observabilitySchema.notification.userId, userId),
				eq(observabilitySchema.notification.status, "unread"),
				isNull(observabilitySchema.notification.archivedAt),
			),
		)
		.limit(1);

	return { total: row?.total ?? 0 };
}

export async function markNotificationsReadForUser({
	userId,
	ids,
}: {
	userId: string;
	ids: string[];
}) {
	const now = new Date();
	const rows = await db
		.update(observabilitySchema.notification)
		.set({
			status: "read",
			readAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(observabilitySchema.notification.userId, userId),
				inArray(observabilitySchema.notification.id, ids),
			),
		)
		.returning({ id: observabilitySchema.notification.id });

	return { updated: rows.length };
}

export async function markAllNotificationsReadForUser({
	userId,
}: {
	userId: string;
}) {
	const now = new Date();
	const rows = await db
		.update(observabilitySchema.notification)
		.set({
			status: "read",
			readAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(observabilitySchema.notification.userId, userId),
				eq(observabilitySchema.notification.status, "unread"),
				isNull(observabilitySchema.notification.archivedAt),
			),
		)
		.returning({ id: observabilitySchema.notification.id });

	return { updated: rows.length };
}

export async function archiveNotificationsForUser({
	userId,
	ids,
}: {
	userId: string;
	ids: string[];
}) {
	const now = new Date();
	const rows = await db
		.update(observabilitySchema.notification)
		.set({
			status: "archived",
			archivedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(observabilitySchema.notification.userId, userId),
				inArray(observabilitySchema.notification.id, ids),
			),
		)
		.returning({ id: observabilitySchema.notification.id });

	return { updated: rows.length };
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

	try {
		await dispatchNotificationToChannels(notification);
	} catch (error) {
		console.error("Failed to dispatch notification channels.", {
			notificationId: notification?.id,
			userId: input.userId,
			error,
		});
	}

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
