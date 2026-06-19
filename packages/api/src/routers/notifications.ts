import { z } from "zod";
import {
	archiveNotificationsForUser,
	countUnreadNotificationsForUser,
	listNotificationsForUser,
	markAllNotificationsReadForUser,
	markNotificationsReadForUser,
} from "@gitpal/services/notifications";
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
});
