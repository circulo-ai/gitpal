import { z } from "zod";
import {
	protectedMutationProcedure,
	protectedProcedure,
	router,
} from "../index";
import {
	createWalletTopupForUser,
	getWalletSummaryForUser,
} from "../services/wallet";

const createTopupSchema = z.object({
	amountUsd: z.coerce.number().min(5).max(10_000),
});

export const billingRouter = router({
	summary: protectedProcedure.query(async ({ ctx }) => {
		return getWalletSummaryForUser(ctx.session.user.id);
	}),
	createTopup: protectedMutationProcedure
		.input(createTopupSchema)
		.mutation(async ({ ctx, input }) => {
			return createWalletTopupForUser({
				userId: ctx.session.user.id,
				amountUsdCents: Math.round(input.amountUsd * 100),
			});
		}),
});
