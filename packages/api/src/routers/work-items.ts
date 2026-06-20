import {
	enqueueManualWorkItemRun,
	getWorkItemDetail,
	listWorkItems,
	refreshWorkItem,
} from "@gitpal/services/work-items";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	protectedMutationProcedure,
	protectedProcedure,
	router,
} from "../index";
import { requireOrganizationPermission } from "../services/organization-access";

const kindSchema = z.enum(["pull_request", "issue"]);
const organizationScopeSchema = z.object({
	organizationId: z.string().min(1).optional(),
});
const workItemIdentitySchema = organizationScopeSchema.extend({
	kind: kindSchema,
	repositoryId: z.string().min(1),
	number: z.number().int().positive(),
});

function organizationId(
	input: { organizationId?: string },
	sessionOrganizationId: string | null | undefined,
) {
	return input.organizationId ?? sessionOrganizationId ?? null;
}

async function requireWriteAccess({
	userId,
	organizationId: scopedOrganizationId,
}: {
	userId: string;
	organizationId: string | null;
}) {
	await requireOrganizationPermission({
		userId,
		organizationId: scopedOrganizationId,
		permissions: { repository: ["sync"] },
	});
}

export const workItemsRouter = router({
	list: protectedProcedure
		.input(
			organizationScopeSchema.extend({
				kind: kindSchema,
				query: z.string().trim().max(200).optional(),
				state: z.string().trim().max(40).optional(),
				repositoryId: z.string().min(1).optional(),
				page: z.number().int().positive().default(1),
				pageSize: z.number().int().min(1).max(50).default(20),
			}),
		)
		.query(({ ctx, input }) =>
			listWorkItems({
				...input,
				userId: ctx.session.user.id,
				organizationId: organizationId(
					input,
					ctx.session.session.activeOrganizationId,
				),
			}),
		),

	detail: protectedProcedure
		.input(workItemIdentitySchema)
		.query(async ({ ctx, input }) => {
			const detail = await getWorkItemDetail({
				...input,
				userId: ctx.session.user.id,
				organizationId: organizationId(
					input,
					ctx.session.session.activeOrganizationId,
				),
			});
			if (!detail) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "This work item was not found in the active workspace.",
				});
			}
			return detail;
		}),

	refresh: protectedMutationProcedure
		.input(workItemIdentitySchema)
		.mutation(async ({ ctx, input }) => {
			const scopedOrganizationId = organizationId(
				input,
				ctx.session.session.activeOrganizationId,
			);
			await requireWriteAccess({
				userId: ctx.session.user.id,
				organizationId: scopedOrganizationId,
			});
			const item = await refreshWorkItem({
				...input,
				userId: ctx.session.user.id,
				organizationId: scopedOrganizationId,
			});
			if (!item) throw new TRPCError({ code: "NOT_FOUND" });
			return item;
		}),

	run: protectedMutationProcedure
		.input(
			workItemIdentitySchema.extend({
				idempotencyKey: z.string().min(8).max(120).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const scopedOrganizationId = organizationId(
				input,
				ctx.session.session.activeOrganizationId,
			);
			await requireWriteAccess({
				userId: ctx.session.user.id,
				organizationId: scopedOrganizationId,
			});
			try {
				const result = await enqueueManualWorkItemRun({
					...input,
					userId: ctx.session.user.id,
					organizationId: scopedOrganizationId,
				});
				if (!result) throw new TRPCError({ code: "NOT_FOUND" });
				return result;
			} catch (error) {
				if (error instanceof TRPCError) throw error;
				throw new TRPCError({
					code:
						error instanceof Error && error.message.includes("active run")
							? "CONFLICT"
							: "BAD_REQUEST",
					message:
						error instanceof Error ? error.message : "Run could not be queued.",
				});
			}
		}),

	retry: protectedMutationProcedure
		.input(workItemIdentitySchema.extend({ runId: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const scopedOrganizationId = organizationId(
				input,
				ctx.session.session.activeOrganizationId,
			);
			await requireWriteAccess({
				userId: ctx.session.user.id,
				organizationId: scopedOrganizationId,
			});
			try {
				const result = await enqueueManualWorkItemRun({
					...input,
					userId: ctx.session.user.id,
					organizationId: scopedOrganizationId,
					retryOfRunId: input.runId,
				});
				if (!result) throw new TRPCError({ code: "NOT_FOUND" });
				return result;
			} catch (error) {
				if (error instanceof TRPCError) throw error;
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Run could not be retried.",
				});
			}
		}),
});
