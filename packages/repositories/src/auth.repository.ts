import {
	account,
	apiKey,
	enterpriseGitProvider,
	invitation,
	member,
	organization,
	organizationRole,
	rateLimit,
	session,
	team,
	teamMember,
	user,
	verification,
} from "@gitpal/db/schema";
import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import { BaseRepository } from "./shared/base.repository";
import { conflictUpdateAllExcept } from "./shared/sql";
import type { Executor } from "./shared/types";

export type Account = typeof account.$inferSelect;
export type ApiKey = typeof apiKey.$inferSelect;
export type EnterpriseGitProvider = typeof enterpriseGitProvider.$inferSelect;
export type User = typeof user.$inferSelect;
export type Member = typeof member.$inferSelect;
export type Organization = typeof organization.$inferSelect;

export class UserRepository extends BaseRepository<typeof user> {
	constructor(executor: Executor) {
		super(executor, user);
	}

	listByIds(ids: string[]) {
		if (ids.length === 0) return Promise.resolve([]);
		return this.findMany({
			where: inArray(user.id, ids),
		});
	}
}

export class SessionRepository extends BaseRepository<typeof session> {
	constructor(executor: Executor) {
		super(executor, session);
	}

	listByUserId(userId: string) {
		return this.findMany({
			where: eq(session.userId, userId),
		});
	}
}

export class AccountRepository extends BaseRepository<typeof account> {
	constructor(executor: Executor) {
		super(executor, account);
	}

	findByUserIdAndProviderId(userId: string, providerId: string) {
		return this.findOne(
			and(eq(account.userId, userId), eq(account.providerId, providerId)),
		);
	}

	listByUserId(userId: string) {
		return this.findMany({
			where: eq(account.userId, userId),
		});
	}
}

export class OrganizationRepository extends BaseRepository<
	typeof organization
> {
	constructor(executor: Executor) {
		super(executor, organization);
	}

	async upsert(values: typeof organization.$inferInsert) {
		const [row] = await this.executor
			.insert(organization)
			.values(values)
			.onConflictDoUpdate({
				target: organization.id,
				set: conflictUpdateAllExcept(organization, ["id", "createdAt"]),
			})
			.returning();
		return row;
	}
}

export class MemberRepository extends BaseRepository<typeof member> {
	constructor(executor: Executor) {
		super(executor, member);
	}

	async upsert(values: typeof member.$inferInsert) {
		const [row] = await this.executor
			.insert(member)
			.values(values)
			.onConflictDoUpdate({
				target: [member.userId, member.organizationId],
				set: {
					role: values.role ?? "member",
				},
			})
			.returning();
		return row;
	}

	async findMembershipsForUserWithOrganization(userId: string) {
		return this.executor
			.select({
				memberId: member.id,
				organizationId: organization.id,
				metadata: organization.metadata,
			})
			.from(member)
			.innerJoin(organization, eq(member.organizationId, organization.id))
			.where(eq(member.userId, userId));
	}

	deleteManyByIds(ids: string[]) {
		if (ids.length === 0) return Promise.resolve(0);
		return this.deleteMany(inArray(member.id, ids));
	}

	async findWorkspacesForUser(userId: string) {
		const rows = await this.executor
			.select({
				member: member,
				organization: organization,
			})
			.from(member)
			.innerJoin(organization, eq(member.organizationId, organization.id))
			.where(eq(member.userId, userId));
		return rows;
	}

	listByOrganizationId(organizationId: string) {
		return this.findMany({
			where: eq(member.organizationId, organizationId),
		});
	}

	findByUserIdAndOrganizationId(userId: string, organizationId: string) {
		return this.findOne(
			and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
		);
	}

	listAdminsAndOwners(organizationId: string) {
		return this.findMany({
			where: and(
				eq(member.organizationId, organizationId),
				inArray(member.role, ["owner", "admin"]),
			),
		});
	}

	async countOtherOwners(organizationId: string, targetUserId: string) {
		const [row] = await this.executor
			.select({ total: count() })
			.from(member)
			.where(
				and(
					eq(member.organizationId, organizationId),
					eq(member.role, "owner"),
					ne(member.userId, targetUserId),
				),
			)
			.limit(1);
		return Number(row?.total ?? 0);
	}

	async acquireTeamAccessLock(organizationId: string) {
		await this.executor.execute(
			sql`select pg_advisory_xact_lock(hashtext(${`team-access:${organizationId}`}))`,
		);
	}

	async deleteMembership(userId: string, organizationId: string) {
		return this.deleteMany(
			and(
				eq(member.userId, userId),
				eq(member.organizationId, organizationId),
			)!,
		);
	}
}

export class TeamRepository extends BaseRepository<typeof team> {
	constructor(executor: Executor) {
		super(executor, team);
	}

	listByOrganizationId(organizationId: string) {
		return this.findMany({
			where: eq(team.organizationId, organizationId),
		});
	}
}

export class TeamMemberRepository extends BaseRepository<typeof teamMember> {
	constructor(executor: Executor) {
		super(executor, teamMember);
	}
}

export class InvitationRepository extends BaseRepository<typeof invitation> {
	constructor(executor: Executor) {
		super(executor, invitation);
	}

	listByOrganizationId(organizationId: string) {
		return this.findMany({
			where: eq(invitation.organizationId, organizationId),
		});
	}
}

export class OrganizationRoleRepository extends BaseRepository<
	typeof organizationRole
> {
	constructor(executor: Executor) {
		super(executor, organizationRole);
	}

	findByOrganizationIdAndRole(organizationId: string, role: string) {
		return this.findOne(
			and(
				eq(organizationRole.organizationId, organizationId),
				eq(organizationRole.role, role),
			),
		);
	}
}

export class ApiKeyRepository extends BaseRepository<typeof apiKey> {
	constructor(executor: Executor) {
		super(executor, apiKey);
	}

	listByReferenceId(referenceId: string) {
		return this.findMany({
			where: eq(apiKey.referenceId, referenceId),
		});
	}

	findByIdAndReferenceId(id: string, referenceId: string) {
		return this.findOne(
			and(eq(apiKey.id, id), eq(apiKey.referenceId, referenceId)),
		);
	}

	async deleteByIdAndReferenceId(id: string, referenceId: string) {
		const deleted = await this.executor
			.delete(apiKey)
			.where(and(eq(apiKey.id, id), eq(apiKey.referenceId, referenceId)))
			.returning({ id: apiKey.id });
		return deleted.length > 0;
	}
}

export class RateLimitRepository extends BaseRepository<typeof rateLimit> {
	constructor(executor: Executor) {
		super(executor, rateLimit);
	}

	findByKey(key: string) {
		return this.findOne(eq(rateLimit.key, key));
	}

	async findByKeyForUpdate(key: string) {
		const [row] = await this.executor
			.select()
			.from(rateLimit)
			.where(eq(rateLimit.key, key))
			.limit(1)
			.for("update");
		return row ?? null;
	}

	async insertDoNothing(values: typeof rateLimit.$inferInsert) {
		return this.executor
			.insert(rateLimit)
			.values(values)
			.onConflictDoNothing()
			.returning({
				key: rateLimit.key,
			});
	}

	async updateByKey(
		key: string,
		patch: Partial<typeof rateLimit.$inferInsert>,
	) {
		return this.executor
			.update(rateLimit)
			.set(patch)
			.where(eq(rateLimit.key, key));
	}

	async upsertKey(key: string, values: { count: number; lastRequest: number }) {
		const [row] = await this.executor
			.insert(rateLimit)
			.values({
				id: `rl_${key}`,
				key,
				count: values.count,
				lastRequest: values.lastRequest,
			})
			.onConflictDoUpdate({
				target: rateLimit.key,
				set: conflictUpdateAllExcept(rateLimit, ["id", "key"]),
			})
			.returning();
		return row;
	}
}

export class VerificationRepository extends BaseRepository<
	typeof verification
> {
	constructor(executor: Executor) {
		super(executor, verification);
	}
}

export class EnterpriseGitProviderRepository extends BaseRepository<
	typeof enterpriseGitProvider
> {
	constructor(executor: Executor) {
		super(executor, enterpriseGitProvider);
	}
}
