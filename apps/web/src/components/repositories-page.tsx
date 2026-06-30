"use client";

import { Badge } from "@gitpal/ui/components/badge";
import { Button, buttonVariants } from "@gitpal/ui/components/button";
import {
	Card,
	CardContent,
} from "@gitpal/ui/components/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@gitpal/ui/components/empty";
import { Input } from "@gitpal/ui/components/input";
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
import { cn } from "@gitpal/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
	ArrowRightIcon,
	Building2Icon,
	CircleDotIcon,
	ExternalLinkIcon,
	FolderGit2Icon,
	GitPullRequestIcon,
	RefreshCcwIcon,
	SearchIcon,
	Settings2Icon,
	ShieldCheckIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { queryClient, trpc } from "@/utils/trpc";
import { useActiveWorkspace } from "./active-workspace-provider";
import { ProviderSyncButton } from "./provider-sync-button";
import { invalidateRepositoryData } from "./repository-sync-helpers";
import {
	PageHeader,
	PageSectionCard,
	PageStatCard,
	PageStatGrid,
} from "./workspace-page";

const PAGE_SIZE_OPTIONS = ["10", "25", "50", "100"].map((size) => ({
	label: size,
	value: size,
}));

function getRepositoryInitials(name: string) {
	return name.split("/").at(-1)?.slice(0, 2).toUpperCase() ?? "GP";
}

function RepositorySkeleton() {
	return (
		<div className="flex flex-col gap-3">
			{Array.from({ length: 6 }).map((_, index) => (
				<Skeleton key={index} className="h-16 w-full" />
			))}
		</div>
	);
}

function matchesRepositorySearchQuery(
	repository: {
		fullName: string;
		name: string;
		repositoryPath: string;
		providerName: string;
		description: string | null;
	},
	query: string,
) {
	if (!query) {
		return true;
	}

	const haystack = [
		repository.fullName,
		repository.name,
		repository.repositoryPath,
		repository.providerName,
		repository.description ?? "",
	]
		.join(" ")
		.toLowerCase();

	return haystack.includes(query);
}

function getRepositoryNextAction(repository: {
	id: string;
	enabled: boolean;
	webhookConnected: boolean;
	lastReconciledAt: string | null;
	reconcileState: string;
	nextRetryAt: string | null;
	retryHint: string | null;
}): {
	badge: string;
	title: string;
	description: string;
	href: Route | null;
	ctaLabel: string;
} {
	if (!repository.enabled) {
		return {
			badge: "Paused",
			title: "Enable AI workflows",
			description:
				"Turn automation on when this repository is ready for reviews.",
			href: `/repositories/${repository.id}/settings` as Route,
			ctaLabel: "Open settings",
		};
	}
	if (!repository.webhookConnected) {
		return {
			badge: "Webhook missing",
			title: "Connect the webhook",
			description: "Open settings to create and verify the provider webhook.",
			href: `/repositories/${repository.id}/settings` as Route,
			ctaLabel: "Open settings",
		};
	}
	if (!repository.lastReconciledAt || repository.reconcileState === "failed") {
		const retryAt = repository.nextRetryAt
			? ` Automatic retry ${formatDistanceToNow(new Date(repository.nextRetryAt), { addSuffix: true })}.`
			: "";
		return {
			badge:
				repository.reconcileState === "failed" ? "Sync failed" : "Sync needed",
			title:
				repository.reconcileState === "failed"
					? "Retry repository sync"
					: "Run the first repository sync",
			description:
				(repository.retryHint ??
					"Import pull requests and issues, then confirm sync health.") +
				retryAt,
			href: null,
			ctaLabel:
				repository.reconcileState === "failed" ? "Retry sync" : "Queue sync",
		};
	}
	return {
		badge: "Ready",
		title: "Review queue ready",
		description:
			"Open pull requests to review, or tune repository-specific review settings.",
		href: `/pull-requests?repositoryId=${encodeURIComponent(repository.id)}`,
		ctaLabel: "Open pull requests",
	};
}

function RepositoryOnboardingCard({
	repository,
	onSync,
}: {
	repository: Parameters<typeof getRepositoryNextAction>[0];
	onSync: () => void;
}) {
	const action = getRepositoryNextAction(repository);
	return (
		<div
			className={cn(
				"rounded-2xl border p-4 shadow-sm",
				action.href
					? "border-emerald-500/20 bg-emerald-500/[0.03]"
					: "border-border/60 bg-muted/20",
			)}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="space-y-2">
					<Badge
						variant={action.href ? "secondary" : "outline"}
						className="w-fit rounded-full px-2.5"
					>
						{action.badge}
					</Badge>
					<div className="space-y-1">
						<div className="font-medium text-sm">{action.title}</div>
						<p className="text-muted-foreground text-xs leading-5">
							{action.description}
						</p>
					</div>
				</div>
				<ArrowRightIcon className="mt-1 size-4 shrink-0 text-muted-foreground" />
			</div>
			<div className="mt-4">
				{action.href ? (
					<Link
						href={action.href}
						className={buttonVariants({
							variant: "outline",
							size: "sm",
						})}
					>
						{action.ctaLabel}
						<ArrowRightIcon />
					</Link>
				) : (
					<Button type="button" variant="outline" size="sm" onClick={onSync}>
						<RefreshCcwIcon />
						{action.ctaLabel}
					</Button>
				)}
			</div>
		</div>
	);
}

export function RepositoriesPage() {
	const { activeWorkspace, activeWorkspaceId } = useActiveWorkspace();
	const providersQuery = useQuery(trpc.repositories.providers.queryOptions());
	const repositoriesQuery = useQuery({
		...trpc.repositories.list.queryOptions({
			organizationId: activeWorkspaceId ?? undefined,
		}),
		enabled: Boolean(activeWorkspaceId),
	});
	const [search, setSearch] = React.useState("");
	const [pageSize, setPageSize] = React.useState("10");
	const [page, setPage] = React.useState(0);

	const syncMutation = useMutation(
		trpc.repositories.sync.mutationOptions({
			onSuccess: async (result) => {
				await invalidateRepositoryData(activeWorkspaceId);

				if (result.queued) {
					toast.success("Provider sync queued.");
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
	const toggleMutation = useMutation(
		trpc.repositories.toggleEnabled.mutationOptions({
			onSuccess: async (data, variables) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.repositories.list.queryKey({
						organizationId: activeWorkspaceId ?? undefined,
					}),
				});

				if (variables.enabled) {
					if (data.webhookSync?.queued) {
						toast.success("Repository enabled. Webhook refresh queued.");
						return;
					}

					toast.error(
						data.webhookSync?.error
							? `Repository enabled, but webhook refresh could not be queued: ${data.webhookSync.error}`
							: "Repository enabled, but webhook refresh could not be queued.",
					);
					return;
				}

				toast.success("Repository disabled.");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);
	const reconcileMutation = useMutation(
		trpc.repositories.reconcile.mutationOptions({
			onSuccess: async (result) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.repositories.list.queryKey({
						organizationId: activeWorkspaceId ?? undefined,
					}),
				});
				if (result.queued) {
					toast.success("Pull request reconciliation queued.");
				} else {
					toast.error(result.error ?? "Reconciliation could not be queued.");
				}
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const repositories = repositoriesQuery.data ?? [];
	const providers = providersQuery.data ?? [];
	const normalizedSearch = search.trim().toLowerCase();
	const filteredRepositories = repositories.filter((repository) =>
		matchesRepositorySearchQuery(repository, normalizedSearch),
	);
	const pageSizeNumber = Number(pageSize) || 10;
	const pageCount = Math.max(
		1,
		Math.ceil(filteredRepositories.length / pageSizeNumber),
	);
	const visibleRepositories = filteredRepositories.slice(
		page * pageSizeNumber,
		page * pageSizeNumber + pageSizeNumber,
	);
	const enabledCount = repositories.filter(
		(repository) => repository.enabled,
	).length;
	const webhookConnectedCount = repositories.filter(
		(repository) => repository.webhookConnected,
	).length;
	const reconcileFailureCount = repositories.filter(
		(repository) => repository.reconcileState === "failed",
	).length;

	React.useEffect(() => {
		setPage((currentPage) => Math.min(currentPage, pageCount - 1));
	}, [pageCount]);

	if (!activeWorkspace) {
		return (
			<main className="flex flex-col gap-6">
				<PageHeader
					eyebrow="Repositories"
					title="Provider-scoped repository catalog"
					description="Repository management starts once GitPal has synced provider workspaces. Connect access first, then come back here to manage what is visible."
					actions={
						<Button
							type="button"
							variant="outline"
							render={(props) => <Link {...props} href="/repositories/install" />}
							nativeButton={false}
						>
							Open install wizard
							<ArrowRightIcon />
						</Button>
					}
				/>

				<PageSectionCard
					title="No active workspace"
					description="Repository management is scoped to synced provider workspaces instead of manually created organizations."
					contentClassName="pt-0"
				>
					<Empty className="min-h-80">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Building2Icon />
							</EmptyMedia>
							<EmptyTitle>Pick or sync a workspace first</EmptyTitle>
							<EmptyDescription>
								Once GitPal can see a provider workspace, the repository
								catalog and automation controls become available here.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				</PageSectionCard>

				<PageSectionCard
					title="Provider access"
					description="Open the provider app settings to update repository visibility, or sync a provider individually when access changes."
					action={
						<Button
							type="button"
							variant="outline"
							render={(props) => <Link {...props} href="/repositories/install" />}
							nativeButton={false}
						>
							Open install wizard
							<ArrowRightIcon />
						</Button>
					}
					contentClassName="space-y-3"
				>
						<div className="flex flex-wrap gap-2">
							<Link
								href="/account/team-management"
								className={buttonVariants({})}
							>
								<ShieldCheckIcon />
								Open workspace access
							</Link>
						</div>
						{providers.length > 0 ? (
							<div className="grid gap-3 md:grid-cols-2">
								{providers.map((provider) => (
									<div
										key={provider.providerId}
										className="rounded-2xl border border-border/60 bg-muted/20 p-4"
									>
										<div className="flex items-center justify-between gap-3">
											<div className="space-y-1">
												<div className="font-medium">{provider.label}</div>
												<div className="text-muted-foreground text-sm">
													{provider.type} installation scope
												</div>
											</div>
											<div className="flex flex-wrap justify-end gap-2">
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
												) : null}
												<Button
													type="button"
													variant="outline"
													disabled={syncMutation.isPending}
													onClick={() =>
														syncMutation.mutate({
															providerId: provider.providerId,
														})
													}
												>
													<RefreshCcwIcon />
													{syncMutation.isPending
														? "Syncing…"
														: `Sync ${provider.label}`}
												</Button>
											</div>
										</div>
									</div>
								))}
							</div>
						) : null}
				</PageSectionCard>
			</main>
		);
	}

	return (
		<main className="flex flex-col gap-6">
			<PageHeader
				eyebrow="Repositories"
				title={`${activeWorkspace.name} repository catalog`}
				description="Manage sync, visibility, and automation inside the active provider workspace without burying the next step under crowded controls."
				badges={
					<>
						<Badge variant="secondary">{activeWorkspace.providerName}</Badge>
						<Badge variant="outline">{activeWorkspace.repositoryCount} repos</Badge>
					</>
				}
				actions={
					<>
					<Button
						variant="outline"
						render={(props) => <Link {...props} href="/repositories/install" />}
						nativeButton={false}
					>
						Open install wizard
						<ArrowRightIcon />
					</Button>
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
					<Button
						size="icon"
						tooltip="Manage provider access"
						render={(props) => (
							<Link {...props} href="/account/team-management" />
						)}
					>
						<ShieldCheckIcon />
					</Button>
					</>
				}
			/>

			<PageStatGrid>
				<PageStatCard
					label="Total synced"
					value={repositories.length}
					meta="Repositories currently visible in this workspace."
				/>
				<PageStatCard
					label="AI enabled"
					value={enabledCount}
					meta="Repositories with GitPal automation enabled."
				/>
				<PageStatCard
					label="Webhook connected"
					value={webhookConnectedCount}
					meta="Repositories receiving webhook deliveries."
				/>
				<PageStatCard
					label="Needs attention"
					value={reconcileFailureCount}
					meta="Repositories with failed reconciliation health."
				/>
			</PageStatGrid>

			<PageSectionCard
				title="Repository catalog"
				description="Filter by repository name, provider, or path."
				action={
					<Badge variant="outline">
						{filteredRepositories.length} / {repositories.length}
					</Badge>
				}
				contentClassName="space-y-4"
			>
					<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
						<div className="relative w-full md:max-w-md">
							<SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={search}
								onChange={(event) => {
									setSearch(event.target.value);
									setPage(0);
								}}
								placeholder="Search repositories…"
								className="pl-9"
							/>
						</div>
						<Select
							items={PAGE_SIZE_OPTIONS}
							value={pageSize}
							onValueChange={(value) => {
								setPageSize(value ?? "10");
								setPage(0);
							}}
						>
							<SelectTrigger className="w-28">
								<SelectValue placeholder="Page size" />
							</SelectTrigger>
							<SelectContent>
								{PAGE_SIZE_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{repositoriesQuery.isLoading ? (
						<RepositorySkeleton />
					) : filteredRepositories.length > 0 ? (
						<div className="space-y-4">
							<div className="space-y-3 md:hidden">
								{visibleRepositories.map((repository) => (
									<div
										key={repository.id}
										className="rounded-2xl border border-border/60 bg-card/70 p-4"
									>
										<div className="flex items-start justify-between gap-3">
											<div className="flex min-w-0 items-center gap-3">
												<div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/60 font-medium text-xs">
													{getRepositoryInitials(repository.fullName)}
												</div>
												<div className="min-w-0">
													<a
														href={repository.htmlUrl}
														target="_blank"
														rel="noreferrer noopener"
														className="inline-flex items-center gap-1 font-medium hover:underline"
													>
														<span className="truncate">
															{repository.fullName}
														</span>
														<ExternalLinkIcon className="size-3.5" />
													</a>
													<div className="truncate text-muted-foreground text-xs">
														{repository.description ||
															repository.repositoryPath}
													</div>
												</div>
											</div>
											<Link
												href={`/repositories/${repository.id}/settings`}
												aria-label={`Open settings for ${repository.fullName}`}
												className={cn(
													buttonVariants({
														variant: "ghost",
														size: "icon-sm",
													}),
												)}
											>
												<Settings2Icon />
											</Link>
										</div>
										<div className="mt-4 flex flex-wrap gap-2">
											<Badge variant="outline">
												{repository.defaultBranch}
											</Badge>
											<Badge variant="outline">
												{repository.private ? "Private" : "Public"}
											</Badge>
										</div>
										<div className="mt-3 flex flex-wrap gap-2">
											<Link
												href={`/pull-requests?repositoryId=${encodeURIComponent(repository.id)}`}
												className={buttonVariants({
													variant: "outline",
													size: "sm",
												})}
											>
												<GitPullRequestIcon />
												Pull requests
											</Link>
											<Link
												href={`/issues?repositoryId=${encodeURIComponent(repository.id)}`}
												className={buttonVariants({
													variant: "outline",
													size: "sm",
												})}
											>
												<CircleDotIcon />
												Issues
											</Link>
										</div>
										<div className="mt-4">
											<RepositoryOnboardingCard
												repository={repository}
												onSync={() =>
													reconcileMutation.mutate({
														organizationId: activeWorkspaceId ?? undefined,
														repositoryId: repository.id,
													})
												}
											/>
										</div>
										<div className="mt-4 flex items-center justify-between gap-3">
											<div className="space-y-1 text-muted-foreground text-sm">
												<div>
													{repository.enabled
														? "AI workflows enabled"
														: "AI workflows paused"}
												</div>
												<div>
													PR sync: {repository.reconcileState}
													{repository.lastReconciledAt
														? `, ${formatDistanceToNow(new Date(repository.lastReconciledAt), { addSuffix: true })}`
														: ""}
												</div>
											</div>
											<div className="flex items-center gap-2">
												<Button
													type="button"
													variant="outline"
													size="sm"
													disabled={reconcileMutation.isPending}
													onClick={() =>
														reconcileMutation.mutate({
															organizationId: activeWorkspaceId ?? undefined,
															repositoryId: repository.id,
														})
													}
												>
													<RefreshCcwIcon />
													{repository.reconcileState === "failed"
														? "Retry"
														: "Sync now"}
												</Button>
												<Switch
													checked={repository.enabled}
													disabled={toggleMutation.isPending}
													onCheckedChange={(enabled) =>
														toggleMutation.mutate({
															organizationId: activeWorkspaceId ?? undefined,
															repositoryId: repository.id,
															enabled,
														})
													}
													aria-label={`Toggle analytics for ${repository.fullName}`}
												/>
											</div>
										</div>
									</div>
								))}
							</div>
							<div className="hidden overflow-x-auto rounded-xl border md:block">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Repository</TableHead>
											<TableHead>Default branch</TableHead>
											<TableHead>Visibility</TableHead>
											<TableHead>Automation</TableHead>
											<TableHead className="text-right">Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{visibleRepositories.map((repository) => (
											<TableRow key={repository.id}>
												<TableCell>
													<div className="flex items-center gap-3">
														<div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/60 font-medium text-xs">
															{getRepositoryInitials(repository.fullName)}
														</div>
														<div className="flex min-w-0 flex-col">
															<a
																href={repository.htmlUrl}
																target="_blank"
																rel="noreferrer noopener"
																className="inline-flex items-center gap-1 font-medium hover:underline"
															>
																<span className="truncate">
																	{repository.fullName}
																</span>
																<ExternalLinkIcon className="size-3.5" />
															</a>
															<span className="max-w-lg truncate text-muted-foreground text-xs">
																{repository.description ||
																	repository.repositoryPath}
															</span>
														</div>
													</div>
												</TableCell>
												<TableCell>{repository.defaultBranch}</TableCell>
												<TableCell>
													<Badge variant="outline">
														{repository.private ? "Private" : "Public"}
													</Badge>
												</TableCell>
												<TableCell>
													<div className="flex flex-wrap items-center gap-2">
														<Badge
															variant={
																repository.enabled ? "secondary" : "outline"
															}
														>
															{repository.enabled ? "AI enabled" : "AI paused"}
														</Badge>
														<Badge
															variant={
																repository.reconcileState === "failed"
																	? "destructive"
																	: "outline"
															}
														>
															PR sync {repository.reconcileState}
														</Badge>
													</div>
													{repository.lastReconciledAt ? (
														<div className="mt-1 text-muted-foreground text-xs">
															Last successful sync{" "}
															{formatDistanceToNow(
																new Date(repository.lastReconciledAt),
																{ addSuffix: true },
															)}
														</div>
													) : null}
													{repository.webhookLastDeliveredAt ? (
														<div className="mt-1 text-muted-foreground text-xs">
															Last delivery{" "}
															{formatDistanceToNow(
																new Date(repository.webhookLastDeliveredAt),
																{ addSuffix: true },
															)}
														</div>
													) : null}
													<div className="mt-3 max-w-sm">
														<RepositoryOnboardingCard
															repository={repository}
															onSync={() =>
																reconcileMutation.mutate({
																	organizationId:
																		activeWorkspaceId ?? undefined,
																	repositoryId: repository.id,
																})
															}
														/>
													</div>
												</TableCell>
												<TableCell>
													<div className="flex items-center justify-end gap-3">
														<Link
															href={`/pull-requests?repositoryId=${encodeURIComponent(repository.id)}`}
															aria-label={`Open pull requests for ${repository.fullName}`}
															className={cn(
																buttonVariants({
																	variant: "ghost",
																	size: "icon-sm",
																}),
															)}
														>
															<GitPullRequestIcon />
														</Link>
														<Button
															type="button"
															variant="ghost"
															size="icon-sm"
															tooltip={
																repository.reconcileState === "failed"
																	? "Retry pull request sync"
																	: "Sync pull requests now"
															}
															disabled={reconcileMutation.isPending}
															onClick={() =>
																reconcileMutation.mutate({
																	organizationId:
																		activeWorkspaceId ?? undefined,
																	repositoryId: repository.id,
																})
															}
														>
															<RefreshCcwIcon />
														</Button>
														<Link
															href={`/issues?repositoryId=${encodeURIComponent(repository.id)}`}
															aria-label={`Open issues for ${repository.fullName}`}
															className={cn(
																buttonVariants({
																	variant: "ghost",
																	size: "icon-sm",
																}),
															)}
														>
															<CircleDotIcon />
														</Link>
														<Link
															href={`/repositories/${repository.id}/settings`}
															aria-label={`Open settings for ${repository.fullName}`}
															className={cn(
																buttonVariants({
																	variant: "ghost",
																	size: "icon-sm",
																}),
															)}
														>
															<Settings2Icon />
														</Link>
														<Switch
															checked={repository.enabled}
															disabled={toggleMutation.isPending}
															onCheckedChange={(enabled) =>
																toggleMutation.mutate({
																	organizationId:
																		activeWorkspaceId ?? undefined,
																	repositoryId: repository.id,
																	enabled,
																})
															}
															aria-label={`Toggle analytics for ${repository.fullName}`}
														/>
													</div>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
							<div className="flex items-center justify-between gap-3 text-muted-foreground text-sm">
								<div>
									Page {page + 1} of {pageCount}
								</div>
								<div className="flex gap-2">
									<Button
										type="button"
										variant="outline"
										disabled={page === 0}
										onClick={() => setPage((value) => Math.max(0, value - 1))}
									>
										Previous
									</Button>
									<Button
										type="button"
										variant="outline"
										disabled={page + 1 >= pageCount}
										onClick={() =>
											setPage((value) => Math.min(pageCount - 1, value + 1))
										}
									>
										Next
									</Button>
								</div>
							</div>
						</div>
					) : (
						<Empty className="min-h-96">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<FolderGit2Icon />
								</EmptyMedia>
								<EmptyTitle>
									{search.trim()
										? "No matching repositories"
										: "No repositories synced"}
								</EmptyTitle>
								<EmptyDescription>
									{search.trim()
										? "Try a different search term or clear the filter."
										: "Open the install wizard if the provider installation needs broader access, then sync the provider again."}
								</EmptyDescription>
							</EmptyHeader>
							{!search.trim() ? (
								<div className="flex flex-wrap justify-center gap-2">
									<Button
										type="button"
										variant="outline"
										render={(props) => (
											<Link {...props} href="/repositories/install" />
										)}
										nativeButton={false}
									>
										Open install wizard
										<ArrowRightIcon />
									</Button>
									<ProviderSyncButton
										target={activeWorkspace}
										isPending={syncMutation.isPending}
										onClick={() =>
											syncMutation.mutate({
												organizationId: activeWorkspaceId ?? undefined,
												providerId: activeWorkspace.providerId,
											})
										}
									/>
								</div>
							) : null}
						</Empty>
					)}
			</PageSectionCard>
		</main>
	);
}
