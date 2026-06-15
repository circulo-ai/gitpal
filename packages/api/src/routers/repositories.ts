import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { requireOrganizationPermission } from "../services/organization-access";
import {
	addRepositoryForUser,
	ensureRepositoriesSyncedForUser,
	listRepositoryProvidersForUser,
	listRepositoriesForUser,
	setRepositoryEnabledForUser,
} from "../services/repository-sync";
import {
	getOrganizationWorkspaceSettings,
	getRepositoryWorkspaceSettings,
	saveOrganizationWorkspaceSettings,
	saveRepositoryWorkspaceSettings,
} from "../services/workspace-settings";
import { protectedProcedure, router } from "../index";
import { workspaceSettingsSchema } from "@gitpal/utils";

const repositoryToggleSchema = z.object({
	repositoryId: z.string().min(1),
	enabled: z.boolean(),
});

const organizationScopeSchema = z.object({
	organizationId: z.string().min(1).optional(),
});

const repositoryAddSchema = z.object({
	providerId: z.string().min(1),
	repositoryPath: z.string().min(1),
});

const organizationSettingsUpdateSchema = z.object({
	settings: workspaceSettingsSchema,
});

const repositorySettingsQuerySchema = z.object({
	repositoryId: z.string().min(1),
});

const repositorySettingsUpdateSchema = z.object({
	repositoryId: z.string().min(1),
	useOrganizationSettings: z.boolean(),
	settings: workspaceSettingsSchema,
});

export const repositoriesRouter = router({
	list: protectedProcedure
		.input(organizationScopeSchema.optional())
		.query(async ({ ctx, input }) => {
			const organizationId =
				input?.organizationId ?? ctx.session.session.activeOrganizationId ?? null;

			if (organizationId) {
				await requireOrganizationPermission({
					userId: ctx.session.user.id,
					organizationId,
					permissions: {
						repository: ["read"],
					},
				});
			}

			return listRepositoriesForUser({
				userId: ctx.session.user.id,
				organizationId,
			});
		}),
	providers: protectedProcedure.query(async ({ ctx }) => {
			return listRepositoryProvidersForUser({
				userId: ctx.session.user.id,
			});
		}),
	sync: protectedProcedure.mutation(async ({ ctx }) => {
		await requireOrganizationPermission({
			userId: ctx.session.user.id,
			organizationId: ctx.session.session.activeOrganizationId ?? null,
			permissions: {
				repository: ["sync"],
			},
		});

		return ensureRepositoriesSyncedForUser({
			userId: ctx.session.user.id,
			organizationId: ctx.session.session.activeOrganizationId ?? null,
		});
	}),
	addRepository: protectedProcedure
		.input(repositoryAddSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;

			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Select an organization first.",
				});
			}

			await requireOrganizationPermission({
				userId: ctx.session.user.id,
				organizationId,
				permissions: {
					repository: ["sync"],
				},
			});

			const repository = await addRepositoryForUser({
				userId: ctx.session.user.id,
				organizationId,
				providerId: input.providerId,
				repositoryPath: input.repositoryPath,
			});

			if (!repository) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Repository could not be found for the selected provider.",
				});
			}

			return repository;
		}),
	toggleEnabled: protectedProcedure
		.input(repositoryToggleSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;

			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Select an organization first.",
				});
			}

			await requireOrganizationPermission({
				userId: ctx.session.user.id,
				organizationId,
				permissions: {
					repository: ["update"],
				},
			});

			const repository = await setRepositoryEnabledForUser({
				userId: ctx.session.user.id,
				organizationId,
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
	getOrganizationSettings: protectedProcedure
		.input(organizationScopeSchema.optional())
		.query(async ({ ctx, input }) => {
			const organizationId =
				input?.organizationId ?? ctx.session.session.activeOrganizationId ?? null;

			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Select an organization first.",
				});
			}

			await requireOrganizationPermission({
				userId: ctx.session.user.id,
				organizationId,
				permissions: {
					settings: ["read"],
				},
			});

			return {
				settings: await getOrganizationWorkspaceSettings(organizationId),
			};
		}),
	updateOrganizationSettings: protectedProcedure
		.input(organizationScopeSchema.merge(organizationSettingsUpdateSchema))
		.mutation(async ({ ctx, input }) => {
			const organizationId =
				input.organizationId ?? ctx.session.session.activeOrganizationId ?? null;

			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Select an organization first.",
				});
			}

			await requireOrganizationPermission({
				userId: ctx.session.user.id,
				organizationId,
				permissions: {
					settings: ["update"],
				},
			});

			return {
				settings: await saveOrganizationWorkspaceSettings({
					organizationId,
					settings: input.settings,
				}),
			};
		}),
	getRepositorySettings: protectedProcedure
		.input(organizationScopeSchema.merge(repositorySettingsQuerySchema))
		.query(async ({ ctx, input }) => {
			const organizationId =
				input.organizationId ?? ctx.session.session.activeOrganizationId ?? null;

			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Select an organization first.",
				});
			}

			await requireOrganizationPermission({
				userId: ctx.session.user.id,
				organizationId,
				permissions: {
					settings: ["read"],
				},
			});

			return getRepositoryWorkspaceSettings({
				organizationId,
				repositoryId: input.repositoryId,
				userId: ctx.session.user.id,
			});
		}),
	updateRepositorySettings: protectedProcedure
		.input(organizationScopeSchema.merge(repositorySettingsUpdateSchema))
		.mutation(async ({ ctx, input }) => {
			const organizationId =
				input.organizationId ?? ctx.session.session.activeOrganizationId ?? null;

			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Select an organization first.",
				});
			}

			await requireOrganizationPermission({
				userId: ctx.session.user.id,
				organizationId,
				permissions: {
					settings: ["update"],
				},
			});

			const saved = await saveRepositoryWorkspaceSettings({
				organizationId,
				repositoryId: input.repositoryId,
				useOrganizationSettings: input.useOrganizationSettings,
				settings: input.settings,
			});

			return {
				settings: saved.settings,
				useOrganizationSettings: saved.useOrganizationSettings,
			};
		}),
});
