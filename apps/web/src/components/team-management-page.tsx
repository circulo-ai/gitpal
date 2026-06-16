"use client";

import * as React from "react";
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
import { cn } from "@gitpal/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
	Building2Icon,
	ExternalLinkIcon,
	FolderGit2Icon,
	RefreshCcwIcon,
	ShieldCheckIcon,
	Users2Icon,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { queryClient, trpc } from "@/utils/trpc";

function formatScope(scope: "personal" | "organization" | "group") {
	if (scope === "personal") {
		return "Personal";
	}

	if (scope === "group") {
		return "GitLab group";
	}

	return "GitHub organization";
}

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

export function TeamManagementPage() {
	const activeOrganizationQuery = authClient.useActiveOrganization();
	const activeOrganization = activeOrganizationQuery.data;
	const workspacesQuery = useQuery(trpc.repositories.workspaces.queryOptions());
	const providersQuery = useQuery(trpc.repositories.providers.queryOptions());
	const syncMutation = useMutation(
		trpc.repositories.sync.mutationOptions({
			onSuccess: async (result) => {
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.repositories.workspaces.queryKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.repositories.providers.queryKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.repositories.list.queryKey({
							organizationId: activeOrganization?.id,
						}),
					}),
				]);

				if (!activeOrganization && result.workspaceIds[0]) {
					await authClient.organization.setActive({
						organizationId: result.workspaceIds[0],
					});
				}

				toast.success("Workspace sync completed.");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const workspaces = workspacesQuery.data ?? [];
	const providers = providersQuery.data ?? [];
	const buckets = getScopeBuckets(workspaces);
	const activeWorkspace =
		workspaces.find((workspace) => workspace.id === activeOrganization?.id) ?? null;

	return (
		<main className="flex flex-col gap-6">
			<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
				<div className="space-y-1">
					<h1 className="font-heading text-2xl font-medium tracking-tight md:text-3xl">
						Workspaces
					</h1>
					<p className="max-w-3xl text-muted-foreground text-sm">
						GitPal mirrors the repository access granted by your Git providers.
						Personal repos and organization or group repos are synced automatically.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						variant="outline"
						disabled={syncMutation.isPending}
						onClick={() => syncMutation.mutate()}
					>
						<RefreshCcwIcon />
						{syncMutation.isPending ? "Syncing..." : "Sync workspaces"}
					</Button>
				</div>
			</div>

			<div className="grid gap-3 md:grid-cols-3">
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
			</div>

			<div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
				<Card>
					<CardHeader>
						<CardTitle>Synced workspaces</CardTitle>
						<CardDescription>
							Switch between user-level repositories and organization or group scopes.
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
												const result =
													await authClient.organization.setActive({
														organizationId: workspace.id,
													});

												if (result.error) {
													toast.error(result.error.message);
													return;
												}

												toast.success(`Switched to ${workspace.name}.`);
												window.location.reload();
											}}
										>
											<div className="min-w-0 space-y-2">
												<div className="flex flex-wrap items-center gap-2">
													<div className="truncate font-medium text-base">
														{workspace.name}
													</div>
													<Badge
														variant={isActive ? "secondary" : "outline"}
													>
														{isActive ? "Active" : formatScope(workspace.scope)}
													</Badge>
													<Badge variant="outline">{workspace.providerName}</Badge>
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
												<Badge variant={isActive ? "secondary" : "outline"}>
													{isActive ? "Current" : "Open"}
												</Badge>
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
								Use your provider's app settings to widen or reduce repository access.
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
											directly to the app installation settings for repository access.
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
							<CardTitle>Workspace behavior</CardTitle>
							<CardDescription>
								Shared review defaults belong to the currently active workspace.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3">
							<div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
								<div className="font-medium text-sm">
									{activeWorkspace ? activeWorkspace.name : "No active workspace"}
								</div>
								<p className="mt-1 text-muted-foreground text-sm">
									{activeWorkspace
										? `Repository defaults and overrides are applied inside ${activeWorkspace.name}.`
										: "Pick a synced workspace to edit shared repository settings."}
								</p>
							</div>
							<Link
								href="/account/general"
								className={cn(buttonVariants({}), "inline-flex")}
							>
								<FolderGit2Icon />
								Open workspace defaults
							</Link>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>How this works</CardTitle>
						</CardHeader>
						<CardContent className="space-y-2 text-muted-foreground text-sm">
							<p>
								Personal repositories land in personal workspaces.
							</p>
							<p>
								GitHub organizations and GitLab groups land in shared workspaces.
							</p>
							<p>
								Removing repository access in the provider removes it from GitPal on the next sync.
							</p>
						</CardContent>
					</Card>
				</div>
			</div>
		</main>
	);
}
