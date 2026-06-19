import { createDb } from "@gitpal/db";
import * as observabilitySchema from "@gitpal/db/schema/observability";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
	protectedMutationProcedure,
	protectedProcedure,
	router,
} from "../index";

const db = createDb();

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

function serializeNotification(
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

export const notificationsRouter = router({
	list: protectedProcedure
		.input(listNotificationsSchema)
		.query(async ({ ctx, input }) => {
			const status = input.status ?? "active";
			const conditions = [
				eq(observabilitySchema.notification.userId, ctx.session.user.id),
			];

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
				.limit(input.limit);

			return rows.map(serializeNotification);
		}),
	unreadCount: protectedProcedure.query(async ({ ctx }) => {
		const [row] = await db
			.select({ total: count() })
			.from(observabilitySchema.notification)
			.where(
				and(
					eq(observabilitySchema.notification.userId, ctx.session.user.id),
					eq(observabilitySchema.notification.status, "unread"),
					isNull(observabilitySchema.notification.archivedAt),
				),
			)
			.limit(1);

		return { total: row?.total ?? 0 };
	}),
	markRead: protectedMutationProcedure
		.input(notificationIdsSchema)
		.mutation(async ({ ctx, input }) => {
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
						eq(observabilitySchema.notification.userId, ctx.session.user.id),
						inArray(observabilitySchema.notification.id, input.ids),
					),
				)
				.returning({ id: observabilitySchema.notification.id });

			return { updated: rows.length };
		}),
	markAllRead: protectedMutationProcedure.mutation(async ({ ctx }) => {
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
					eq(observabilitySchema.notification.userId, ctx.session.user.id),
					eq(observabilitySchema.notification.status, "unread"),
					isNull(observabilitySchema.notification.archivedAt),
				),
			)
			.returning({ id: observabilitySchema.notification.id });

		return { updated: rows.length };
	}),
	archive: protectedMutationProcedure
		.input(notificationIdsSchema)
		.mutation(async ({ ctx, input }) => {
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
						eq(observabilitySchema.notification.userId, ctx.session.user.id),
						inArray(observabilitySchema.notification.id, input.ids),
					),
				)
				.returning({ id: observabilitySchema.notification.id });

			return { updated: rows.length };
		}),
});
