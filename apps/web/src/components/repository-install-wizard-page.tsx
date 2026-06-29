"use client";

import { Badge } from "@gitpal/ui/components/badge";
import { Button } from "@gitpal/ui/components/button";
import {
	Card,
	CardAction,
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
import { Input } from "@gitpal/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@gitpal/ui/components/select";
import { cn } from "@gitpal/ui/lib/utils";
import { GithubIcon, GitlabIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
	ArrowRightIcon,
	ExternalLinkIcon,
	FileCode2Icon,
	FoldersIcon,
	RefreshCcwIcon,
	ShieldCheckIcon,
	WorkflowIcon,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";
import { useActiveWorkspace } from "./active-workspace-provider";
import { invalidateRepositoryData } from "./repository-sync-helpers";

type StepCardProps = {
	number: string;
	title: string;
	description: string;
	children?: React.ReactNode;
	className?: string;
};

function StepCard({
	number,
	title,
	description,
	children,
	className,
}: StepCardProps) {
	return (
		<Card className={cn("overflow-hidden", className)}>
			<CardHeader className="gap-3 border-b bg-muted/20">
				<div className="flex items-center gap-3">
					<Badge variant="secondary" className="rounded-full px-2.5">
						{number}
					</Badge>
					<div className="space-y-1">
						<CardTitle className="text-lg">{title}</CardTitle>
						<CardDescription>{description}</CardDescription>
					</div>
				</div>
			</CardHeader>
			{children ? <CardContent className="pt-6">{children}</CardContent> : null}
		</Card>
	);
}

function ProviderBadge({ providerId }: { providerId: "github" | "gitlab" }) {
	return providerId === "github" ? (
		<HugeiconsIcon icon={GithubIcon} size={18} />
	) : (
		<HugeiconsIcon icon={GitlabIcon} size={18} />
	);
}

function getProviderHint(provider: {
	providerId: string;
	type: string;
	label: string;
}) {
	if (provider.providerId === "github") {
		return "Choose all repositories or selected repositories in the GitHub App installation, then queue the first sync in GitPal.";
	}

	if (provider.type === "gitlab") {
		return "Use your GitLab OAuth connection and add the exact project or group paths you want GitPal to sync.";
	}

	return "Use the connected host settings to confirm the repositories GitPal should sync.";
}

function getRepositoryPathPlaceholder(providerType: string) {
	return providerType === "gitlab" ? "group/subgroup/project" : "owner/repo";
}

export function RepositoryInstallWizardPage() {
	const {
		activeWorkspace,
		activeWorkspaceId,
		refreshWorkspaces,
		switchWorkspace,
	} = useActiveWorkspace();
	const providersQuery = useQuery(trpc.repositories.providers.queryOptions());
	const workspacesQuery = useQuery(trpc.repositories.workspaces.queryOptions());
	const repositoriesQuery = useQuery({
		...trpc.repositories.list.queryOptions({
			organizationId: activeWorkspaceId ?? undefined,
		}),
		enabled: Boolean(activeWorkspaceId),
	});
	const providers = providersQuery.data ?? [];
	const workspaces = workspacesQuery.data ?? [];
	const repositories = repositoriesQuery.data ?? [];
	const [selectedProviderId, setSelectedProviderId] = React.useState("");
	const [repositoryPath, setRepositoryPath] = React.useState("");

	React.useEffect(() => {
		if (providers.length > 0 && !selectedProviderId) {
			setSelectedProviderId(providers[0]?.providerId ?? "");
		}
	}, [providers, selectedProviderId]);

	React.useEffect(() => {
		const selectedProvider = providers.find(
			(provider) => provider.providerId === selectedProviderId,
		);
		if (!selectedProvider) {
			return;
		}
		if (repositoryPath.trim()) {
			return;
		}

		const defaultPath =
			selectedProvider.type === "gitlab" ? "group/project" : "owner/repo";
		setRepositoryPath(defaultPath);
	}, [providers, repositoryPath, selectedProviderId]);

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
	const addRepositoryMutation = useMutation(
		trpc.repositories.addRepository.mutationOptions({
			onSuccess: async (result, variables) => {
				await invalidateRepositoryData(activeWorkspaceId);
				await refreshWorkspaces();

				if (result.webhookSync.queued) {
					toast.success("Repository added and webhook sync queued.");
				} else {
					toast.error(
						result.webhookSync.error
							? `Repository added, but webhook sync could not be queued: ${result.webhookSync.error}`
							: "Repository added, but webhook sync could not be queued.",
					);
				}

				if (result.repository.organizationId) {
					const switched = await switchWorkspace(
						result.repository.organizationId,
					);
					if (switched.error) {
						toast.error(switched.error);
					}
				}

				setRepositoryPath(
					getRepositoryPathPlaceholder(
						providers.find(
							(provider) => provider.providerId === variables.providerId,
						)?.type ?? "github",
					),
				);
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const selectedProvider = providers.find(
		(provider) => provider.providerId === selectedProviderId,
	);
	const selectedWorkspaceCount = workspaces.filter(
		(workspace) => workspace.providerId === selectedProvider?.providerId,
	).length;
	const selectedRepositoryCount = repositories.filter(
		(repository) => repository.providerId === selectedProvider?.providerId,
	).length;

	async function handleAddRepository(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (!selectedProviderId || !repositoryPath.trim()) {
			return;
		}

		await addRepositoryMutation.mutateAsync({
			providerId: selectedProviderId,
			repositoryPath: repositoryPath.trim(),
		});
	}

	return (
		<main className="flex flex-col gap-6">
			<div className="flex flex-col gap-4 rounded-3xl border border-border/60 bg-gradient-to-br from-background via-background to-muted/20 p-6 shadow-sm md:p-8">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
					<div className="max-w-3xl space-y-3">
						<Badge variant="outline" className="w-fit">
							Installation wizard
						</Badge>
						<h1 className="font-heading font-medium text-3xl tracking-tight md:text-5xl">
							Install GitPal with explicit repo steps.
						</h1>
						<p className="max-w-2xl text-muted-foreground text-sm leading-6 md:text-base">
							Connect a provider, add the exact repository path you want GitPal
							to manage, and keep the install flow visible instead of hiding it
							behind a generic sync button.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<Badge variant="secondary" className="rounded-full px-3 py-1">
							{providers.length} connected provider
							{providers.length === 1 ? "" : "s"}
						</Badge>
						<Badge variant="outline" className="rounded-full px-3 py-1">
							{workspaces.length} workspace
							{workspaces.length === 1 ? "" : "s"}
						</Badge>
					</div>
				</div>
				<div className="grid gap-3 md:grid-cols-3">
					<div className="rounded-2xl border border-border/60 bg-card/80 p-4">
						<div className="flex items-center gap-2 font-medium text-sm">
							<ShieldCheckIcon className="size-4 text-primary" />
							Provider access
						</div>
						<p className="mt-2 text-muted-foreground text-sm">
							Install GitHub through the App flow, or keep GitLab connected
							through OAuth and add the project paths you need.
						</p>
					</div>
					<div className="rounded-2xl border border-border/60 bg-card/80 p-4">
						<div className="flex items-center gap-2 font-medium text-sm">
							<FoldersIcon className="size-4 text-primary" />
							Repository selection
						</div>
						<p className="mt-2 text-muted-foreground text-sm">
							Install the exact repo or project you want rather than blindly
							syncing every visible repository.
						</p>
					</div>
					<div className="rounded-2xl border border-border/60 bg-card/80 p-4">
						<div className="flex items-center gap-2 font-medium text-sm">
							<WorkflowIcon className="size-4 text-primary" />
							Sync health
						</div>
						<p className="mt-2 text-muted-foreground text-sm">
							Webhooks and repository sync queue automatically after install,
							and you can refresh a provider from here at any time.
						</p>
					</div>
				</div>
			</div>

			<div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
				<div className="space-y-4">
					<StepCard
						number="01"
						title="Connect the provider"
						description="Verify the provider installation and confirm the account GitPal should use."
						className="border-border/60"
					>
						{providers.length > 0 ? (
							<div className="grid gap-3">
								{providers.map((provider) => {
									const repositoryCount = repositories.filter(
										(repository) =>
											repository.providerId === provider.providerId,
									).length;
									const workspaceCount = workspaces.filter(
										(workspace) => workspace.providerId === provider.providerId,
									).length;

									return (
										<div
											key={provider.providerId}
											className="rounded-2xl border border-border/60 bg-muted/20 p-4"
										>
											<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
												<div className="space-y-2">
													<div className="flex items-center gap-3">
														<ProviderBadge
															providerId={
																provider.type === "gitlab" ? "gitlab" : "github"
															}
														/>
														<div>
															<div className="font-medium">
																{provider.label}
															</div>
															<div className="text-muted-foreground text-sm">
																{provider.type} provider
															</div>
														</div>
													</div>
													<p className="max-w-2xl text-muted-foreground text-sm leading-6">
														{getProviderHint(provider)}
													</p>
													<div className="flex flex-wrap gap-2">
														<Badge variant="outline">
															{workspaceCount} workspace
															{workspaceCount === 1 ? "" : "s"}
														</Badge>
														<Badge variant="outline">
															{repositoryCount}{" "}
															{repositoryCount === 1
																? "repository"
																: "repositories"}
														</Badge>
													</div>
												</div>
												<div className="flex flex-wrap gap-2">
													{provider.settingsUrl ? (
														<a
															href={provider.settingsUrl}
															target="_blank"
															rel="noreferrer noopener"
															className={cn(
																"inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 font-medium text-sm transition-colors hover:bg-muted",
															)}
														>
															<ExternalLinkIcon className="size-4" />
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
														{syncMutation.isPending ? "Syncing…" : "Refresh"}
													</Button>
												</div>
											</div>
										</div>
									);
								})}
							</div>
						) : (
							<Empty className="min-h-52 rounded-2xl border border-border/60 border-dashed bg-muted/10">
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<ShieldCheckIcon />
									</EmptyMedia>
									<EmptyTitle>No provider connected</EmptyTitle>
									<EmptyDescription>
										Connect a provider first, then come back here to add a
										repository by exact path.
									</EmptyDescription>
								</EmptyHeader>
								<Button
									type="button"
									render={(props) => <Link {...props} href="/login" />}
									nativeButton={false}
								>
									Connect provider
									<ArrowRightIcon />
								</Button>
							</Empty>
						)}
					</StepCard>

					<StepCard
						number="02"
						title="Add a repository path"
						description="Sync one repository or project at a time so the install flow stays obvious."
						className="border-border/60"
					>
						<form className="space-y-4" onSubmit={handleAddRepository}>
							<div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
								<div className="space-y-2">
									<div className="font-medium text-sm">Provider</div>
									<Select
										items={providers.map((provider) => ({
											label: provider.label,
											value: provider.providerId,
										}))}
										value={selectedProviderId}
										onValueChange={(value) => {
											if (value) {
												setSelectedProviderId(value);
											}
										}}
									>
										<SelectTrigger>
											<SelectValue placeholder="Choose provider" />
										</SelectTrigger>
										<SelectContent>
											{providers.map((provider) => (
												<SelectItem
													key={provider.providerId}
													value={provider.providerId}
												>
													{provider.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<div className="font-medium text-sm">Repository path</div>
									<Input
										value={repositoryPath}
										onChange={(event) => {
											setRepositoryPath(event.target.value);
										}}
										placeholder={getRepositoryPathPlaceholder(
											selectedProvider?.type ?? "github",
										)}
										disabled={providers.length === 0}
									/>
									<p className="text-muted-foreground text-xs">
										{selectedProvider?.type === "gitlab"
											? "Use the GitLab project path, including groups or subgroups."
											: "Use the owner/repo path from GitHub or the connected enterprise host."}
									</p>
									{selectedProvider ? (
										<p className="text-muted-foreground text-xs">
											{selectedWorkspaceCount} workspace
											{selectedWorkspaceCount === 1 ? "" : "s"} and{" "}
											{selectedRepositoryCount}{" "}
											{selectedRepositoryCount === 1
												? "repository"
												: "repositories"}{" "}
											are already synced for this provider.
										</p>
									) : null}
								</div>
							</div>

							<div className="flex flex-wrap items-center gap-2">
								<Button
									type="submit"
									disabled={
										providers.length === 0 ||
										addRepositoryMutation.isPending ||
										!repositoryPath.trim()
									}
								>
									{addRepositoryMutation.isPending
										? "Installing…"
										: "Add repository and sync"}
									<ArrowRightIcon />
								</Button>
								<Badge variant="outline">
									{selectedProvider ? selectedProvider.type : "No provider"}
								</Badge>
							</div>
						</form>
					</StepCard>

					<StepCard
						number="03"
						title="Keep sync visible"
						description="Use the repository catalog once the install is complete."
						className="border-border/60"
					>
						<div className="grid gap-3 md:grid-cols-2">
							<div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
								<div className="font-medium text-sm">Repository catalog</div>
								<p className="mt-1 text-muted-foreground text-sm">
									{repositories.length > 0
										? `${repositories.length} ${repositories.length === 1 ? "repository" : "repositories"} are currently visible in this workspace.`
										: "No repositories have been synced into the selected workspace yet."}
								</p>
							</div>
							<div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
								<div className="font-medium text-sm">Workspace</div>
								<p className="mt-1 text-muted-foreground text-sm">
									{activeWorkspace
										? `${activeWorkspace.name} • ${activeWorkspace.providerName}`
										: "No active workspace selected yet."}
								</p>
							</div>
						</div>
						<div className="mt-4 flex flex-wrap gap-2">
							<Button
								type="button"
								variant="outline"
								render={(props) => <Link {...props} href="/repositories" />}
								nativeButton={false}
							>
								Open repositories
								<ArrowRightIcon />
							</Button>
							<Button
								type="button"
								variant="ghost"
								render={(props) => <Link {...props} href="/integrations" />}
								nativeButton={false}
							>
								Open integrations
								<ArrowRightIcon />
							</Button>
						</div>
					</StepCard>
				</div>

				<div className="space-y-4">
					<StepCard
						number="04"
						title=".gitpal.yaml"
						description="Keep repository-specific policy close to the code."
						className="border-border/60"
					>
						<div className="space-y-3">
							<div className="rounded-2xl border border-border/60 bg-[#0f172a] p-4 font-mono text-slate-100 text-xs leading-6">
								<pre className="overflow-x-auto">
									{`version: 1
settings:
  reviews:
    behavior:
      profile: chill
      autoReview:
        onOpen: true
        onPush: true
`}
								</pre>
							</div>
							<p className="text-muted-foreground text-sm leading-6">
								Place a `.gitpal.yaml` or `.gitpal.yml` file in the repository
								root to keep repository-specific review policy in source
								control.
							</p>
							<div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
								<div className="font-medium text-sm">Suggested precedence</div>
								<ul className="mt-2 space-y-2 text-muted-foreground text-sm leading-6">
									<li>Repository YAML for repo-specific overrides.</li>
									<li>Workspace defaults for shared behavior.</li>
									<li>GitPal defaults as the fallback.</li>
								</ul>
							</div>
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									variant="outline"
									render={(props) => <Link {...props} href="/repositories" />}
									nativeButton={false}
								>
									Review repository settings
									<ArrowRightIcon />
								</Button>
								<Button
									type="button"
									variant="ghost"
									render={(props) => <Link {...props} href="/repositories" />}
									nativeButton={false}
								>
									<FileCode2Icon />
									See catalog
								</Button>
							</div>
						</div>
					</StepCard>

					<Card className="border-border/60">
						<CardHeader>
							<CardTitle>Current install status</CardTitle>
							<CardDescription>
								A quick summary of the repositories currently visible to GitPal.
							</CardDescription>
							<CardAction>
								<Badge variant="outline">
									{repositories.length}{" "}
									{repositories.length === 1 ? "repository" : "repositories"}
								</Badge>
							</CardAction>
						</CardHeader>
						<CardContent className="space-y-3">
							{repositories.length > 0 ? (
								repositories.slice(0, 5).map((repository) => (
									<div
										key={repository.id}
										className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3"
									>
										<div className="min-w-0">
											<div className="truncate font-medium text-sm">
												{repository.fullName}
											</div>
											<div className="text-muted-foreground text-xs">
												{repository.providerName} • {repository.defaultBranch}
											</div>
										</div>
										<Badge
											variant={repository.enabled ? "secondary" : "outline"}
										>
											{repository.enabled ? "Enabled" : "Paused"}
										</Badge>
									</div>
								))
							) : (
								<Empty className="min-h-52">
									<EmptyHeader>
										<EmptyMedia variant="icon">
											<WorkflowIcon />
										</EmptyMedia>
										<EmptyTitle>No repositories yet</EmptyTitle>
										<EmptyDescription>
											Add the first repository path above to start the sync
											flow.
										</EmptyDescription>
									</EmptyHeader>
								</Empty>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</main>
	);
}
