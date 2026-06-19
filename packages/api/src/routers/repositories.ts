import { workspaceSettingsSchema } from "@gitpal/utils";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	protectedMutationProcedure,
	protectedProcedure,
	router,
} from "../index";
import { requireOrganizationPermission } from "../services/organization-access";
import {
	addRepositoryForUser,
	ensureRepositoriesSyncedForUser,
	listRepositoriesForUser,
	listRepositoryProvidersForUser,
	listWorkspacesForUser,
	setRepositoryEnabledForUser,
} from "../services/repository-sync";
import { queueRepositoryWebhookSyncForUser } from "../services/repository-webhook-sync";
import {
	getOrganizationWorkspaceSettings,
	getRepositoryWorkspaceSettings,
	saveOrganizationWorkspaceSettings,
	saveRepositoryWorkspaceSettings,
} from "../services/workspace-settings";

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
				input?.organizationId ??
				ctx.session.session.activeOrganizationId ??
				null;

			// auto-sync on first load so new users always see their
			// repos without having to manually hit the sync button. The TTL (15 min)
			// means this is effectively a no-op after the first call.
			await ensureRepositoriesSyncedForUser({
				userId: ctx.session.user.id,
			});

			if (organizationId) {
				await requireOrganizationPermission({
					userId: ctx.session.user.id,
					organizationId,
					permissions: { repository: ["read"] },
				});
			}

			return listRepositoriesForUser({
				userId: ctx.session.user.id,
				organizationId,
			});
		}),

	providers: protectedProcedure.query(async ({ ctx }) => {
		return listRepositoryProvidersForUser({ userId: ctx.session.user.id });
	}),

	workspaces: protectedProcedure.query(async ({ ctx }) => {
		// FIX Issue 2: auto-sync so a new user immediately sees their workspaces.
		// Normal TTL applies — no extra cost after first run.
		await ensureRepositoriesSyncedForUser({
			userId: ctx.session.user.id,
		});

		return listWorkspacesForUser({ userId: ctx.session.user.id });
	}),

	sync: protectedMutationProcedure.mutation(async ({ ctx }) => {
		// FIX Issue 1: bypass TTL entirely for an explicit user-triggered sync.
		// ttlMs: 0 means "always refresh".
		const sync = await ensureRepositoriesSyncedForUser({
			userId: ctx.session.user.id,
			ttlMs: 0,
		});

		const webhookSync = await queueRepositoryWebhookSyncForUser({
			userId: ctx.session.user.id,
			reason: "sync",
		});

		// FIX Issue 5: surface the first personal workspace ID so the client can
		// set it as the active org for a newly-onboarded user.
		const defaultWorkspaceId = sync.workspaceIds[0] ?? null;

		return {
			...sync,
			webhookSync,
			defaultWorkspaceId,
		};
	}),

	syncWebhooks: protectedMutationProcedure
		.input(
			organizationScopeSchema
				.merge(z.object({ repositoryId: z.string().min(1).optional() }))
				.optional(),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId =
				input?.organizationId ??
				ctx.session.session.activeOrganizationId ??
				null;

			if (organizationId) {
				await requireOrganizationPermission({
					userId: ctx.session.user.id,
					organizationId,
					permissions: { repository: ["sync"] },
				});
			}

			return queueRepositoryWebhookSyncForUser({
				userId: ctx.session.user.id,
				organizationId: organizationId ?? undefined,
				repositoryId: input?.repositoryId,
				reason: "sync",
			});
		}),

	addRepository: protectedMutationProcedure
		.input(repositoryAddSchema)
		.mutation(async ({ ctx, input }) => {
			const repository = await addRepositoryForUser({
				userId: ctx.session.user.id,
				providerId: input.providerId,
				repositoryPath: input.repositoryPath,
			});

			if (!repository) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Repository could not be found for the selected provider.",
				});
			}

			// FIX Issue 3: permission check uses the RESOLVED org, not just the
			// active org from the session. This handles the case where the repo
			// lands in a different workspace than the currently active one.
			await requireOrganizationPermission({
				userId: ctx.session.user.id,
				organizationId: repository.organizationId,
				permissions: { repository: ["sync"] },
			});

			const webhookSync = await queueRepositoryWebhookSyncForUser({
				userId: ctx.session.user.id,
				organizationId: repository.organizationId,
				repositoryId: repository.repositoryId,
				reason: "repository-added",
			});

			return { repository, webhookSync };
		}),

	toggleEnabled: protectedMutationProcedure
		.input(repositoryToggleSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId =
				input.organizationId ??
				ctx.session.session.activeOrganizationId ??
				null;

			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Select a workspace first.",
				});
			}

			await requireOrganizationPermission({
				userId: ctx.session.user.id,
				organizationId,
				permissions: { repository: ["update"] },
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

			const webhookSync = input.enabled
				? await queueRepositoryWebhookSyncForUser({
						userId: ctx.session.user.id,
						organizationId,
						repositoryId: input.repositoryId,
						reason: "repository-enabled",
					})
				: null;

			return {
				id: repository.repositoryId,
				enabled: repository.enabled,
				webhookSync,
			};
		}),

	getOrganizationSettings: protectedProcedure
		.input(organizationScopeSchema.optional())
		.query(async ({ ctx, input }) => {
			const organizationId =
				input?.organizationId ??
				ctx.session.session.activeOrganizationId ??
				null;

			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Select a workspace first.",
				});
			}

			await requireOrganizationPermission({
				userId: ctx.session.user.id,
				organizationId,
				permissions: { settings: ["read"] },
			});

			return {
				settings: await getOrganizationWorkspaceSettings(organizationId),
			};
		}),

	updateOrganizationSettings: protectedMutationProcedure
		.input(organizationScopeSchema.merge(organizationSettingsUpdateSchema))
		.mutation(async ({ ctx, input }) => {
			const organizationId =
				input.organizationId ??
				ctx.session.session.activeOrganizationId ??
				null;

			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Select a workspace first.",
				});
			}

			await requireOrganizationPermission({
				userId: ctx.session.user.id,
				organizationId,
				permissions: { settings: ["update"] },
			});

			const settings = await saveOrganizationWorkspaceSettings({
				organizationId,
				settings: input.settings,
			});

			const webhookSync = await queueRepositoryWebhookSyncForUser({
				userId: ctx.session.user.id,
				organizationId,
				reason: "organization-settings-updated",
			});

			return { settings, webhookSync };
		}),

	getRepositorySettings: protectedProcedure
		.input(organizationScopeSchema.merge(repositorySettingsQuerySchema))
		.query(async ({ ctx, input }) => {
			const organizationId =
				input.organizationId ??
				ctx.session.session.activeOrganizationId ??
				null;

			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Select a workspace first.",
				});
			}

			await requireOrganizationPermission({
				userId: ctx.session.user.id,
				organizationId,
				permissions: { settings: ["read"] },
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
				input.organizationId ??
				ctx.session.session.activeOrganizationId ??
				null;

			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Select a workspace first.",
				});
			}

			await requireOrganizationPermission({
				userId: ctx.session.user.id,
				organizationId,
				permissions: { settings: ["update"] },
			});

			const saved = await saveRepositoryWorkspaceSettings({
				organizationId,
				repositoryId: input.repositoryId,
				useOrganizationSettings: input.useOrganizationSettings,
				settings: input.settings,
			});

			const webhookSync = await queueRepositoryWebhookSyncForUser({
				userId: ctx.session.user.id,
				organizationId,
				repositoryId: input.repositoryId,
				reason: "repository-settings-updated",
			});

			return {
				settings: saved.settings,
				useOrganizationSettings: saved.useOrganizationSettings,
				webhookSync,
			};
		}),
});
