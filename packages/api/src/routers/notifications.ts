import {
	archiveNotificationsForUser,
	countUnreadNotificationsForUser,
	deleteNotificationChannelForUser,
	listNotificationChannelsForUser,
	listNotificationsForUser,
	markAllNotificationsReadForUser,
	markNotificationsReadForUser,
	notificationCategoryOptions,
	notificationChannelProviders,
	notificationSeverityOptions,
	setNotificationChannelEnabledForUser,
	testNotificationChannelForUser,
	upsertNotificationChannelForUser,
} from "@gitpal/services/notifications";
import { z } from "zod";
import {
	protectedMutationProcedure,
	protectedProcedure,
	router,
} from "../index";

const notificationStatusSchema = z
	.enum(["active", "all", "archived", "read", "unread"])
	.default("active");

const listNotificationsSchema = z.object({
	status: notificationStatusSchema.optional(),
	limit: z.number().int().min(1).max(100).default(40),
});

const notificationIdsSchema = z.object({
	ids: z.array(z.string().min(1)).min(1).max(100),
});

const notificationChannelSettingsSchema = z.object({
	categories: z
		.array(z.enum(notificationCategoryOptions))
		.min(1)
		.default([...notificationCategoryOptions]),
	severities: z
		.array(z.enum(notificationSeverityOptions))
		.min(1)
		.default(["success", "warning", "error"]),
});

const notificationChannelIdSchema = z.object({
	channelId: z.string().min(1),
});

const notificationChannelSaveSchema = z.object({
	channelId: z.string().min(1).optional(),
	provider: z.enum(notificationChannelProviders),
	label: z.string().trim().min(1).max(80),
	enabled: z.boolean().default(true),
	settings: notificationChannelSettingsSchema,
	telegram: z
		.object({
			botToken: z.string().trim().min(1).max(512).optional(),
			chatId: z.string().trim().min(1).max(128).optional(),
			webhookSecretToken: z.string().trim().min(1).max(512).optional(),
			botUsername: z.string().trim().min(1).max(128).optional(),
		})
		.optional(),
	slack: z
		.object({
			botToken: z.string().trim().min(1).max(1024).optional(),
			channelId: z.string().trim().min(1).max(256).optional(),
			signingSecret: z.string().trim().min(1).max(512).optional(),
			botUsername: z.string().trim().min(1).max(128).optional(),
		})
		.optional(),
	teams: z
		.object({
			appId: z.string().trim().min(1).max(256).optional(),
			appPassword: z.string().trim().min(1).max(1024).optional(),
			appTenantId: z.string().trim().min(1).max(256).optional(),
			conversationId: z.string().trim().min(1).max(1024).optional(),
			serviceUrl: z.string().trim().url().max(1024).optional(),
			appType: z.enum(["MultiTenant", "SingleTenant"]).optional(),
			botUsername: z.string().trim().min(1).max(128).optional(),
		})
		.optional(),
	linear: z
		.object({
			apiKey: z.string().trim().min(1).max(1024).optional(),
			accessToken: z.string().trim().min(1).max(1024).optional(),
			issueId: z.string().trim().min(1).max(256).optional(),
			webhookSecret: z.string().trim().min(1).max(512).optional(),
			botUsername: z.string().trim().min(1).max(128).optional(),
		})
		.optional(),
	resend: z
		.object({
			apiKey: z.string().trim().min(1).max(1024).optional(),
			fromAddress: z.string().trim().email().max(320).optional(),
			fromName: z.string().trim().min(1).max(128).optional(),
			toEmail: z.string().trim().email().max(320).optional(),
			webhookSecret: z.string().trim().min(1).max(512).optional(),
		})
		.optional(),
});

const notificationChannelToggleSchema = notificationChannelIdSchema.extend({
	enabled: z.boolean(),
});

export const notificationsRouter = router({
	list: protectedProcedure
		.input(listNotificationsSchema)
		.query(async ({ ctx, input }) =>
			listNotificationsForUser({
				userId: ctx.session.user.id,
				status: input.status ?? "active",
				limit: input.limit,
			}),
		),
	unreadCount: protectedProcedure.query(async ({ ctx }) => {
		return countUnreadNotificationsForUser({
			userId: ctx.session.user.id,
		});
	}),
	markRead: protectedMutationProcedure
		.input(notificationIdsSchema)
		.mutation(async ({ ctx, input }) =>
			markNotificationsReadForUser({
				userId: ctx.session.user.id,
				ids: input.ids,
			}),
		),
	markAllRead: protectedMutationProcedure.mutation(async ({ ctx }) =>
		markAllNotificationsReadForUser({
			userId: ctx.session.user.id,
		}),
	),
	archive: protectedMutationProcedure
		.input(notificationIdsSchema)
		.mutation(async ({ ctx, input }) =>
			archiveNotificationsForUser({
				userId: ctx.session.user.id,
				ids: input.ids,
			}),
		),
	channels: protectedProcedure.query(async ({ ctx }) =>
		listNotificationChannelsForUser({
			userId: ctx.session.user.id,
		}),
	),
	saveChannel: protectedMutationProcedure
		.input(notificationChannelSaveSchema)
		.mutation(async ({ ctx, input }) =>
			upsertNotificationChannelForUser({
				userId: ctx.session.user.id,
				input,
			}),
		),
	toggleChannel: protectedMutationProcedure
		.input(notificationChannelToggleSchema)
		.mutation(async ({ ctx, input }) =>
			setNotificationChannelEnabledForUser({
				userId: ctx.session.user.id,
				channelId: input.channelId,
				enabled: input.enabled,
			}),
		),
	deleteChannel: protectedMutationProcedure
		.input(notificationChannelIdSchema)
		.mutation(async ({ ctx, input }) =>
			deleteNotificationChannelForUser({
				userId: ctx.session.user.id,
				channelId: input.channelId,
			}),
		),
	testChannel: protectedMutationProcedure
		.input(notificationChannelIdSchema)
		.mutation(async ({ ctx, input }) =>
			testNotificationChannelForUser({
				userId: ctx.session.user.id,
				channelId: input.channelId,
			}),
		),
});
