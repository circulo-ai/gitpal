import { initTRPC, TRPCError } from "@trpc/server";

import type { Context } from "./context";

export const t = initTRPC.context<Context>().create();

export const router = t.router;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
	if (!ctx.session?.user) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You must be signed in to use this endpoint.",
		});
	}

	return next({
		ctx: {
			...ctx,
			session: ctx.session,
		},
	});
});
