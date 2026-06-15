"use client";

import * as React from "react";
import { Badge } from "@gitpal/ui/components/badge";
import { Button } from "@gitpal/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@gitpal/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@gitpal/ui/components/empty";
import { Input } from "@gitpal/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@gitpal/ui/components/select";
import { Separator } from "@gitpal/ui/components/separator";
import { Textarea } from "@gitpal/ui/components/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@gitpal/ui/components/table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/utils/trpc";
import {
	workspaceRoleLabels,
	workspaceStatements,
} from "@gitpal/auth/organization-access";

const NONE_TEAM_VALUE = "__none__";

type PermissionMap = Record<string, readonly string[]>;

type OrganizationMember = {
	id: string;
	userId: string;
	role: string;
	teamId?: string | null;
	user?: {
		name?: string | null;
		email?: string | null;
		image?: string | null;
	} | null;
};

type OrganizationTeam = {
	id: string;
	name: string;
};

type OrganizationRole = {
	id: string;
	role: string;
	permission: PermissionMap;
};

function getErrorMessage(error: unknown, fallback: string) {
	if (typeof error === "string") {
		return error;
	}

	if (error && typeof error === "object" && "message" in error) {
		const message = (error as { message?: unknown }).message;

		if (typeof message === "string" && message.trim()) {
			return message;
		}
	}

	return fallback;
}

function stringifyPermissions(value: PermissionMap) {
	return JSON.stringify(value, null, 2);
}

function parsePermissions(value: string) {
	return JSON.parse(value) as Record<string, string[]>;
}

export function TeamManagementPage() {
	const activeOrganizationQuery = authClient.useActiveOrganization();
	const activeOrganization = activeOrganizationQuery.data;
	const organizationId = activeOrganization?.id ?? "";
	const [inviteEmail, setInviteEmail] = React.useState("");
	const [inviteRole, setInviteRole] = React.useState("member");
	const [inviteTeamId, setInviteTeamId] = React.useState<string>(NONE_TEAM_VALUE);
	const [teamName, setTeamName] = React.useState("");
	const [customRoleName, setCustomRoleName] = React.useState("");
	const [customRolePermissions, setCustomRolePermissions] = React.useState(
		stringifyPermissions(workspaceStatements),
	);
	const [editingRoleId, setEditingRoleId] = React.useState<string | null>(null);

	const membersQuery = useQuery<OrganizationMember[]>({
		queryKey: ["organization-members", activeOrganization?.id],
		enabled: Boolean(activeOrganization),
		queryFn: async () => {
			const organizationId = activeOrganization?.id;

			if (!organizationId) {
				return [];
			}

			const result = await authClient.organization.listMembers({
				query: { organizationId },
			});

			if (result.error) {
				throw new Error(
					getErrorMessage(result.error, "Unable to load organization members."),
				);
			}

			return (result.data?.members ?? []) as OrganizationMember[];
		},
	});

	const teamsQuery = useQuery<OrganizationTeam[]>({
		queryKey: ["organization-teams", activeOrganization?.id],
		enabled: Boolean(activeOrganization),
		queryFn: async () => {
			const organizationId = activeOrganization?.id;

			if (!organizationId) {
				return [];
			}

			const result = await authClient.organization.listTeams({
				query: { organizationId },
			});

			if (result.error) {
				throw new Error(
					getErrorMessage(result.error, "Unable to load organization teams."),
				);
			}

			return (result.data ?? []) as OrganizationTeam[];
		},
	});

	const rolesQuery = useQuery<OrganizationRole[]>({
		queryKey: ["organization-roles", activeOrganization?.id],
		enabled: Boolean(activeOrganization),
		queryFn: async () => {
			const organizationId = activeOrganization?.id;

			if (!organizationId) {
				return [];
			}

			const result = await authClient.organization.listRoles({
				query: { organizationId },
			});

			if (result.error) {
				throw new Error(
					getErrorMessage(result.error, "Unable to load organization roles."),
				);
			}

			return (result.data ?? []) as OrganizationRole[];
		},
	});

	const builtInRoleOptions = Object.entries(workspaceRoleLabels).map(
		([role, label]) => ({
			role,
			label,
		}),
	);

	const roleOptions = [
		...builtInRoleOptions,
		...(rolesQuery.data ?? []).map((role) => ({
			role: role.role,
			label: role.role,
		})),
	];

	const inviteMutation = useMutation({
		mutationFn: async () => {
			const result = await authClient.organization.inviteMember({
				email: inviteEmail.trim(),
				role: inviteRole,
				organizationId,
				teamId: inviteTeamId === NONE_TEAM_VALUE ? undefined : inviteTeamId,
			});

			if (result.error) {
				throw new Error(
					getErrorMessage(result.error, "Unable to send the invitation."),
				);
			}

			return result.data;
		},
		onSuccess: async () => {
			setInviteEmail("");
			toast.success("Invitation sent.");
			await queryClient.invalidateQueries({
				queryKey: ["organization-members", activeOrganization?.id],
			});
		},
	});

	const createTeamMutation = useMutation({
		mutationFn: async () => {
			const result = await authClient.organization.createTeam({
				name: teamName.trim(),
				organizationId,
			});

			if (result.error) {
				throw new Error(getErrorMessage(result.error, "Unable to create team."));
			}

			return result.data;
		},
		onSuccess: async () => {
			setTeamName("");
			toast.success("Team created.");
			await queryClient.invalidateQueries({
				queryKey: ["organization-teams", activeOrganization?.id],
			});
		},
	});

	const updateMemberRoleMutation = useMutation({
		mutationFn: async (input: { memberId: string; role: string }) => {
			const result = await authClient.organization.updateMemberRole({
				memberId: input.memberId,
				role: input.role,
				organizationId,
			});

			if (result.error) {
				throw new Error(
					getErrorMessage(result.error, "Unable to update member role."),
				);
			}

			return result.data;
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["organization-members", activeOrganization?.id],
			});
		},
	});

	const removeMemberMutation = useMutation({
		mutationFn: async (memberIdOrEmail: string) => {
			const result = await authClient.organization.removeMember({
				memberIdOrEmail,
				organizationId,
			});

			if (result.error) {
				throw new Error(
					getErrorMessage(result.error, "Unable to remove member."),
				);
			}

			return result.data;
		},
		onSuccess: async () => {
			toast.success("Member removed.");
			await queryClient.invalidateQueries({
				queryKey: ["organization-members", activeOrganization?.id],
			});
		},
	});

	const addTeamMemberMutation = useMutation({
		mutationFn: async (input: { teamId: string; userId: string }) => {
			const result = await authClient.organization.addTeamMember({
				teamId: input.teamId,
				userId: input.userId,
				organizationId,
			});

			if (result.error) {
				throw new Error(
					getErrorMessage(result.error, "Unable to add team member."),
				);
			}

			return result.data;
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["organization-members", activeOrganization?.id],
			});
		},
	});

	const removeTeamMemberMutation = useMutation({
		mutationFn: async (input: { teamId: string; userId: string }) => {
			const result = await authClient.organization.removeTeamMember({
				teamId: input.teamId,
				userId: input.userId,
				organizationId,
			});

			if (result.error) {
				throw new Error(
					getErrorMessage(result.error, "Unable to remove team member."),
				);
			}

			return result.data;
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["organization-members", activeOrganization?.id],
			});
		},
	});

	const createRoleMutation = useMutation({
		mutationFn: async () => {
			const result = await authClient.organization.createRole({
				organizationId,
				role: customRoleName.trim().toLowerCase(),
				permission: parsePermissions(customRolePermissions),
			});

			if (result.error) {
				throw new Error(
					getErrorMessage(result.error, "Unable to create role."),
				);
			}

			return result.data;
		},
		onSuccess: async () => {
			setCustomRoleName("");
			setCustomRolePermissions(
				stringifyPermissions(workspaceStatements),
			);
			toast.success("Role created.");
			await queryClient.invalidateQueries({
				queryKey: ["organization-roles", activeOrganization?.id],
			});
		},
	});

	const updateRoleMutation = useMutation({
		mutationFn: async (input: { roleId: string }) => {
			const result = await authClient.organization.updateRole({
				organizationId,
				roleId: input.roleId,
				data: {
					roleName: customRoleName.trim().toLowerCase(),
					permission: parsePermissions(customRolePermissions),
				},
			});

			if (result.error) {
				throw new Error(
					getErrorMessage(result.error, "Unable to update role."),
				);
			}

			return result.data;
		},
		onSuccess: async () => {
			setEditingRoleId(null);
			toast.success("Role updated.");
			await queryClient.invalidateQueries({
				queryKey: ["organization-roles", activeOrganization?.id],
			});
		},
	});

	const deleteRoleMutation = useMutation({
		mutationFn: async (roleId: string) => {
			const result = await authClient.organization.deleteRole({
				organizationId,
				roleId,
			});

			if (result.error) {
				throw new Error(
					getErrorMessage(result.error, "Unable to delete role."),
				);
			}

			return result.data;
		},
		onSuccess: async () => {
			setEditingRoleId(null);
			toast.success("Role deleted.");
			await queryClient.invalidateQueries({
				queryKey: ["organization-roles", activeOrganization?.id],
			});
		},
	});

	const selectedCustomRole = (rolesQuery.data ?? []).find(
		(role) => role.id === editingRoleId,
	);

	React.useEffect(() => {
		if (selectedCustomRole) {
			setCustomRoleName(selectedCustomRole.role);
			setCustomRolePermissions(stringifyPermissions(selectedCustomRole.permission));
		}
	}, [selectedCustomRole]);

	if (!activeOrganization) {
		return (
			<main className="flex min-h-0 flex-1 flex-col gap-6">
				<Card>
					<CardHeader>
						<CardTitle>Team management</CardTitle>
						<CardDescription>
							Select an organization before managing people, teams, or roles.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Empty className="min-h-64">
							<EmptyHeader>
								<EmptyTitle>No active organization</EmptyTitle>
								<EmptyDescription>
									Use the account page to create or switch organizations first.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					</CardContent>
				</Card>
			</main>
		);
	}

	const members = membersQuery.data ?? [];
	const teams = teamsQuery.data ?? [];
	const customRoles = rolesQuery.data ?? [];

	return (
		<main className="flex min-h-0 flex-1 flex-col gap-6">
			<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
				<div className="space-y-1">
					<h1 className="font-heading text-2xl font-medium tracking-tight md:text-3xl">
						Team Management
					</h1>
					<p className="max-w-3xl text-muted-foreground text-sm">
						Invite users, change roles, create teams, and manage custom
						permissions from a single organization-scoped screen.
					</p>
				</div>
				<Badge variant="outline">{activeOrganization.name}</Badge>
			</div>

			<div className="grid gap-6 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
				<Card>
					<CardHeader>
						<CardTitle>Invite users</CardTitle>
						<CardDescription>
							Send invitations with an initial role and optional team.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<div className="font-medium text-sm">Email</div>
							<Input
								value={inviteEmail}
								onChange={(event) => setInviteEmail(event.target.value)}
								placeholder="user@example.com"
							/>
						</div>
						<div className="space-y-2">
							<div className="font-medium text-sm">Role</div>
							<Select
								value={inviteRole}
								onValueChange={(role) => setInviteRole(role ?? "member")}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select role" />
								</SelectTrigger>
								<SelectContent>
									{roleOptions.map((role) => (
										<SelectItem key={role.role} value={role.role}>
											{role.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<div className="font-medium text-sm">Team</div>
							<Select
								value={inviteTeamId}
								onValueChange={(teamId) =>
									setInviteTeamId(teamId ?? NONE_TEAM_VALUE)
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Optional team" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NONE_TEAM_VALUE}>No team</SelectItem>
									{teams.map((team) => (
										<SelectItem key={team.id} value={team.id}>
											{team.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<Button
							type="button"
							disabled={inviteMutation.isPending || !inviteEmail.trim()}
							onClick={() => {
								inviteMutation.mutate();
							}}
						>
							<PlusIcon />
							{inviteMutation.isPending ? "Inviting..." : "Invite member"}
						</Button>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Members</CardTitle>
						<CardDescription>
							Edit member roles and team assignments with the Better Auth org
							API.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{members.length === 0 ? (
							<Empty className="min-h-64">
								<EmptyHeader>
									<EmptyTitle>No members yet</EmptyTitle>
									<EmptyDescription>
										Invite someone to the organization to get started.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						) : (
							<div className="overflow-hidden rounded-2xl border border-border/60">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>User</TableHead>
											<TableHead>Role</TableHead>
											<TableHead>Team</TableHead>
											<TableHead className="text-right">Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{members.map((member) => {
											const teamId = member.teamId ?? "";
											const teamLabel =
												teams.find((team) => team.id === teamId)?.name ??
												"No team";

											return (
												<TableRow key={member.id}>
													<TableCell>
														<div className="space-y-1">
															<div className="font-medium">
																{member.user?.name ?? member.userId}
															</div>
															<div className="text-muted-foreground text-xs">
																{member.user?.email ?? member.userId}
															</div>
														</div>
													</TableCell>
											<TableCell>
														<Select
															value={member.role}
															onValueChange={(role) => {
																if (!role) {
																	return;
																}

																updateMemberRoleMutation.mutate({
																	memberId: member.id,
																	role,
																});
															}}
														>
															<SelectTrigger className="w-40">
																<SelectValue placeholder="Role" />
															</SelectTrigger>
															<SelectContent>
																{roleOptions.map((role) => (
																	<SelectItem
																		key={role.role}
																		value={role.role}
																	>
																		{role.label}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
													</TableCell>
													<TableCell>
														<Select
															value={teamId || NONE_TEAM_VALUE}
															onValueChange={(nextTeamId) => {
																const resolvedNextTeamId =
																	(nextTeamId ?? NONE_TEAM_VALUE) ===
																	NONE_TEAM_VALUE
																		? ""
																		: nextTeamId ?? "";

																if (teamId && resolvedNextTeamId !== teamId) {
																	removeTeamMemberMutation.mutate({
																		teamId,
																		userId: member.userId,
																	});
																}

																if (resolvedNextTeamId) {
																	addTeamMemberMutation.mutate({
																		teamId: resolvedNextTeamId,
																		userId: member.userId,
																	});
																}
															}}
														>
															<SelectTrigger className="w-40">
																<SelectValue placeholder="Team" />
															</SelectTrigger>
															<SelectContent>
																<SelectItem value={NONE_TEAM_VALUE}>
																	No team
																</SelectItem>
																{teams.map((team) => (
																	<SelectItem key={team.id} value={team.id}>
																		{team.name}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
														<div className="mt-2 text-muted-foreground text-xs">
															{teamLabel}
														</div>
													</TableCell>
													<TableCell className="text-right">
														<Button
															type="button"
															variant="ghost"
															size="icon"
															disabled={removeMemberMutation.isPending}
															onClick={() => {
																removeMemberMutation.mutate(member.id);
															}}
															aria-label={`Remove ${member.user?.name ?? member.userId}`}
														>
															<Trash2Icon />
														</Button>
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-6 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
				<Card>
					<CardHeader>
						<CardTitle>Create team</CardTitle>
						<CardDescription>
							Teams help group members and set the active team for the session.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<div className="font-medium text-sm">Team name</div>
							<Input
								value={teamName}
								onChange={(event) => setTeamName(event.target.value)}
								placeholder="Platform"
							/>
						</div>
						<Button
							type="button"
							disabled={createTeamMutation.isPending || !teamName.trim()}
							onClick={() => {
								createTeamMutation.mutate();
							}}
						>
							{createTeamMutation.isPending ? "Creating..." : "Create team"}
						</Button>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Teams</CardTitle>
						<CardDescription>
							Manage teams and assign the active team for the organization.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{teams.length === 0 ? (
							<Empty className="min-h-48">
								<EmptyHeader>
									<EmptyTitle>No teams yet</EmptyTitle>
									<EmptyDescription>
										Create a team to group organization members.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						) : (
							<div className="space-y-3">
								{teams.map((team) => {
									const teamMemberCount = members.filter(
										(member) => member.teamId === team.id,
									).length;

									return (
										<div
											key={team.id}
											className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3"
										>
											<div className="space-y-1">
												<div className="font-medium">{team.name}</div>
												<div className="text-muted-foreground text-xs">
													{teamMemberCount} member
													{teamMemberCount === 1 ? "" : "s"}
												</div>
											</div>
											<Button
												type="button"
												variant="outline"
												onClick={async () => {
													const result = await authClient.organization.setActiveTeam(
														{ teamId: team.id },
													);

													if (result.error) {
														toast.error(
															getErrorMessage(
																result.error,
																"Unable to set the active team.",
															),
														);
														return;
													}

													toast.success(`Active team set to ${team.name}.`);
												}}
											>
												Set active
											</Button>
										</div>
									);
								})}
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Roles</CardTitle>
					<CardDescription>
						Create and manage custom access-control roles through Better Auth.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
						<div className="space-y-3">
							<div className="font-medium text-sm">Built-in roles</div>
							<div className="space-y-2">
								{builtInRoleOptions.map((role) => (
									<div
										key={role.role}
										className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3"
									>
										<div className="font-medium">{role.label}</div>
										<div className="text-muted-foreground text-xs">
											{role.role}
										</div>
									</div>
								))}
							</div>
						</div>

						<div className="space-y-4">
							<div className="flex items-center justify-between gap-3">
								<div>
									<div className="font-medium text-sm">Custom roles</div>
									<div className="text-muted-foreground text-sm">
										Define extra permissions with JSON statements.
									</div>
								</div>
										<Button
											type="button"
											variant="outline"
											onClick={() => {
												setEditingRoleId(null);
												setCustomRoleName("");
												setCustomRolePermissions(
													stringifyPermissions(workspaceStatements),
												);
											}}
										>
									New role
								</Button>
							</div>

							<div className="grid gap-4 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
								<div className="space-y-3">
									{customRoles.length === 0 ? (
										<div className="rounded-2xl border border-dashed border-border/60 px-4 py-8 text-center text-muted-foreground text-sm">
											No custom roles yet.
										</div>
									) : (
										customRoles.map((role) => (
											<button
												key={role.id}
												type="button"
												className="w-full rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-left transition-colors hover:bg-muted/40"
												onClick={() => setEditingRoleId(role.id)}
											>
												<div className="font-medium">{role.role}</div>
												<div className="text-muted-foreground text-xs">
													{Object.keys(role.permission).length} resources
												</div>
											</button>
										))
									)}
								</div>

								<div className="space-y-4 rounded-2xl border border-border/60 bg-muted/20 p-4">
									<div className="space-y-2">
										<div className="font-medium text-sm">Role name</div>
										<Input
											value={customRoleName}
											onChange={(event) => setCustomRoleName(event.target.value)}
											placeholder="reviewer"
										/>
									</div>
									<div className="space-y-2">
										<div className="font-medium text-sm">Permissions JSON</div>
										<Textarea
											value={customRolePermissions}
											onChange={(event) =>
												setCustomRolePermissions(event.target.value)
											}
											className="min-h-48 font-mono text-xs"
											placeholder='{"repository":["read"]}'
										/>
									</div>
									<div className="flex flex-wrap items-center gap-3">
										<Button
											type="button"
											disabled={
												(createRoleMutation.isPending && !editingRoleId) ||
												(updateRoleMutation.isPending && Boolean(editingRoleId))
											}
											onClick={() => {
												if (!customRoleName.trim()) {
													toast.error("Role name is required.");
													return;
												}

												try {
													parsePermissions(customRolePermissions);
												} catch {
													toast.error("Permissions JSON is invalid.");
													return;
												}

												if (editingRoleId) {
													updateRoleMutation.mutate({
														roleId: editingRoleId,
													});
													return;
												}

												createRoleMutation.mutate();
											}}
										>
											{editingRoleId ? "Update role" : "Create role"}
										</Button>
										{editingRoleId ? (
											<Button
												type="button"
												variant="destructive"
												disabled={deleteRoleMutation.isPending}
												onClick={() => {
													deleteRoleMutation.mutate(editingRoleId);
												}}
											>
												Delete role
											</Button>
										) : null}
									</div>
								</div>
							</div>
						</div>
					</div>

					<Separator />

					<div className="rounded-2xl border border-dashed border-border/60 px-4 py-4 text-muted-foreground text-sm">
						Permissions currently available:
						<div className="mt-2 font-mono text-xs">
							{Object.entries(workspaceStatements)
								.map(([resource, actions]) => `${resource}: ${actions.join(", ")}`)
								.join(" | ")}
						</div>
					</div>
				</CardContent>
			</Card>
		</main>
	);
}
