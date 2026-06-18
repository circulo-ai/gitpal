import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";
import {
	buildAppRateLimitKey,
	consumeAppRateLimit,
	createRateLimitKeyFromRequestPath,
} from "./services/rate-limit";

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

const protectedMutationRateLimitRule = {
	window: 60,
	max: 120,
};

async function enforceAppRateLimit({
	scope,
	subject,
	route,
	rule,
}: {
	scope: "user" | "ip";
	subject: string;
	route: string;
	rule: { window: number; max: number };
}) {
	const decision = await consumeAppRateLimit({
		key: buildAppRateLimitKey({
			scope,
			subject,
			route: createRateLimitKeyFromRequestPath(route),
		}),
		rule,
	});

	if (!decision.allowed) {
		throw new TRPCError({
			code: "TOO_MANY_REQUESTS",
			message: "Too many requests. Please try again later.",
		});
	}

	return decision;
}

export const protectedMutationProcedure = protectedProcedure.use(
	async ({ ctx, next, path }) => {
		await enforceAppRateLimit({
			scope: "user",
			subject: ctx.session.user.id,
			route: `trpc/${path}`,
			rule: protectedMutationRateLimitRule,
		});

		return next({
			ctx: {
				...ctx,
				session: ctx.session,
			},
		});
	},
);

export async function enforcePublicAppRateLimit({
	ctx,
	route,
	rule,
}: {
	ctx: Context;
	route: string;
	rule: { window: number; max: number };
}) {
	const subject = ctx.request.ip ?? ctx.request.userAgent ?? "unknown";

	return enforceAppRateLimit({
		scope: "ip",
		subject,
		route,
		rule,
	});
}
