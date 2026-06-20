import { db, runTransactionWithRetry } from "@gitpal/db";
import * as authSchema from "@gitpal/db/schema/auth";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import type { GitWorkspaceMember, GitWorkspaceRef } from "@gitpal/git";
import { createLogger } from "@gitpal/logger";
import {
	and,
	asc,
	count,
	eq,
	inArray,
	max,
	ne,
	notInArray,
	sql,
} from "drizzle-orm";
import {
	createAdapterFromAccount,
	getAccountForProvider,
	getEnterpriseProviderMap,
} from "./git-provider-access";
import { readWorkspaceMetadata } from "./repository-sync";
import { stableId } from "./stable-id";

const log = createLogger("team-management");
const DEFAULT_TEAM_MEMBER_SYNC_TTL_MS = 10 * 60 * 1000;
const workspaceRoles = ["owner", "admin", "member"] as const;

export type WorkspaceRole = (typeof workspaceRoles)[number];
export type WorkspaceRoleUpdate = WorkspaceRole | "none";

type WorkspaceTeamMemberRow = {
	providerMember: typeof dashboardSchema.providerWorkspaceMember.$inferSelect;
	accountUserId: string | null;
	userId: string | null;
	userName: string | null;
	userEmail: string | null;
	userImage: string | null;
	appMemberId: string | null;
	appRole: string | null;
};

export type WorkspaceTeamMember = {
	id: string;
	providerMemberId: string;
	providerId: string;
	providerType: string;
	login: string | null;
	name: string | null;
	email: string | null;
	avatarUrl: string | null;
	htmlUrl: string | null;
	providerRole: string;
	registered: boolean;
	registeredUser: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	} | null;
	appMemberId: string | null;
	workspaceRole: string | null;
	repositoryAccessEnabled: number;
	repositoryAccessTotal: number;
	lastSyncedAt: string;
};

export type WorkspaceTeamMembersResult = {
	members: WorkspaceTeamMember[];
	summary: {
		totalProviderMembers: number;
		registeredMembers: number;
		workspaceMembers: number;
		repositoryCount: number;
	};
	lastSyncedAt: string | null;
	sync: WorkspaceTeamMemberSyncResult | null;
};

export type WorkspaceTeamMemberSyncResult = {
	synced: boolean;
	skipped: boolean;
	count: number;
	lastSyncedAt: string | null;
	error: string | null;
};

function getProviderWorkspaceMemberId({
	organizationId,
	providerId,
	providerMemberId,
}: {
	organizationId: string;
	providerId: string;
	providerMemberId: string;
}) {
	return `pwm_${stableId([organizationId, providerId, providerMemberId]).slice(0, 32)}`;
}

function getWorkspaceMemberId(userId: string, organizationId: string) {
	return `member_${stableId([userId, organizationId]).slice(0, 32)}`;
}

function getRepositoryAccessId(userId: string, repositoryId: string) {
	return `repo_access_${stableId([userId, repositoryId]).slice(0, 32)}`;
}

function toWorkspaceRole(value: string | null): WorkspaceRole | null {
	return workspaceRoles.includes(value as WorkspaceRole)
		? (value as WorkspaceRole)
		: null;
}

function getErrorMessage(error: unknown) {
	return error instanceof Error
		? error.message
		: "Unable to sync team members.";
}

async function getProviderWorkspaceContext({
	userId,
	organizationId,
}: {
	userId: string;
	organizationId: string;
}) {
	const [organization] = await db
		.select()
		.from(authSchema.organization)
		.where(eq(authSchema.organization.id, organizationId))
		.limit(1);

	if (!organization) {
		return {
			organization: null,
			metadata: null,
			account: null,
			enterpriseProviders: new Map(),
		};
	}

	const metadata = readWorkspaceMetadata(organization.metadata);
	if (!metadata) {
		return {
			organization,
			metadata: null,
			account: null,
			enterpriseProviders: new Map(),
		};
	}

	const [account, enterpriseProviders] = await Promise.all([
		getAccountForProvider({ userId, providerId: metadata.providerId }),
		getEnterpriseProviderMap(),
	]);

	return {
		organization,
		metadata,
		account,
		enterpriseProviders,
	};
}

async function getLatestProviderMemberSyncAt(organizationId: string) {
	const [row] = await db
		.select({
			lastSyncedAt: max(dashboardSchema.providerWorkspaceMember.lastSyncedAt),
		})
		.from(dashboardSchema.providerWorkspaceMember)
		.where(
			eq(
				dashboardSchema.providerWorkspaceMember.organizationId,
				organizationId,
			),
		)
		.limit(1);

	return row?.lastSyncedAt ?? null;
}

function shouldRefreshTeamMemberSync(lastSyncedAt: Date | null, ttlMs: number) {
	if (!lastSyncedAt) {
		return true;
	}

	return Date.now() - lastSyncedAt.getTime() > ttlMs;
}

function toGitWorkspaceRef(
	metadata: NonNullable<
		Awaited<ReturnType<typeof getProviderWorkspaceContext>>["metadata"]
	>,
): GitWorkspaceRef {
	return {
		providerOwnerId: metadata.ownerId,
		providerOwnerPath: metadata.ownerPath,
		providerOwnerName: metadata.ownerName,
		providerOwnerAvatarUrl: metadata.ownerAvatarUrl,
		providerOwnerHtmlUrl: metadata.ownerHtmlUrl,
		scope: metadata.scope,
	};
}

async function upsertProviderWorkspaceMembers({
	organizationId,
	providerId,
	providerType,
	members,
}: {
	organizationId: string;
	providerId: string;
	providerType: string;
	members: GitWorkspaceMember[];
}) {
	if (members.length === 0) {
		return;
	}

	const now = new Date();
	const seenProviderMemberIds = members.map((member) => member.id);

	await runTransactionWithRetry(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtext(${`provider-members:${organizationId}`}))`,
		);

		for (const member of members) {
			await tx
				.insert(dashboardSchema.providerWorkspaceMember)
				.values({
					id: getProviderWorkspaceMemberId({
						organizationId,
						providerId,
						providerMemberId: member.id,
					}),
					organizationId,
					providerId,
					providerType,
					providerMemberId: member.id,
					login: member.login,
					name: member.name,
					email: member.email,
					avatarUrl: member.avatarUrl,
					htmlUrl: member.htmlUrl,
					role: member.role,
					lastSyncedAt: now,
					createdAt: now,
					updatedAt: now,
				})
				.onConflictDoUpdate({
					target: [
						dashboardSchema.providerWorkspaceMember.organizationId,
						dashboardSchema.providerWorkspaceMember.providerId,
						dashboardSchema.providerWorkspaceMember.providerMemberId,
					],
					set: {
						providerType,
						login: member.login,
						name: member.name,
						email: member.email,
						avatarUrl: member.avatarUrl,
						htmlUrl: member.htmlUrl,
						role: member.role,
						lastSyncedAt: now,
						updatedAt: now,
					},
				});
		}

		await tx
			.delete(dashboardSchema.providerWorkspaceMember)
			.where(
				and(
					eq(
						dashboardSchema.providerWorkspaceMember.organizationId,
						organizationId,
					),
					eq(dashboardSchema.providerWorkspaceMember.providerId, providerId),
					notInArray(
						dashboardSchema.providerWorkspaceMember.providerMemberId,
						seenProviderMemberIds,
					),
				),
			);
	});
}

export async function syncWorkspaceTeamMembersForUser({
	userId,
	organizationId,
	force = false,
	ttlMs = DEFAULT_TEAM_MEMBER_SYNC_TTL_MS,
}: {
	userId: string;
	organizationId: string;
	force?: boolean;
	ttlMs?: number;
}): Promise<WorkspaceTeamMemberSyncResult> {
	const latestSyncAt = await getLatestProviderMemberSyncAt(organizationId);

	if (!force && !shouldRefreshTeamMemberSync(latestSyncAt, ttlMs)) {
		return {
			synced: false,
			skipped: true,
			count: 0,
			lastSyncedAt: latestSyncAt?.toISOString() ?? null,
			error: null,
		};
	}

	const { metadata, account, enterpriseProviders } =
		await getProviderWorkspaceContext({
			userId,
			organizationId,
		});

	if (!metadata) {
		return {
			synced: false,
			skipped: true,
			count: 0,
			lastSyncedAt: latestSyncAt?.toISOString() ?? null,
			error: "This workspace is not backed by a Git provider.",
		};
	}

	if (!account) {
		return {
			synced: false,
			skipped: true,
			count: 0,
			lastSyncedAt: latestSyncAt?.toISOString() ?? null,
			error: "Connect the matching Git provider account to sync team members.",
		};
	}

	try {
		const adapter = await createAdapterFromAccount({
			account,
			enterpriseProviders,
		});

		if (!adapter) {
			return {
				synced: false,
				skipped: true,
				count: 0,
				lastSyncedAt: latestSyncAt?.toISOString() ?? null,
				error: "Git provider adapter is not configured for this workspace.",
			};
		}

		const members = await adapter.listWorkspaceMembers(
			toGitWorkspaceRef(metadata),
		);
		await upsertProviderWorkspaceMembers({
			organizationId,
			providerId: metadata.providerId,
			providerType: metadata.providerType,
			members,
		});

		return {
			synced: true,
			skipped: false,
			count: members.length,
			lastSyncedAt: new Date().toISOString(),
			error: null,
		};
	} catch (error) {
		const message = getErrorMessage(error);
		log.warn("Provider team member sync failed.", {
			err: error,
			userId,
			organizationId,
			providerId: metadata.providerId,
		});

		return {
			synced: false,
			skipped: false,
			count: 0,
			lastSyncedAt: latestSyncAt?.toISOString() ?? null,
			error: message,
		};
	}
}

async function listProviderWorkspaceMemberRows(organizationId: string) {
	return db
		.select({
			providerMember: dashboardSchema.providerWorkspaceMember,
			accountUserId: authSchema.account.userId,
			userId: authSchema.user.id,
			userName: authSchema.user.name,
			userEmail: authSchema.user.email,
			userImage: authSchema.user.image,
			appMemberId: authSchema.member.id,
			appRole: authSchema.member.role,
		})
		.from(dashboardSchema.providerWorkspaceMember)
		.leftJoin(
			authSchema.account,
			and(
				eq(
					authSchema.account.providerId,
					dashboardSchema.providerWorkspaceMember.providerId,
				),
				eq(
					authSchema.account.accountId,
					dashboardSchema.providerWorkspaceMember.providerMemberId,
				),
			),
		)
		.leftJoin(
			authSchema.user,
			eq(authSchema.user.id, authSchema.account.userId),
		)
		.leftJoin(
			authSchema.member,
			and(
				eq(authSchema.member.userId, authSchema.user.id),
				eq(authSchema.member.organizationId, organizationId),
			),
		)
		.where(
			eq(
				dashboardSchema.providerWorkspaceMember.organizationId,
				organizationId,
			),
		)
		.orderBy(
			asc(dashboardSchema.providerWorkspaceMember.login),
			asc(dashboardSchema.providerWorkspaceMember.name),
		);
}

async function getRepositoryAccessCounts({
	organizationId,
	userIds,
}: {
	organizationId: string;
	userIds: string[];
}) {
	if (userIds.length === 0) {
		return new Map<string, { enabled: number; total: number }>();
	}

	const rows = await db
		.select({
			userId: dashboardSchema.repositoryAccess.userId,
			total: count(),
			enabled: sql<number>`count(*) filter (where ${dashboardSchema.repositoryAccess.enabled})`,
		})
		.from(dashboardSchema.repositoryAccess)
		.innerJoin(
			dashboardSchema.repository,
			eq(
				dashboardSchema.repository.id,
				dashboardSchema.repositoryAccess.repositoryId,
			),
		)
		.where(
			and(
				eq(dashboardSchema.repository.organizationId, organizationId),
				inArray(dashboardSchema.repositoryAccess.userId, userIds),
			),
		)
		.groupBy(dashboardSchema.repositoryAccess.userId);

	return new Map(
		rows.map((row) => [
			row.userId,
			{
				enabled: Number(row.enabled),
				total: Number(row.total),
			},
		]),
	);
}

async function getOrganizationRepositoryCount(organizationId: string) {
	const [row] = await db
		.select({ total: count() })
		.from(dashboardSchema.repository)
		.where(eq(dashboardSchema.repository.organizationId, organizationId))
		.limit(1);

	return Number(row?.total ?? 0);
}

function serializeTeamMemberRow({
	row,
	repositoryAccess,
}: {
	row: WorkspaceTeamMemberRow;
	repositoryAccess: { enabled: number; total: number } | undefined;
}): WorkspaceTeamMember {
	const registered =
		Boolean(row.userId) &&
		Boolean(row.accountUserId) &&
		row.userId === row.accountUserId;

	return {
		id: row.providerMember.id,
		providerMemberId: row.providerMember.providerMemberId,
		providerId: row.providerMember.providerId,
		providerType: row.providerMember.providerType,
		login: row.providerMember.login,
		name: row.providerMember.name,
		email: row.providerMember.email,
		avatarUrl: row.providerMember.avatarUrl,
		htmlUrl: row.providerMember.htmlUrl,
		providerRole: row.providerMember.role,
		registered,
		registeredUser: registered
			? {
					id: row.userId ?? "",
					name: row.userName ?? row.providerMember.name ?? "Registered user",
					email: row.userEmail ?? row.providerMember.email ?? "",
					image: row.userImage,
				}
			: null,
		appMemberId: row.appMemberId,
		workspaceRole: row.appRole,
		repositoryAccessEnabled: repositoryAccess?.enabled ?? 0,
		repositoryAccessTotal: repositoryAccess?.total ?? 0,
		lastSyncedAt: row.providerMember.lastSyncedAt.toISOString(),
	};
}

export async function listWorkspaceTeamMembersForUser({
	userId,
	organizationId,
	refresh = true,
}: {
	userId: string;
	organizationId: string;
	refresh?: boolean;
}): Promise<WorkspaceTeamMembersResult> {
	const sync = refresh
		? await syncWorkspaceTeamMembersForUser({
				userId,
				organizationId,
				force: false,
			})
		: null;

	const [rows, repositoryCount, lastSyncedAt] = await Promise.all([
		listProviderWorkspaceMemberRows(organizationId),
		getOrganizationRepositoryCount(organizationId),
		getLatestProviderMemberSyncAt(organizationId),
	]);
	const registeredUserIds = [
		...new Set(
			rows
				.map((row) => row.userId)
				.filter((value): value is string => typeof value === "string"),
		),
	];
	const accessCounts = await getRepositoryAccessCounts({
		organizationId,
		userIds: registeredUserIds,
	});
	const members = rows.map((row) =>
		serializeTeamMemberRow({
			row,
			repositoryAccess: row.userId ? accessCounts.get(row.userId) : undefined,
		}),
	);

	return {
		members,
		summary: {
			totalProviderMembers: members.length,
			registeredMembers: members.filter((member) => member.registered).length,
			workspaceMembers: members.filter((member) => member.workspaceRole).length,
			repositoryCount,
		},
		lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
		sync,
	};
}

async function getTargetProviderMemberForUser({
	tx,
	organizationId,
	targetUserId,
}: {
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0];
	organizationId: string;
	targetUserId: string;
}) {
	const [row] = await tx
		.select({
			providerMember: dashboardSchema.providerWorkspaceMember,
			account: authSchema.account,
			member: authSchema.member,
		})
		.from(dashboardSchema.providerWorkspaceMember)
		.innerJoin(
			authSchema.account,
			and(
				eq(
					authSchema.account.providerId,
					dashboardSchema.providerWorkspaceMember.providerId,
				),
				eq(
					authSchema.account.accountId,
					dashboardSchema.providerWorkspaceMember.providerMemberId,
				),
				eq(authSchema.account.userId, targetUserId),
			),
		)
		.leftJoin(
			authSchema.member,
			and(
				eq(authSchema.member.userId, targetUserId),
				eq(authSchema.member.organizationId, organizationId),
			),
		)
		.where(
			eq(
				dashboardSchema.providerWorkspaceMember.organizationId,
				organizationId,
			),
		)
		.limit(1);

	return row ?? null;
}

async function ensureAnotherWorkspaceOwner({
	tx,
	organizationId,
	targetUserId,
}: {
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0];
	organizationId: string;
	targetUserId: string;
}) {
	const [row] = await tx
		.select({ total: count() })
		.from(authSchema.member)
		.where(
			and(
				eq(authSchema.member.organizationId, organizationId),
				eq(authSchema.member.role, "owner"),
				ne(authSchema.member.userId, targetUserId),
			),
		)
		.limit(1);

	if (Number(row?.total ?? 0) === 0) {
		throw new Error("At least one workspace owner must remain.");
	}
}

async function listOrganizationRepositoryIds({
	tx,
	organizationId,
}: {
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0];
	organizationId: string;
}) {
	const rows = await tx
		.select({ id: dashboardSchema.repository.id })
		.from(dashboardSchema.repository)
		.where(eq(dashboardSchema.repository.organizationId, organizationId));

	return rows.map((row) => row.id);
}

export async function updateWorkspaceTeamMemberAccess({
	actorUserId,
	organizationId,
	targetUserId,
	workspaceRole,
	repositoryAccessEnabled,
}: {
	actorUserId: string;
	organizationId: string;
	targetUserId: string;
	workspaceRole?: WorkspaceRoleUpdate;
	repositoryAccessEnabled?: boolean;
}) {
	if (
		workspaceRole &&
		!toWorkspaceRole(workspaceRole) &&
		workspaceRole !== "none"
	) {
		throw new Error("Unsupported workspace role.");
	}

	if (workspaceRole && actorUserId === targetUserId) {
		throw new Error(
			"Use another owner account to change your own workspace role.",
		);
	}

	await runTransactionWithRetry(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtext(${`team-access:${organizationId}`}))`,
		);

		const target = await getTargetProviderMemberForUser({
			tx,
			organizationId,
			targetUserId,
		});

		if (!target) {
			throw new Error("This provider member is not registered in GitPal.");
		}

		const currentRole = target.member?.role ?? null;

		if (currentRole === "owner" && workspaceRole && workspaceRole !== "owner") {
			await ensureAnotherWorkspaceOwner({
				tx,
				organizationId,
				targetUserId,
			});
		}

		if (workspaceRole === "none") {
			await tx
				.delete(authSchema.member)
				.where(
					and(
						eq(authSchema.member.userId, targetUserId),
						eq(authSchema.member.organizationId, organizationId),
					),
				);

			const repositoryIds = await listOrganizationRepositoryIds({
				tx,
				organizationId,
			});

			if (repositoryIds.length > 0) {
				await tx
					.delete(dashboardSchema.repositoryAccess)
					.where(
						and(
							eq(dashboardSchema.repositoryAccess.userId, targetUserId),
							inArray(
								dashboardSchema.repositoryAccess.repositoryId,
								repositoryIds,
							),
						),
					);
			}
		} else if (workspaceRole) {
			await tx
				.insert(authSchema.member)
				.values({
					id:
						target.member?.id ??
						getWorkspaceMemberId(targetUserId, organizationId),
					userId: targetUserId,
					organizationId,
					role: workspaceRole,
					createdAt: target.member?.createdAt ?? new Date(),
				})
				.onConflictDoUpdate({
					target: [authSchema.member.userId, authSchema.member.organizationId],
					set: {
						role: workspaceRole,
					},
				});
		}

		if (repositoryAccessEnabled !== undefined && workspaceRole !== "none") {
			const hasWorkspaceAccess =
				Boolean(target.member) || Boolean(workspaceRole);

			if (!hasWorkspaceAccess) {
				throw new Error(
					"Add this user to the workspace before changing repository access.",
				);
			}

			const repositoryIds = await listOrganizationRepositoryIds({
				tx,
				organizationId,
			});

			if (repositoryIds.length > 0 && repositoryAccessEnabled) {
				const now = new Date();
				await tx
					.insert(dashboardSchema.repositoryAccess)
					.values(
						repositoryIds.map((repositoryId) => ({
							id: getRepositoryAccessId(targetUserId, repositoryId),
							userId: targetUserId,
							repositoryId,
							role: "member",
							enabled: true,
							lastSeenAt: now,
							createdAt: now,
							updatedAt: now,
						})),
					)
					.onConflictDoUpdate({
						target: [
							dashboardSchema.repositoryAccess.userId,
							dashboardSchema.repositoryAccess.repositoryId,
						],
						set: {
							enabled: true,
							lastSeenAt: now,
							updatedAt: now,
						},
					});
			} else if (repositoryIds.length > 0) {
				await tx
					.update(dashboardSchema.repositoryAccess)
					.set({
						enabled: false,
						updatedAt: new Date(),
					})
					.where(
						and(
							eq(dashboardSchema.repositoryAccess.userId, targetUserId),
							inArray(
								dashboardSchema.repositoryAccess.repositoryId,
								repositoryIds,
							),
						),
					);
			}
		}
	});

	return listWorkspaceTeamMembersForUser({
		userId: actorUserId,
		organizationId,
		refresh: false,
	});
}
