import { clientSideHasPermission } from "better-auth/client/plugins";
import { createAccessControl, type Role } from "better-auth/plugins/access";
import type { OrganizationOptions } from "better-auth/plugins/organization";
import { defaultStatements } from "better-auth/plugins/organization/access";

export const workspaceStatements = {
	...defaultStatements,
	repository: ["read", "update", "sync"],
	settings: ["read", "update"],
} as const;

export const workspaceAc = createAccessControl(workspaceStatements);

export const workspaceRoles = {
	owner: workspaceAc.newRole({
		organization: ["update", "delete"],
		member: ["create", "update", "delete"],
		invitation: ["create", "cancel"],
		team: ["create", "update", "delete"],
		ac: ["create", "read", "update", "delete"],
		repository: ["read", "update", "sync"],
		settings: ["read", "update"],
	}),
	admin: workspaceAc.newRole({
		organization: ["update"],
		member: ["create", "update", "delete"],
		invitation: ["create", "cancel"],
		team: ["create", "update", "delete"],
		ac: ["read"],
		repository: ["read", "update", "sync"],
		settings: ["read", "update"],
	}),
	member: workspaceAc.newRole({
		organization: [],
		member: [],
		invitation: [],
		team: [],
		ac: ["read"],
		repository: ["read"],
		settings: ["read"],
	}),
} as const satisfies Record<string, Role>;

export type WorkspaceRole = keyof typeof workspaceRoles;

export const workspaceRoleLabels: Record<WorkspaceRole, string> = {
	owner: "Owner",
	admin: "Admin",
	member: "Member",
};

export const workspacePermissionOptions = {
	creatorRole: "owner",
	ac: workspaceAc,
	roles: workspaceRoles,
} as const satisfies Pick<OrganizationOptions, "ac" | "creatorRole" | "roles">;

export function canUseWorkspacePermission(input: {
	role: string;
	permissions: Record<string, string[]>;
	allowCreatorAllPermissions?: boolean;
}) {
	return clientSideHasPermission({
		role: input.role,
		permissions: input.permissions,
		allowCreatorAllPermissions: input.allowCreatorAllPermissions,
		options: workspacePermissionOptions as OrganizationOptions,
	});
}
