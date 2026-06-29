import { runTransactionWithRetry } from "@gitpal/db";
import type { GitWorkspaceMember, GitWorkspaceRef } from "@gitpal/git";
import { createLogger } from "@gitpal/logger";
import {
	createRepositories,
	type ProviderWorkspaceMember,
	repositories,
} from "@gitpal/repositories";
import {
	createProviderAdapterForWorkspace,
	getAccountForProvider,
	getEnterpriseProviderMap,
} from "./git-provider-access";
import { recordAdminActionEvent } from "./observability";
import { readWorkspaceMetadata } from "./repository-sync";
import { stableId } from "./stable-id";

const log = createLogger("team-management");
const DEFAULT_TEAM_MEMBER_SYNC_TTL_MS = 10 * 60 * 1000;
const workspaceRoles = ["owner", "admin", "member"] as const;

export type WorkspaceRole = (typeof workspaceRoles)[number];
export type WorkspaceRoleUpdate = WorkspaceRole | "none";

type WorkspaceTeamMemberRow = {
	providerMember: ProviderWorkspaceMember;
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
	const organization = await repositories.organization.findById(organizationId);

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
	return repositories.providerWorkspaceMember.getLatestSyncAt(organizationId);
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
		const txRepos = createRepositories(tx);
		await txRepos.providerWorkspaceMember.acquireAdvisoryLock(organizationId);

		for (const member of members) {
			await txRepos.providerWorkspaceMember.upsert({
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
			});
		}

		await txRepos.providerWorkspaceMember.deleteStale(
			organizationId,
			providerId,
			seenProviderMemberIds,
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
		// Team-member sync reuses the same workspace-scoped provider adapter that
		// repository sync uses. GitHub workspaces resolve to the matching App
		// installation; GitLab and enterprise workspaces use the connected OAuth
		// account for the provider that owns the workspace.
		const adapter = await createProviderAdapterForWorkspace({
			account,
			provider: enterpriseProviders.get(
				metadata.providerId.replace("enterprise-git:", ""),
			),
			workspace: toGitWorkspaceRef(metadata),
		});

		if (!adapter) {
			return {
				synced: false,
				skipped: true,
				count: 0,
				lastSyncedAt: latestSyncAt?.toISOString() ?? null,
				error:
					"No provider adapter is available for this workspace; team-member sync is disabled until the connected installation or account can be resolved.",
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
	return repositories.providerWorkspaceMember.listWorkspaceMembersWithUserInfo(
		organizationId,
	);
}

async function getRepositoryAccessCounts({
	organizationId,
	userIds,
}: {
	organizationId: string;
	userIds: string[];
}) {
	return repositories.repositoryAccess.getRepositoryAccessCounts({
		organizationId,
		userIds,
	});
}

async function getOrganizationRepositoryCount(organizationId: string) {
	return repositories.repository.getOrganizationRepositoryCount(organizationId);
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
		const txRepos = createRepositories(tx);
		await txRepos.member.acquireTeamAccessLock(organizationId);

		const target =
			await txRepos.providerWorkspaceMember.getTargetProviderMember(
				organizationId,
				targetUserId,
			);

		if (!target) {
			throw new Error("This provider member is not registered in GitPal.");
		}

		const currentRole = target.member?.role ?? null;
		const targetLabel =
			target.providerMember.login ?? target.providerMember.name ?? targetUserId;

		if (currentRole === "owner" && workspaceRole && workspaceRole !== "owner") {
			const otherOwnersCount = await txRepos.member.countOtherOwners(
				organizationId,
				targetUserId,
			);
			if (otherOwnersCount === 0) {
				throw new Error("At least one workspace owner must remain.");
			}
		}

		const nextRole =
			workspaceRole === undefined
				? currentRole
				: workspaceRole === "none"
					? null
					: workspaceRole;

		if (workspaceRole === "none") {
			await txRepos.member.deleteMembership(targetUserId, organizationId);

			const repositoryIds =
				await txRepos.repository.listOrganizationRepositoryIds(organizationId);

			if (repositoryIds.length > 0) {
				await txRepos.repositoryAccess.deleteByUserAndRepositories(
					targetUserId,
					repositoryIds,
				);
			}
		} else if (workspaceRole) {
			await txRepos.member.upsert({
				id:
					target.member?.id ??
					getWorkspaceMemberId(targetUserId, organizationId),
				userId: targetUserId,
				organizationId,
				role: workspaceRole,
				createdAt: target.member?.createdAt ?? new Date(),
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

			const repositoryIds =
				await txRepos.repository.listOrganizationRepositoryIds(organizationId);

			if (repositoryIds.length > 0 && repositoryAccessEnabled) {
				const now = new Date();
				await txRepos.repositoryAccess.bulkUpsertAccess(
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
				);
			} else if (repositoryIds.length > 0) {
				await txRepos.repositoryAccess.disableAccessForUserAndRepositories(
					targetUserId,
					repositoryIds,
				);
			}
		}

		const actionStatus =
			workspaceRole === "none"
				? "removed"
				: repositoryAccessEnabled === true
					? "granted"
					: repositoryAccessEnabled === false
						? "revoked"
						: "updated";
		const severity =
			actionStatus === "removed" || actionStatus === "revoked"
				? "warning"
				: "success";
		const bodyParts = [
			workspaceRole === "none"
				? `${targetLabel} was removed from the workspace.`
				: workspaceRole
					? `${targetLabel} now has ${workspaceRole} workspace access.`
					: null,
			repositoryAccessEnabled === undefined
				? null
				: repositoryAccessEnabled
					? `${targetLabel} now has repository access.`
					: `${targetLabel} no longer has repository access.`,
		].filter((part): part is string => Boolean(part));

		await recordAdminActionEvent(
			{
				userId: actorUserId,
				organizationId,
				action: "update-member-access",
				status: actionStatus,
				title:
					workspaceRole === "none"
						? "Workspace member removed"
						: "Workspace member access updated",
				body: bodyParts.join(" "),
				sourceType: "workspace-member",
				sourceId: targetUserId,
				severity,
				metadata: {
					targetUserId,
					targetProviderMemberId: target.providerMember.providerMemberId,
					targetLogin: target.providerMember.login,
					targetName: target.providerMember.name,
					previousRole: currentRole,
					nextRole,
					repositoryAccessEnabled,
				},
			},
			tx,
		);
	});

	return listWorkspaceTeamMembersForUser({
		userId: actorUserId,
		organizationId,
		refresh: false,
	});
}
