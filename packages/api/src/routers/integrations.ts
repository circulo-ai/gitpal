import {
	connectorDeleteInputSchema,
	connectorListInputSchema,
	connectorOAuthStartInputSchema,
	connectorToggleInputSchema,
	connectorTypeSchema,
	connectorUpsertInputSchema,
} from "@gitpal/mcp";
import {
	createIntegrationOAuthAuthorizationUrl,
	deleteIntegrationConnection,
	listEnabledIntegrationToolContexts,
	listIntegrationConnections,
	listIntegrationProviderCatalog,
	setIntegrationConnectionEnabled,
	upsertIntegrationConnection,
} from "@gitpal/services/integrations";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	protectedMutationProcedure,
	protectedProcedure,
	router,
} from "../index";
import { requireOrganizationPermission } from "../services/organization-access";

function getOrganizationId(
	inputOrganizationId: string | null | undefined,
	activeOrganizationId: string | null | undefined,
) {
	const organizationId = inputOrganizationId ?? activeOrganizationId ?? null;

	if (!organizationId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Select a workspace first.",
		});
	}

	return organizationId;
}

export const integrationsRouter = router({
	catalog: protectedProcedure
		.input(z.object({ type: connectorTypeSchema.optional() }).optional())
		.query(({ input }) => {
			return listIntegrationProviderCatalog(input?.type);
		}),

	list: protectedProcedure
		.input(connectorListInputSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = getOrganizationId(
				input?.organizationId,
				ctx.session.session.activeOrganizationId,
			);

			const access = await requireOrganizationPermission({
				userId: ctx.session.user.id,
				organizationId,
				permissions: { integrations: ["read"] },
			});

			return listIntegrationConnections({
				organizationId,
				type: input?.type,
				includeSensitive: ["owner", "admin"].includes(access.member.role),
			});
		}),

	tools: protectedProcedure
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
				permissions: { integrations: ["read"] },
			});

			return listEnabledIntegrationToolContexts({ organizationId });
		}),

	save: protectedMutationProcedure
		.input(connectorUpsertInputSchema)
		.mutation(async ({ ctx, input }) => {
			await requireOrganizationPermission({
				userId: ctx.session.user.id,
				organizationId: input.organizationId,
				permissions: { integrations: ["update"] },
			});

			return upsertIntegrationConnection({
				userId: ctx.session.user.id,
				input,
			});
		}),

	startOAuth: protectedMutationProcedure
		.input(connectorOAuthStartInputSchema)
		.mutation(async ({ ctx, input }) => {
			await requireOrganizationPermission({
				userId: ctx.session.user.id,
				organizationId: input.organizationId,
				permissions: { integrations: ["update"] },
			});

			return createIntegrationOAuthAuthorizationUrl({
				organizationId: input.organizationId,
				providerId: input.providerId,
				returnTo: input.returnTo,
				userId: ctx.session.user.id,
			});
		}),

	toggle: protectedMutationProcedure
		.input(connectorToggleInputSchema)
		.mutation(async ({ ctx, input }) => {
			await requireOrganizationPermission({
				userId: ctx.session.user.id,
				organizationId: input.organizationId,
				permissions: { integrations: ["update"] },
			});

			const connection = await setIntegrationConnectionEnabled(input);
			if (!connection) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Connector was not found.",
				});
			}

			return connection;
		}),

	delete: protectedMutationProcedure
		.input(connectorDeleteInputSchema)
		.mutation(async ({ ctx, input }) => {
			await requireOrganizationPermission({
				userId: ctx.session.user.id,
				organizationId: input.organizationId,
				permissions: { integrations: ["update"] },
			});

			const deleted = await deleteIntegrationConnection(input);
			if (!deleted) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Connector was not found.",
				});
			}

			return { deleted };
		}),
});
