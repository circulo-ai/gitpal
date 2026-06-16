import { createDb } from "@gitpal/db";
import * as authSchema from "@gitpal/db/schema/auth";
import { workspaceAc, workspaceRoles } from "@gitpal/auth";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const db = createDb();

const permissionSchema = z.record(z.string(), z.array(z.string()));

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

	const [customRole] = await db
		.select()
		.from(authSchema.organizationRole)
		.where(
			and(
				eq(authSchema.organizationRole.organizationId, organizationId),
				eq(authSchema.organizationRole.role, role),
			),
		)
		.limit(1);

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
	const [member] = await db
		.select()
		.from(authSchema.member)
		.where(
			and(
				eq(authSchema.member.userId, userId),
				eq(authSchema.member.organizationId, organizationId),
			),
		)
		.limit(1);

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
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Select a workspace first.",
		});
	}

	const member = await getActiveOrganizationMember({ userId, organizationId });

	if (!member) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You do not have access to this workspace.",
		});
	}

	const role = await getRoleDefinition(organizationId, member.role);

	if (!role) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Your workspace role does not have any permissions.",
		});
	}

	if (!role.authorize(permissions).success) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You are not allowed to perform this action.",
		});
	}

	return {
		member,
		role,
	};
}
