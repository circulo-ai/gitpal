import { workspaceAc, workspaceRoles } from "@gitpal/auth";
import { repositories } from "@gitpal/repositories";
import { z } from "zod";

const permissionSchema = z.record(z.string(), z.array(z.string()));

export type OrganizationAccessErrorCode =
	| "select_workspace_first"
	| "member_not_found"
	| "role_not_found"
	| "permission_denied";

export class OrganizationAccessError extends Error {
	constructor(
		public readonly code: OrganizationAccessErrorCode,
		message: string,
	) {
		super(message);
		this.name = "OrganizationAccessError";
	}
}

function parseRolePermission(value: unknown) {
	if (typeof value === "string") {
		try {
			return permissionSchema.parse(JSON.parse(value));
		} catch {
			return null;
		}
	}

	if (value && typeof value === "object") {
		return permissionSchema.safeParse(value).success
			? (value as Record<string, string[]>)
			: null;
	}

	return null;
}

async function getRoleDefinition(organizationId: string, role: string) {
	if (role in workspaceRoles) {
		return workspaceRoles[role as keyof typeof workspaceRoles];
	}

	const customRole =
		await repositories.organizationRole.findByOrganizationIdAndRole(
			organizationId,
			role,
		);

	const permissions = customRole
		? parseRolePermission(customRole.permission)
		: null;

	if (!permissions) {
		return null;
	}

	return workspaceAc.newRole(permissions);
}

export async function getActiveOrganizationMember({
	userId,
	organizationId,
}: {
	userId: string;
	organizationId: string;
}) {
	const member = await repositories.member.findByUserIdAndOrganizationId(
		userId,
		organizationId,
	);

	return member ?? null;
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
	if (!organizationId) {
		throw new OrganizationAccessError(
			"select_workspace_first",
			"Select a workspace first.",
		);
	}

	const member = await getActiveOrganizationMember({ userId, organizationId });

	if (!member) {
		throw new OrganizationAccessError(
			"member_not_found",
			"You do not have access to this workspace.",
		);
	}

	const role = await getRoleDefinition(organizationId, member.role);

	if (!role) {
		throw new OrganizationAccessError(
			"role_not_found",
			"Your workspace role does not have any permissions.",
		);
	}

	if (!role.authorize(permissions).success) {
		throw new OrganizationAccessError(
			"permission_denied",
			"You are not allowed to perform this action.",
		);
	}

	return {
		member,
		role,
	};
}
