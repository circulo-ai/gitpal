"use client";

import { Badge } from "@gitpal/ui/components/badge";
import { buttonVariants } from "@gitpal/ui/components/button";
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
import { useQuery } from "@tanstack/react-query";
import {
	CreditCardIcon,
	KeyRoundIcon,
	Settings2Icon,
	Users2Icon,
} from "lucide-react";
import Link from "next/link";

import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

import { OrganizationSettingsPanel } from "./organization-settings-panel";

export function AccountGeneralPage() {
	const activeOrganizationQuery = authClient.useActiveOrganization();
	const activeOrganization = activeOrganizationQuery.data;
	const workspacesQuery = useQuery(trpc.repositories.workspaces.queryOptions());
	const providersQuery = useQuery(trpc.repositories.providers.queryOptions());
	const workspaces = workspacesQuery.data ?? [];
	const providers = providersQuery.data ?? [];
	const activeWorkspace =
		workspaces.find((workspace) => workspace.id === activeOrganization?.id) ?? null;

	return (
		<main className="flex flex-col gap-6">
			<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
				<div className="space-y-1">
					<h1 className="font-heading text-2xl font-medium tracking-tight md:text-3xl">
						Account
					</h1>
					<p className="max-w-3xl text-muted-foreground text-sm">
						Control workspace defaults, review how provider access is mapped,
						and jump into wallet or key management without leaving the account area.
					</p>
				</div>
				<Badge variant="outline">
					{activeWorkspace ? `Active: ${activeWorkspace.name}` : "No active workspace"}
				</Badge>
			</div>

			<div className="grid gap-3 md:grid-cols-3">
				<Card size="sm">
					<CardHeader>
						<CardDescription>Synced workspaces</CardDescription>
						<CardTitle className="text-3xl tabular-nums">
							{workspaces.length}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card size="sm">
					<CardHeader>
						<CardDescription>Connected providers</CardDescription>
						<CardTitle className="text-3xl tabular-nums">
							{providers.length}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card size="sm">
					<CardHeader>
						<CardDescription>Active repositories</CardDescription>
						<CardTitle className="text-3xl tabular-nums">
							{activeWorkspace?.repositoryCount ?? 0}
						</CardTitle>
					</CardHeader>
				</Card>
			</div>

			<div className="grid gap-6 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
				<Card>
					<CardHeader>
						<CardTitle>Account surfaces</CardTitle>
						<CardDescription>
							Everything account-scoped now hangs off synced workspaces instead of manually created organizations.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<Link
							href="/account/team-management"
							className={cn(
								buttonVariants({ variant: "outline" }),
								"h-auto w-full justify-start rounded-2xl px-4 py-3",
							)}
						>
							<Users2Icon />
							<span className="flex min-w-0 flex-col items-start">
								<span className="font-medium">Workspaces</span>
								<span className="truncate text-muted-foreground text-xs">
									Sync provider scopes and switch the active workspace
								</span>
							</span>
						</Link>
						<Link
							href="/account/billing"
							className={cn(
								buttonVariants({ variant: "outline" }),
								"h-auto w-full justify-start rounded-2xl px-4 py-3",
							)}
						>
							<CreditCardIcon />
							<span className="flex min-w-0 flex-col items-start">
								<span className="font-medium">Billing</span>
								<span className="truncate text-muted-foreground text-xs">
									Top up your wallet and inspect balance history
								</span>
							</span>
						</Link>
						<Link
							href="/account/api-keys"
							className={cn(
								buttonVariants({ variant: "outline" }),
								"h-auto w-full justify-start rounded-2xl px-4 py-3",
							)}
						>
							<KeyRoundIcon />
							<span className="flex min-w-0 flex-col items-start">
								<span className="font-medium">API Keys</span>
								<span className="truncate text-muted-foreground text-xs">
									Manage GitPal API keys and bring-your-own-provider keys
								</span>
							</span>
						</Link>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Workspace model</CardTitle>
						<CardDescription>
							Personal repos stay personal. Shared repos follow the organization or group that owns them upstream.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{workspaces.length === 0 ? (
							<Empty className="min-h-64">
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<Settings2Icon />
									</EmptyMedia>
									<EmptyTitle>No synced workspace yet</EmptyTitle>
									<EmptyDescription>
										Open the Workspaces page, connect your provider, and run a sync to generate workspace defaults automatically.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						) : (
							<div className="space-y-3">
								{workspaces.slice(0, 4).map((workspace) => (
									<div
										key={workspace.id}
										className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3"
									>
										<div className="flex items-center justify-between gap-3">
											<div className="min-w-0">
												<div className="truncate font-medium">{workspace.name}</div>
												<div className="truncate text-muted-foreground text-sm">
													{workspace.ownerPath}
												</div>
											</div>
											<div className="flex shrink-0 items-center gap-2">
												<Badge variant="outline">{workspace.providerName}</Badge>
												<Badge
													variant={
														workspace.id === activeWorkspace?.id
															? "secondary"
															: "outline"
													}
												>
													{workspace.id === activeWorkspace?.id
														? "Active"
														: workspace.scope}
												</Badge>
											</div>
										</div>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			<OrganizationSettingsPanel />
		</main>
	);
}
