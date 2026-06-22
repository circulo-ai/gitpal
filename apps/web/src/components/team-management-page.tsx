"use client";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@gitpal/ui/components/avatar";
import { Badge } from "@gitpal/ui/components/badge";
import { Button, buttonVariants } from "@gitpal/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@gitpal/ui/components/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@gitpal/ui/components/empty";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@gitpal/ui/components/select";
import { Skeleton } from "@gitpal/ui/components/skeleton";
import { Switch } from "@gitpal/ui/components/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@gitpal/ui/components/table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
	Building2Icon,
	ExternalLinkIcon,
	RefreshCcwIcon,
	ShieldCheckIcon,
	UserCheckIcon,
	UsersIcon,
} from "lucide-react";
import { toast } from "sonner";

import { queryClient, trpc } from "@/utils/trpc";
import { useActiveWorkspace } from "./active-workspace-provider";
import { ProviderSyncButton } from "./provider-sync-button";
import { invalidateRepositoryData } from "./repository-sync-helpers";
import { formatWorkspaceScope } from "./workspace-scope";

function getScopeBuckets(
	workspaces: Array<{
		scope: "personal" | "organization" | "group";
	}>,
) {
	return {
		personal: workspaces.filter((workspace) => workspace.scope === "personal"),
		shared: workspaces.filter((workspace) => workspace.scope !== "personal"),
	};
}

type WorkspaceRoleValue = "none" | "owner" | "admin" | "member";

type TeamMember = {
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

const workspaceRoleOptions = [
	{ value: "none", label: "No access" },
	{ value: "owner", label: "Owner" },
	{ value: "admin", label: "Admin" },
	{ value: "member", label: "Member" },
] as const;

function getInitials(name: string | null | undefined) {
	const value = name?.trim();
	if (!value) {
		return "GP";
	}

	return value
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("");
}

function roleLabel(value: string | null | undefined) {
	if (!value) {
		return "No access";
	}

	return value
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
		.join(" ");
}

function TeamMembersSkeleton() {
	return (
		<div className="space-y-3">
			{Array.from({ length: 5 }).map((_, index) => (
				<div
					key={index}
					className="flex items-center gap-4 rounded-lg border border-border/60 p-4"
				>
					<Skeleton className="size-10 rounded-full" />
					<div className="flex-1 space-y-2">
						<Skeleton className="h-4 w-48" />
						<Skeleton className="h-3 w-64" />
					</div>
					<Skeleton className="h-9 w-32" />
				</div>
			))}
		</div>
	);
}

export function TeamManagementPage() {
	const { activeWorkspace, activeWorkspaceId, switchWorkspace, workspaces } =
		useActiveWorkspace();
	const providersQuery = useQuery(trpc.repositories.providers.queryOptions());
	const teamMembersQuery = useQuery({
		...trpc.teamManagement.members.queryOptions({
			organizationId: activeWorkspaceId ?? undefined,
		}),
		enabled: Boolean(activeWorkspaceId),
	});
	const syncMutation = useMutation(
		trpc.repositories.sync.mutationOptions({
			onSuccess: async (result) => {
				await invalidateRepositoryData(activeWorkspaceId);

				if (result.queued) {
					toast.success(
						"Provider sync queued. Repository data will refresh shortly.",
					);
					return;
				}

				toast.error(
					result.error
						? `Provider sync could not be queued: ${result.error}`
						: "Provider sync could not be queued.",
				);
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);
	const syncMembersMutation = useMutation(
		trpc.teamManagement.syncMembers.mutationOptions({
			onSuccess: async (result) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.teamManagement.members.queryKey(),
				});

				if (result.error) {
					toast.warning(`Team sync finished with a warning: ${result.error}`);
					return;
				}

				toast.success(`Synced ${result.count} provider members.`);
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);
	const updateMemberMutation = useMutation(
		trpc.teamManagement.updateMember.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.teamManagement.members.queryKey(),
				});
				toast.success("Team member access updated.");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const providers = providersQuery.data ?? [];
	const buckets = getScopeBuckets(workspaces);
	const teamData = teamMembersQuery.data;
	const teamMembers = (teamData?.members ?? []) as TeamMember[];
	const teamPermissions = teamData?.permissions ?? {
		canManageMembers: false,
		canManageRepositoryAccess: false,
		canSyncMembers: false,
	};
	const repositoryCount = teamData?.summary.repositoryCount ?? 0;

	return (
		<main className="flex flex-col gap-6">
			<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
				<div className="space-y-1">
					<h1 className="font-heading font-medium text-2xl tracking-tight md:text-3xl">
						Workspaces
					</h1>
					<p className="max-w-3xl text-muted-foreground text-sm">
						GitPal mirrors the repository access granted by your Git providers.
						Personal repos and organization or group repos are synced
						automatically, and provider member sync runs in the background.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<ProviderSyncButton
						target={activeWorkspace}
						isPending={syncMutation.isPending}
						onClick={() => {
							if (!activeWorkspace) {
								return;
							}

							syncMutation.mutate({
								organizationId: activeWorkspaceId ?? undefined,
								providerId: activeWorkspace.providerId,
							});
						}}
					/>
				</div>
			</div>

			<div className="grid gap-3 md:grid-cols-4">
				<Card size="sm">
					<CardHeader>
						<CardDescription>Total workspaces</CardDescription>
						<CardTitle className="text-3xl tabular-nums">
							{workspaces.length}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card size="sm">
					<CardHeader>
						<CardDescription>Personal scopes</CardDescription>
						<CardTitle className="text-3xl tabular-nums">
							{buckets.personal.length}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card size="sm">
					<CardHeader>
						<CardDescription>Shared scopes</CardDescription>
						<CardTitle className="text-3xl tabular-nums">
							{buckets.shared.length}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card size="sm">
					<CardHeader>
						<CardDescription>Registered members</CardDescription>
						<CardTitle className="text-3xl tabular-nums">
							{teamData?.summary.registeredMembers ?? 0}
						</CardTitle>
					</CardHeader>
				</Card>
			</div>

			<Card>
				<CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
					<div className="space-y-1">
						<CardTitle>Team members</CardTitle>
						<CardDescription>
							Provider members synced from{" "}
							{activeWorkspace?.providerName ?? "your Git provider"}. Registered
							users can be granted GitPal workspace and repository access.
						</CardDescription>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{teamData?.lastSyncedAt ? (
							<Badge variant="outline">
								Synced{" "}
								{formatDistanceToNow(new Date(teamData.lastSyncedAt), {
									addSuffix: true,
								})}
							</Badge>
						) : null}
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={
								!activeWorkspaceId ||
								!teamPermissions.canSyncMembers ||
								syncMembersMutation.isPending
							}
							onClick={() => {
								if (!activeWorkspaceId) {
									return;
								}

								syncMembersMutation.mutate({
									organizationId: activeWorkspaceId,
								});
							}}
						>
							<RefreshCcwIcon data-icon="inline-start" />
							Sync members
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					{teamData?.sync?.error ? (
						<div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-700 text-sm dark:text-amber-300">
							{teamData.sync.error}
						</div>
					) : null}

					{!activeWorkspaceId ? (
						<>
							<Empty className="min-h-64">
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<UsersIcon />
									</EmptyMedia>
									<EmptyTitle>Select a workspace</EmptyTitle>
									<EmptyDescription>
										Choose a synced workspace to view provider members and
										manage GitPal access.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						</>
					) : teamMembersQuery.isLoading ? (
						<TeamMembersSkeleton />
					) : teamMembers.length === 0 ? (
						<Empty className="min-h-64">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<UserCheckIcon />
								</EmptyMedia>
								<EmptyTitle>No provider members synced</EmptyTitle>
								<EmptyDescription>
									Sync members from the provider, or check that the connected
									provider account can read organization or group membership.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Member</TableHead>
										<TableHead>Provider role</TableHead>
										<TableHead>GitPal status</TableHead>
										<TableHead>Workspace role</TableHead>
										<TableHead>Repository access</TableHead>
										<TableHead>Last synced</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{teamMembers.map((member) => {
										const displayName =
											member.registeredUser?.name ??
											member.name ??
											member.login ??
											"Provider member";
										const targetUserId = member.registeredUser?.id;
										const repositoryAccessChecked =
											member.repositoryAccessEnabled > 0;
										const canManageRepositoryAccess =
											Boolean(targetUserId) &&
											Boolean(member.workspaceRole) &&
											teamPermissions.canManageRepositoryAccess &&
											repositoryCount > 0;

										return (
											<TableRow key={member.id}>
												<TableCell className="min-w-64">
													<div className="flex items-center gap-3">
														<Avatar className="size-10">
															<AvatarImage
																src={
																	member.registeredUser?.image ??
																	member.avatarUrl ??
																	undefined
																}
																alt={displayName}
															/>
															<AvatarFallback>
																{getInitials(displayName)}
															</AvatarFallback>
														</Avatar>
														<div className="min-w-0">
															<div className="truncate font-medium">
																{displayName}
															</div>
															<div className="truncate text-muted-foreground text-sm">
																{member.login
																	? `@${member.login}`
																	: (member.email ?? member.providerMemberId)}
															</div>
														</div>
														{member.htmlUrl ? (
															<a
																href={member.htmlUrl}
																target="_blank"
																rel="noreferrer noopener"
																aria-label={`Open ${displayName} in provider`}
																className={buttonVariants({
																	variant: "ghost",
																	size: "icon-sm",
																})}
															>
																<ExternalLinkIcon />
															</a>
														) : null}
													</div>
												</TableCell>
												<TableCell>
													<Badge variant="outline">
														{roleLabel(member.providerRole)}
													</Badge>
												</TableCell>
												<TableCell>
													<Badge
														variant={
															member.registered ? "secondary" : "outline"
														}
													>
														{member.registered
															? "Registered"
															: "Not registered"}
													</Badge>
												</TableCell>
												<TableCell className="min-w-40">
													<Select
														items={workspaceRoleOptions}
														value={
															(member.workspaceRole as WorkspaceRoleValue | null) ??
															"none"
														}
														onValueChange={(value) => {
															if (!targetUserId || !activeWorkspaceId) {
																return;
															}

															updateMemberMutation.mutate({
																organizationId: activeWorkspaceId,
																targetUserId,
																workspaceRole: value as WorkspaceRoleValue,
															});
														}}
													>
														<SelectTrigger
															className="w-36"
															disabled={
																!targetUserId ||
																!teamPermissions.canManageMembers ||
																updateMemberMutation.isPending
															}
														>
															<SelectValue placeholder="Role" />
														</SelectTrigger>
														<SelectContent>
															{workspaceRoleOptions.map((option) => (
																<SelectItem
																	key={option.value}
																	value={option.value}
																>
																	{option.label}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</TableCell>
												<TableCell className="min-w-48">
													<div className="flex items-center gap-3">
														<Switch
															checked={repositoryAccessChecked}
															disabled={
																!canManageRepositoryAccess ||
																updateMemberMutation.isPending
															}
															onCheckedChange={(enabled) => {
																if (!targetUserId || !activeWorkspaceId) {
																	return;
																}

																updateMemberMutation.mutate({
																	organizationId: activeWorkspaceId,
																	targetUserId,
																	repositoryAccessEnabled: enabled,
																});
															}}
															aria-label={`Toggle repository access for ${displayName}`}
														/>
														<span className="text-muted-foreground text-sm">
															{member.repositoryAccessEnabled}/{repositoryCount}
														</span>
													</div>
												</TableCell>
												<TableCell className="text-muted-foreground text-sm">
													{formatDistanceToNow(new Date(member.lastSyncedAt), {
														addSuffix: true,
													})}
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

			<div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
				<Card>
					<CardHeader>
						<CardTitle>Workspaces</CardTitle>
						<CardDescription>
							Switch between user-level repositories and organization or group
							scopes.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{workspaces.length === 0 ? (
							<Empty className="min-h-72">
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<Building2Icon />
									</EmptyMedia>
									<EmptyTitle>No workspaces synced yet</EmptyTitle>
									<EmptyDescription>
										Connect GitHub or GitLab, then sync once to pull in the
										workspaces your installed app can access.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						) : (
							<div className="space-y-3">
								{workspaces.map((workspace) => {
									const isActive = workspace.id === activeWorkspace?.id;

									return (
										<button
											key={workspace.id}
											type="button"
											className="flex w-full items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card/70 px-4 py-4 text-left transition-colors hover:bg-muted/30"
											onClick={async () => {
												const result = await switchWorkspace(workspace.id);

												if (result.error) {
													toast.error(result.error);
													return;
												}

												toast.success(`Switched to ${workspace.name}.`);
											}}
										>
											<div className="min-w-0 space-y-2">
												<div className="flex flex-wrap items-center gap-2">
													<div className="truncate font-medium text-base">
														{workspace.name}
													</div>
													<Badge variant={isActive ? "secondary" : "outline"}>
														{isActive
															? "Active"
															: formatWorkspaceScope(workspace.scope)}
													</Badge>
													<Badge variant="outline">
														{workspace.providerName}
													</Badge>
												</div>
												<div className="flex flex-wrap items-center gap-3 text-muted-foreground text-sm">
													<span>{workspace.ownerPath}</span>
													<span>{workspace.repositoryCount} repos</span>
													<span>{workspace.role} access</span>
												</div>
											</div>
											<div className="flex shrink-0 items-center gap-2">
												{workspace.ownerHtmlUrl ? (
													<a
														href={workspace.ownerHtmlUrl}
														target="_blank"
														rel="noreferrer noopener"
														aria-label={`Open ${workspace.name} in ${workspace.providerName}`}
														className={buttonVariants({
															variant: "ghost",
															size: "icon-sm",
														})}
													>
														<ExternalLinkIcon />
													</a>
												) : null}
												{isActive && (
													<Badge variant={"secondary"}>Current</Badge>
												)}
											</div>
										</button>
									);
								})}
							</div>
						)}
					</CardContent>
				</Card>

				<div className="space-y-6">
					<Card>
						<CardHeader>
							<CardTitle>Provider access</CardTitle>
							<CardDescription>
								Use your provider's app settings to widen or reduce repository
								access.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3">
							{providers.length === 0 ? (
								<Empty className="min-h-48">
									<EmptyHeader>
										<EmptyMedia variant="icon">
											<ShieldCheckIcon />
										</EmptyMedia>
										<EmptyTitle>No Git provider connected</EmptyTitle>
										<EmptyDescription>
											Connect GitHub or GitLab first, then this page will link
											directly to the app installation settings for repository
											access.
										</EmptyDescription>
									</EmptyHeader>
								</Empty>
							) : (
								providers.map((provider) => (
									<div
										key={provider.providerId}
										className="rounded-2xl border border-border/60 bg-muted/20 p-4"
									>
										<div className="flex items-center justify-between gap-3">
											<div className="space-y-1">
												<div className="font-medium">{provider.label}</div>
												<div className="text-muted-foreground text-sm">
													{provider.type} access and sync scope
												</div>
											</div>
											{provider.settingsUrl ? (
												<a
													href={provider.settingsUrl}
													target="_blank"
													rel="noreferrer noopener"
													className={buttonVariants({ variant: "outline" })}
												>
													<ExternalLinkIcon />
													Manage access
												</a>
											) : (
												<Badge variant="outline">No settings link</Badge>
											)}
										</div>
									</div>
								))
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>How this works</CardTitle>
						</CardHeader>
						<CardContent className="space-y-2 text-muted-foreground text-sm">
							<p>Personal repositories land in personal workspaces.</p>
							<p>
								GitHub organizations and GitLab groups land in shared
								workspaces.
							</p>
							<p>
								Removing repository access in the provider removes it from
								GitPal on the next sync.
							</p>
						</CardContent>
					</Card>
				</div>
			</div>
		</main>
	);
}
