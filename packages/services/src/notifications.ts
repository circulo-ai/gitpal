import { randomUUID } from "node:crypto";
import { db } from "@gitpal/db";
import * as authSchema from "@gitpal/db/schema/auth";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import * as observabilitySchema from "@gitpal/db/schema/observability";
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { mapWithConcurrency } from "./bounded-concurrency";
import {
	getNotificationChannelCredentialPreview,
	getNotificationChannelTargetId,
	getNotificationChannelTargetPreview,
	type NotificationChannelProvider,
	notificationChannelCredentialSchema,
	notificationChannelProviderSchema,
	notificationChannelProviders,
	sendNotificationViaChatSdk,
} from "./notification-chat";
import { recordObservabilityEvent } from "./observability";
import { sanitizeDiagnosticText, sanitizeRunDetails } from "./safe-diagnostics";
import {
	decryptSecretEnvelope,
	encryptSecretEnvelope,
} from "./secret-envelope";

type NotificationDbExecutor = Pick<typeof db, "insert">;

export type NotificationSeverity = "info" | "success" | "warning" | "error";
export type NotificationChannelStatus =
	| "configured"
	| "connected"
	| "disabled"
	| "error";

export { notificationChannelProviders };

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

const notificationChannelSettingsSchema = z.object({
	categories: z
		.array(z.string().min(1))
		.default([...notificationCategoryOptions]),
	severities: z
		.array(z.enum(notificationSeverityOptions))
		.default(["success", "warning", "error"]),
});

const notificationChannelProviderLabels = {
	resend: "Resend",
	telegram: "Telegram",
	linear: "Linear",
	teams: "Microsoft Teams",
	slack: "Slack",
} satisfies Record<NotificationChannelProvider, string>;

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
		webhookSecretToken?: string;
		botUsername?: string;
	};
	slack?: {
		botToken?: string;
		channelId?: string;
		signingSecret?: string;
		botUsername?: string;
	};
	teams?: {
		appId?: string;
		appPassword?: string;
		appTenantId?: string;
		conversationId?: string;
		serviceUrl?: string;
		appType?: "MultiTenant" | "SingleTenant";
		botUsername?: string;
	};
	linear?: {
		apiKey?: string;
		accessToken?: string;
		issueId?: string;
		webhookSecret?: string;
		botUsername?: string;
	};
	resend?: {
		apiKey?: string;
		fromAddress?: string;
		fromName?: string;
		toEmail?: string;
		webhookSecret?: string;
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

function getErrorMessage(error: unknown) {
	return sanitizeDiagnosticText(
		error instanceof Error ? error.message : "Unknown notification error.",
	);
}

function normalizeActionHref(value: string | null | undefined) {
	const trimmed = value?.trim();
	return trimmed?.startsWith("/") && !trimmed.startsWith("//") ? trimmed : null;
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
		targetId: row.targetId,
		targetPreview: row.targetPreview,
		credentialPreview: getNotificationChannelCredentialPreview(credentials),
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
	await db
		.insert(observabilitySchema.notificationDelivery)
		.values({
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
		})
		.onConflictDoUpdate({
			target: [
				observabilitySchema.notificationDelivery.notificationId,
				observabilitySchema.notificationDelivery.channelId,
			],
			set: {
				provider: channel.provider,
				status,
				attemptCount: sql`${observabilitySchema.notificationDelivery.attemptCount} + 1`,
				error: error ?? null,
				metadata: {
					notificationType: notification.type,
					notificationCategory: notification.category,
					notificationSeverity: notification.severity,
				},
				deliveredAt: status === "delivered" ? new Date() : null,
			},
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
		if (!credential) {
			throw new Error("Notification channel credentials are incomplete.");
		}

		const provider = notificationChannelProviderSchema.parse(channel.provider);
		await sendNotificationViaChatSdk({
			channelId: channel.id,
			provider,
			targetId: channel.targetId,
			credential,
			notification,
		});

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

	await mapWithConcurrency(channels, 4, (channel) =>
		deliverNotificationToChannel({ channel, notification }),
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
		metadata: sanitizeRunDetails(row.metadata),
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

function mergeSecretValue(
	nextValue: string | null | undefined,
	existingValue: string | null | undefined,
) {
	return nextValue?.trim() || existingValue || undefined;
}

function requireCredentialValue(value: string | undefined, message: string) {
	if (!value) {
		throw new Error(message);
	}

	return value;
}

function buildCredentialResult({
	provider,
	credential,
}: {
	provider: NotificationChannelProvider;
	credential: z.infer<typeof notificationChannelCredentialSchema>;
}) {
	return {
		credential,
		targetId: getNotificationChannelTargetId({ provider, credential }),
		targetPreview: getNotificationChannelTargetPreview({
			provider,
			credential,
		}),
	};
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

	switch (input.provider) {
		case "telegram": {
			const credential = notificationChannelCredentialSchema.parse({
				telegram: {
					botToken: requireCredentialValue(
						mergeSecretValue(
							input.telegram?.botToken,
							existing?.telegram?.botToken,
						),
						"Telegram bot token is required.",
					),
					chatId: requireCredentialValue(
						mergeSecretValue(
							input.telegram?.chatId,
							existing?.telegram?.chatId,
						),
						"Telegram chat ID is required.",
					),
					webhookSecretToken: mergeSecretValue(
						input.telegram?.webhookSecretToken,
						existing?.telegram?.webhookSecretToken,
					),
					botUsername: mergeSecretValue(
						input.telegram?.botUsername,
						existing?.telegram?.botUsername,
					),
				},
			});

			return buildCredentialResult({ provider: input.provider, credential });
		}
		case "slack": {
			const credential = notificationChannelCredentialSchema.parse({
				slack: {
					botToken: requireCredentialValue(
						mergeSecretValue(input.slack?.botToken, existing?.slack?.botToken),
						"Slack bot token is required.",
					),
					channelId: requireCredentialValue(
						mergeSecretValue(
							input.slack?.channelId,
							existing?.slack?.channelId,
						),
						"Slack channel ID is required.",
					),
					signingSecret: mergeSecretValue(
						input.slack?.signingSecret,
						existing?.slack?.signingSecret,
					),
					botUsername: mergeSecretValue(
						input.slack?.botUsername,
						existing?.slack?.botUsername,
					),
				},
			});

			return buildCredentialResult({ provider: input.provider, credential });
		}
		case "teams": {
			const credential = notificationChannelCredentialSchema.parse({
				teams: {
					appId: requireCredentialValue(
						mergeSecretValue(input.teams?.appId, existing?.teams?.appId),
						"Teams app ID is required.",
					),
					appPassword: requireCredentialValue(
						mergeSecretValue(
							input.teams?.appPassword,
							existing?.teams?.appPassword,
						),
						"Teams app password is required.",
					),
					appTenantId: requireCredentialValue(
						mergeSecretValue(
							input.teams?.appTenantId,
							existing?.teams?.appTenantId,
						),
						"Teams tenant ID is required.",
					),
					conversationId: requireCredentialValue(
						mergeSecretValue(
							input.teams?.conversationId,
							existing?.teams?.conversationId,
						),
						"Teams conversation ID is required.",
					),
					serviceUrl: requireCredentialValue(
						mergeSecretValue(
							input.teams?.serviceUrl,
							existing?.teams?.serviceUrl,
						),
						"Teams service URL is required.",
					),
					appType: input.teams?.appType ?? existing?.teams?.appType,
					botUsername: mergeSecretValue(
						input.teams?.botUsername,
						existing?.teams?.botUsername,
					),
				},
			});

			return buildCredentialResult({ provider: input.provider, credential });
		}
		case "linear": {
			const credential = notificationChannelCredentialSchema.parse({
				linear: {
					apiKey: mergeSecretValue(
						input.linear?.apiKey,
						existing?.linear?.apiKey,
					),
					accessToken: mergeSecretValue(
						input.linear?.accessToken,
						existing?.linear?.accessToken,
					),
					issueId: requireCredentialValue(
						mergeSecretValue(input.linear?.issueId, existing?.linear?.issueId),
						"Linear issue ID is required.",
					),
					webhookSecret: mergeSecretValue(
						input.linear?.webhookSecret,
						existing?.linear?.webhookSecret,
					),
					botUsername: mergeSecretValue(
						input.linear?.botUsername,
						existing?.linear?.botUsername,
					),
				},
			});

			return buildCredentialResult({ provider: input.provider, credential });
		}
		case "resend": {
			const credential = notificationChannelCredentialSchema.parse({
				resend: {
					apiKey: requireCredentialValue(
						mergeSecretValue(input.resend?.apiKey, existing?.resend?.apiKey),
						"Resend API key is required.",
					),
					fromAddress: requireCredentialValue(
						mergeSecretValue(
							input.resend?.fromAddress,
							existing?.resend?.fromAddress,
						),
						"Resend from address is required.",
					),
					fromName: mergeSecretValue(
						input.resend?.fromName,
						existing?.resend?.fromName,
					),
					toEmail: requireCredentialValue(
						mergeSecretValue(input.resend?.toEmail, existing?.resend?.toEmail),
						"Resend recipient email is required.",
					),
					webhookSecret: mergeSecretValue(
						input.resend?.webhookSecret,
						existing?.resend?.webhookSecret,
					),
				},
			});

			return buildCredentialResult({ provider: input.provider, credential });
		}
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
	const { credential, targetId, targetPreview } = buildChannelCredential({
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
		label: input.label.trim() || notificationChannelProviderLabels[provider],
		targetId,
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
				targetId: values.targetId,
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
				targetId: values.targetId,
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
		title: `${notificationChannelProviderLabels[notificationChannelProviderSchema.parse(channel.provider)]} notifications are connected`,
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

export async function archiveNotificationByDedupeKeyForUser({
	userId,
	dedupeKey,
}: {
	userId: string;
	dedupeKey: string;
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
				eq(observabilitySchema.notification.dedupeKey, dedupeKey),
				isNull(observabilitySchema.notification.archivedAt),
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
		title: sanitizeDiagnosticText(input.title).slice(0, 500),
		body: input.body
			? sanitizeDiagnosticText(input.body).slice(0, 5_000)
			: null,
		actionHref: normalizeActionHref(input.actionHref),
		sourceType: input.sourceType ?? null,
		sourceId: input.sourceId ?? null,
		dedupeKey,
		metadata: sanitizeRunDetails(input.metadata),
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
	return mapWithConcurrency(notifications, 8, (notification) =>
		sendUserNotification(notification),
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
