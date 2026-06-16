import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { requireOrganizationPermission } from "../services/organization-access";
import {
	addRepositoryForUser,
	ensureRepositoriesSyncedForUser,
	listRepositoryProvidersForUser,
	listRepositoriesForUser,
	listWorkspacesForUser,
	setRepositoryEnabledForUser,
} from "../services/repository-sync";
import {
	getOrganizationWorkspaceSettings,
	getRepositoryWorkspaceSettings,
	saveOrganizationWorkspaceSettings,
	saveRepositoryWorkspaceSettings,
} from "../services/workspace-settings";
import { ensureRepositoryWebhooksForUser } from "../services/repository-webhooks";
import {
	protectedMutationProcedure,
	protectedProcedure,
	router,
} from "../index";
import { workspaceSettingsSchema } from "@gitpal/utils";

const organizationScopeSchema = z.object({
	organizationId: z.string().min(1).optional(),
});

const repositoryToggleSchema = organizationScopeSchema.merge(
	z.object({
		repositoryId: z.string().min(1),
		enabled: z.boolean(),
	}),
);

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
	workspaces: protectedProcedure.query(async ({ ctx }) => {
		return listWorkspacesForUser({
			userId: ctx.session.user.id,
		});
	}),
	sync: protectedMutationProcedure.mutation(async ({ ctx }) => {
		const sync = await ensureRepositoriesSyncedForUser({
			userId: ctx.session.user.id,
		});
		const webhooks = await ensureRepositoryWebhooksForUser({
			userId: ctx.session.user.id,
		});

		return {
			...sync,
			webhooks,
		};
	}),
	syncWebhooks: protectedMutationProcedure
		.input(
			organizationScopeSchema.merge(
				z.object({
					repositoryId: z.string().min(1).optional(),
				}),
			).optional(),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId =
				input?.organizationId ?? ctx.session.session.activeOrganizationId ?? null;

			if (organizationId) {
				await requireOrganizationPermission({
					userId: ctx.session.user.id,
					organizationId,
					permissions: {
						repository: ["sync"],
					},
				});
			}

			return ensureRepositoryWebhooksForUser({
				userId: ctx.session.user.id,
				organizationId,
				repositoryId: input?.repositoryId,
			});
	}),
	addRepository: protectedMutationProcedure
		.input(repositoryAddSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;

			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Select a workspace first.",
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

			await ensureRepositoryWebhooksForUser({
				userId: ctx.session.user.id,
				organizationId: repository.organizationId,
				repositoryId: repository.repositoryId,
			});

			return repository;
		}),
	toggleEnabled: protectedMutationProcedure
		.input(repositoryToggleSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId =
				input.organizationId ?? ctx.session.session.activeOrganizationId ?? null;

			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Select a workspace first.",
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

			if (input.enabled) {
				await ensureRepositoryWebhooksForUser({
					userId: ctx.session.user.id,
					organizationId,
					repositoryId: input.repositoryId,
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
					message: "Select a workspace first.",
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
	updateOrganizationSettings: protectedMutationProcedure
		.input(organizationScopeSchema.merge(organizationSettingsUpdateSchema))
		.mutation(async ({ ctx, input }) => {
			const organizationId =
				input.organizationId ?? ctx.session.session.activeOrganizationId ?? null;

			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Select a workspace first.",
				});
			}

			await requireOrganizationPermission({
				userId: ctx.session.user.id,
				organizationId,
				permissions: {
					settings: ["update"],
				},
			});

			const settings = await saveOrganizationWorkspaceSettings({
				organizationId,
				settings: input.settings,
			});

			await ensureRepositoryWebhooksForUser({
				userId: ctx.session.user.id,
				organizationId,
			});

			return {
				settings,
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
					message: "Select a workspace first.",
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
	updateRepositorySettings: protectedMutationProcedure
		.input(organizationScopeSchema.merge(repositorySettingsUpdateSchema))
		.mutation(async ({ ctx, input }) => {
			const organizationId =
				input.organizationId ?? ctx.session.session.activeOrganizationId ?? null;

			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Select a workspace first.",
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

			await ensureRepositoryWebhooksForUser({
				userId: ctx.session.user.id,
				organizationId,
				repositoryId: input.repositoryId,
			});

			return {
				settings: saved.settings,
				useOrganizationSettings: saved.useOrganizationSettings,
			};
		}),
});
