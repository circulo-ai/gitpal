import {
	getActiveOrganizationMember,
	OrganizationAccessError,
	requireOrganizationPermission as requireOrganizationPermissionService,
} from "@gitpal/services/organization-access";
import { TRPCError } from "@trpc/server";

function toTrpcError(error: OrganizationAccessError): TRPCError {
	switch (error.code) {
		case "select_workspace_first":
			return new TRPCError({
				code: "BAD_REQUEST",
				message: error.message,
			});
		case "member_not_found":
		case "role_not_found":
		case "permission_denied":
			return new TRPCError({
				code: "FORBIDDEN",
				message: error.message,
			});
	}
}

export async function requireOrganizationPermission({
	userId,
	organizationId,
	permissions,
}: {
	userId: string;
	organizationId: string | null;
	permissions: Record<string, string[]>;
}) {
	try {
		return await requireOrganizationPermissionService({
			userId,
			organizationId,
			permissions,
		});
	} catch (error) {
		if (error instanceof OrganizationAccessError) {
			throw toTrpcError(error);
		}

		throw error;
	}
}

export { getActiveOrganizationMember };
