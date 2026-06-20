import {
	listWorkspaceTeamMembersForUser,
	syncWorkspaceTeamMembersForUser,
	updateWorkspaceTeamMemberAccess,
} from "@gitpal/services/team-management";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	protectedMutationProcedure,
	protectedProcedure,
	router,
} from "../index";
import { requireOrganizationPermission } from "../services/organization-access";

const organizationScopeSchema = z.object({
	organizationId: z.string().min(1).optional(),
});

const workspaceRoleSchema = z.enum(["none", "owner", "admin", "member"]);

const updateMemberAccessSchema = organizationScopeSchema.extend({
	targetUserId: z.string().min(1),
	workspaceRole: workspaceRoleSchema.optional(),
	repositoryAccessEnabled: z.boolean().optional(),
});

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : "Team member update failed.";
}

function resolveOrganizationId(organizationId: string | null | undefined) {
	if (!organizationId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Select a workspace first.",
		});
	}

	return organizationId;
}

async function canUseOrganizationPermission({
	userId,
	organizationId,
	permissions,
}: {
	userId: string;
	organizationId: string;
	permissions: Record<string, string[]>;
}) {
	try {
		await requireOrganizationPermission({
			userId,
			organizationId,
			permissions,
		});
		return true;
	} catch {
		return false;
	}
}

export const teamManagementRouter = router({
	members: protectedProcedure
		.input(organizationScopeSchema.optional())
		.query(async ({ ctx, input }) => {
			const organizationId = resolveOrganizationId(
				input?.organizationId ?? ctx.session.session.activeOrganizationId,
			);

			await requireOrganizationPermission({
				userId: ctx.session.user.id,
				organizationId,
				permissions: { settings: ["read"] },
			});

			const result = await listWorkspaceTeamMembersForUser({
				userId: ctx.session.user.id,
				organizationId,
			});

			return {
				...result,
				permissions: {
					canManageMembers: await canUseOrganizationPermission({
						userId: ctx.session.user.id,
						organizationId,
						permissions: { member: ["update"] },
					}),
					canManageRepositoryAccess: await canUseOrganizationPermission({
						userId: ctx.session.user.id,
						organizationId,
						permissions: { repository: ["update"] },
					}),
					canSyncMembers: await canUseOrganizationPermission({
						userId: ctx.session.user.id,
						organizationId,
						permissions: { repository: ["sync"] },
					}),
				},
			};
		}),

	syncMembers: protectedMutationProcedure
		.input(organizationScopeSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = resolveOrganizationId(
				input.organizationId ?? ctx.session.session.activeOrganizationId,
			);

			await requireOrganizationPermission({
				userId: ctx.session.user.id,
				organizationId,
				permissions: { repository: ["sync"] },
			});

			return syncWorkspaceTeamMembersForUser({
				userId: ctx.session.user.id,
				organizationId,
				force: true,
			});
		}),

	updateMember: protectedMutationProcedure
		.input(updateMemberAccessSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = resolveOrganizationId(
				input.organizationId ?? ctx.session.session.activeOrganizationId,
			);

			if (
				input.workspaceRole === undefined &&
				input.repositoryAccessEnabled === undefined
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Choose a team member change first.",
				});
			}

			if (input.workspaceRole !== undefined) {
				await requireOrganizationPermission({
					userId: ctx.session.user.id,
					organizationId,
					permissions: { member: ["update"] },
				});
			}

			if (input.repositoryAccessEnabled !== undefined) {
				await requireOrganizationPermission({
					userId: ctx.session.user.id,
					organizationId,
					permissions: { repository: ["update"] },
				});
			}

			try {
				return await updateWorkspaceTeamMemberAccess({
					actorUserId: ctx.session.user.id,
					organizationId,
					targetUserId: input.targetUserId,
					workspaceRole: input.workspaceRole,
					repositoryAccessEnabled: input.repositoryAccessEnabled,
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: getErrorMessage(error),
				});
			}
		}),
});
