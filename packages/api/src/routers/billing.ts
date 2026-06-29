import {
	getOrganizationBudgetSummary,
	saveOrganizationBudget,
} from "@gitpal/services/organization-budget";
import {
	createWalletTopupForUser,
	getWalletSummaryForUser,
} from "@gitpal/services/wallet";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	protectedMutationProcedure,
	protectedProcedure,
	router,
} from "../index";
import { requireOrganizationPermission } from "../services/organization-access";

const createTopupSchema = z.object({
	amountUsd: z.coerce.number().min(5).max(10_000),
});

const budgetSchema = z.object({
	organizationId: z.string().min(1).optional(),
	enabled: z.boolean(),
	monthlyLimitUsd: z.coerce.number().min(1).max(1_000_000),
	alertThresholdPercent: z.coerce.number().int().min(1).max(100),
});

function getOrganizationId(
	input: string | undefined,
	active: string | null | undefined,
) {
	const organizationId = input ?? active ?? null;
	if (!organizationId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Select a workspace first.",
		});
	}
	return organizationId;
}

export const billingRouter = router({
	summary: protectedProcedure
		.input(
			z.object({ organizationId: z.string().min(1).optional() }).optional(),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = getOrganizationId(
				input?.organizationId,
				ctx.session.session.activeOrganizationId,
			);
			await requireOrganizationPermission({
				userId: ctx.session.user.id,
				organizationId,
				permissions: { billing: ["read"] },
			});
			const [wallet, organizationBudget] = await Promise.all([
				getWalletSummaryForUser(ctx.session.user.id),
				getOrganizationBudgetSummary(organizationId),
			]);
			return { ...wallet, organizationBudget };
		}),
	createTopup: protectedMutationProcedure
		.input(createTopupSchema)
		.mutation(async ({ ctx, input }) => {
			await requireOrganizationPermission({
				userId: ctx.session.user.id,
				organizationId: ctx.session.session.activeOrganizationId ?? null,
				permissions: { billing: ["update"] },
			});
			return createWalletTopupForUser({
				userId: ctx.session.user.id,
				amountUsdCents: Math.round(input.amountUsd * 100),
			});
		}),
	updateBudget: protectedMutationProcedure
		.input(budgetSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = getOrganizationId(
				input.organizationId,
				ctx.session.session.activeOrganizationId,
			);
			await requireOrganizationPermission({
				userId: ctx.session.user.id,
				organizationId,
				permissions: { billing: ["update"] },
			});
			return saveOrganizationBudget({
				actorUserId: ctx.session.user.id,
				organizationId,
				enabled: input.enabled,
				monthlyLimitCents: Math.round(input.monthlyLimitUsd * 100),
				alertThresholdPercent: input.alertThresholdPercent,
			});
		}),
});
