import {
	createAppApiKeyForUser,
	deleteAppApiKeyForUser,
	listAppApiKeysForUser,
	updateAppApiKeyForUser,
} from "@gitpal/services/app-api-keys";
import {
	deleteByokKeyForUser,
	getByokRoutingSettingsForUser,
	listAvailableByokProviders,
	listByokKeysForUser,
	previewModelRouteForUser,
	saveByokKeyForUser,
	saveByokRoutingSettingsForUser,
} from "@gitpal/services/llm-credentials";
import {
	byokProviderKeySchema,
	byokRoutingSettingsSchema,
} from "@gitpal/utils";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	protectedMutationProcedure,
	protectedProcedure,
	router,
} from "../index";

const appApiKeyCreateSchema = z.object({
	name: z.string().trim().min(1).max(80),
	expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
});

const appApiKeyUpdateSchema = z.object({
	keyId: z.string().min(1),
	name: z.string().trim().min(1).max(80).optional(),
	enabled: z.boolean().optional(),
});

const deleteSchema = z.object({
	keyId: z.string().min(1),
});

const routePreviewSchema = z.object({
	modelId: z.string().min(1),
});

export const apiKeysRouter = router({
	app: router({
		list: protectedProcedure.query(async ({ ctx }) => {
			return listAppApiKeysForUser(ctx.session.user.id);
		}),
		create: protectedMutationProcedure
			.input(appApiKeyCreateSchema)
			.mutation(async ({ ctx, input }) => {
				return createAppApiKeyForUser({
					userId: ctx.session.user.id,
					name: input.name,
					expiresInSeconds: input.expiresInDays
						? input.expiresInDays * 24 * 60 * 60
						: null,
				});
			}),
		update: protectedMutationProcedure
			.input(appApiKeyUpdateSchema)
			.mutation(async ({ ctx, input }) => {
				return updateAppApiKeyForUser({
					userId: ctx.session.user.id,
					keyId: input.keyId,
					name: input.name,
					enabled: input.enabled,
				});
			}),
		delete: protectedMutationProcedure
			.input(deleteSchema)
			.mutation(async ({ ctx, input }) => {
				const deleted = await deleteAppApiKeyForUser({
					userId: ctx.session.user.id,
					keyId: input.keyId,
				});

				if (!deleted) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "API key could not be found.",
					});
				}

				return {
					success: true,
				};
			}),
	}),
	byok: router({
		providers: protectedProcedure.query(() => {
			return listAvailableByokProviders();
		}),
		list: protectedProcedure.query(async ({ ctx }) => {
			return listByokKeysForUser(ctx.session.user.id);
		}),
		save: protectedMutationProcedure
			.input(byokProviderKeySchema)
			.mutation(async ({ ctx, input }) => {
				return saveByokKeyForUser({
					userId: ctx.session.user.id,
					input,
				});
			}),
		delete: protectedMutationProcedure
			.input(deleteSchema)
			.mutation(async ({ ctx, input }) => {
				const deleted = await deleteByokKeyForUser({
					userId: ctx.session.user.id,
					keyId: input.keyId,
				});

				if (!deleted) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Provider key could not be found.",
					});
				}

				return {
					success: true,
				};
			}),
		getRouting: protectedProcedure.query(async ({ ctx }) => {
			return getByokRoutingSettingsForUser(ctx.session.user.id);
		}),
		updateRouting: protectedMutationProcedure
			.input(byokRoutingSettingsSchema)
			.mutation(async ({ ctx, input }) => {
				return saveByokRoutingSettingsForUser({
					userId: ctx.session.user.id,
					settings: input,
				});
			}),
		previewRoute: protectedProcedure
			.input(routePreviewSchema)
			.query(async ({ ctx, input }) => {
				return previewModelRouteForUser({
					userId: ctx.session.user.id,
					modelId: input.modelId,
				});
			}),
	}),
});
