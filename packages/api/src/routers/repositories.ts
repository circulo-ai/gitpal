import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
	listRepositoriesForUser,
	setRepositoryEnabledForUser,
} from "../services/repository-sync";
import { protectedProcedure, router } from "../index";

const repositoryToggleSchema = z.object({
	repositoryId: z.string().min(1),
	enabled: z.boolean(),
});

export const repositoriesRouter = router({
	list: protectedProcedure.query(async ({ ctx }) => {
		return listRepositoriesForUser(ctx.session.user.id);
	}),
	toggleEnabled: protectedProcedure
		.input(repositoryToggleSchema)
		.mutation(async ({ ctx, input }) => {
			const repository = await setRepositoryEnabledForUser({
				userId: ctx.session.user.id,
				repositoryId: input.repositoryId,
				enabled: input.enabled,
			});

			if (!repository) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Repository was not found for this user.",
				});
			}

			return {
				id: repository.repositoryId,
				enabled: repository.enabled,
			};
		}),
});
