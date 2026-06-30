"use client";

import { Badge } from "@gitpal/ui/components/badge";
import { Button } from "@gitpal/ui/components/button";
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
	AlertTriangleIcon,
	ArrowRightIcon,
	CheckCircle2Icon,
	ExternalLinkIcon,
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

type ProviderStatus = "missing" | "needs-access" | "ready" | "installed";

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
		return "GitHub uses the App installation scope. If a repo is missing, widen the App installation to include that repository, then refresh access here.";
	}

	if (provider.type === "gitlab") {
		return "GitLab uses the connected account's project and group visibility. Paste the exact project path, including subgroups, when you install.";
	}

	return "Use the connected host settings to confirm which repositories GitPal can actually read before you add a path.";
}

function getRepositoryPathPlaceholder(providerType: string) {
	return providerType === "gitlab" ? "group/subgroup/project" : "owner/repo";
}

function getProviderStatus({
	workspaceCount,
	repositoryCount,
}: {
	workspaceCount: number;
	repositoryCount: number;
}): ProviderStatus {
	if (workspaceCount === 0 && repositoryCount === 0) {
		return "needs-access";
	}

	if (repositoryCount === 0) {
		return "ready";
	}

	return "installed";
}

function getProviderStatusCopy(status: ProviderStatus) {
	switch (status) {
		case "needs-access":
			return {
				badge: "Needs access",
				variant: "outline" as const,
				title: "GitPal still cannot see any synced workspace or repository from this provider.",
			};
		case "ready":
			return {
				badge: "Ready for repo add",
				variant: "secondary" as const,
				title: "Provider access is visible. Add the first repository path below.",
			};
		case "installed":
			return {
				badge: "Installed",
				variant: "secondary" as const,
				title: "GitPal can already see synced workspaces and repositories here.",
			};
		default:
			return {
				badge: "Missing",
				variant: "outline" as const,
				title: "No provider connected yet.",
			};
	}
}

function normalizeRepositoryPath(providerType: string, value: string) {
	const trimmed = value.trim();
	if (!trimmed) {
		return "";
	}

	const cleanPath = (rawPath: string) => {
		const withoutGit = rawPath.replace(/\.git$/i, "");
		const segments = withoutGit.split("/").filter(Boolean);

		if (segments.length === 0) {
			return "";
		}

		if (providerType === "github") {
			return segments.slice(0, 2).join("/");
		}

		const dashIndex = segments.indexOf("-");
		return (dashIndex >= 0 ? segments.slice(0, dashIndex) : segments).join("/");
	};

	if (/^https?:\/\//i.test(trimmed)) {
		try {
			const url = new URL(trimmed);
			return cleanPath(url.pathname.replace(/^\/+|\/+$/g, ""));
		} catch {
			return trimmed.replace(/^\/+|\/+$/g, "");
		}
	}

	return cleanPath(trimmed.replace(/^\/+|\/+$/g, ""));
}

function validateRepositoryPath(providerType: string, value: string) {
	if (!value) {
		return "Enter a repository path or paste the repository URL.";
	}

	const segments = value.split("/").filter(Boolean);

	if (providerType === "github" && segments.length !== 2) {
		return "GitHub repositories should look like owner/repo.";
	}

	if (providerType === "gitlab" && segments.length < 2) {
		return "GitLab projects should look like group/project or group/subgroup/project.";
	}

	return null;
}

function getHeroDescription({
	providerCount,
	workspaceCount,
	repositoryCount,
}: {
	providerCount: number;
	workspaceCount: number;
	repositoryCount: number;
}) {
	if (providerCount === 0) {
		return "Start by connecting GitHub or GitLab. The wizard should tell you what GitPal can see before it asks you to install a repository.";
	}

	if (workspaceCount === 0 && repositoryCount === 0) {
		return "GitPal knows your provider account, but it still needs repository access and an initial refresh before the workspace list feels trustworthy.";
	}

	if (repositoryCount === 0) {
		return "Provider access is visible now. Add the first repository explicitly below, or widen provider access if the repository is still missing.";
	}

	return "Provider access, workspaces, and repositories are visible. Use this page to add missing repositories without guessing the next step.";
}

function getChecklist({
	providerCount,
	workspaceCount,
	repositoryCount,
}: {
	providerCount: number;
	workspaceCount: number;
	repositoryCount: number;
}) {
	return [
		{
			title: "Provider connected",
			done: providerCount > 0,
			description:
				providerCount > 0
					? `${providerCount} connected provider${providerCount === 1 ? "" : "s"}`
					: "Connect GitHub or GitLab first",
		},
		{
			title: "Access synced",
			done: workspaceCount > 0,
			description:
				workspaceCount > 0
					? `${workspaceCount} synced workspace${workspaceCount === 1 ? "" : "s"}`
					: "Refresh after widening repository access",
		},
		{
			title: "Repository installed",
			done: repositoryCount > 0,
			description:
				repositoryCount > 0
					? `${repositoryCount} visible repositor${repositoryCount === 1 ? "y" : "ies"}`
					: "Add the first repository path",
		},
	];
}

export function RepositoryInstallWizardPage() {
	const {
		activeWorkspace,
		activeWorkspaceId,
		refreshWorkspaces,
		switchWorkspace,
		workspaces,
	} = useActiveWorkspace();
	const providersQuery = useQuery(trpc.repositories.providers.queryOptions());
	const repositoriesQuery = useQuery({
		...trpc.repositories.list.queryOptions({
			organizationId: activeWorkspaceId ?? undefined,
		}),
		enabled: Boolean(activeWorkspaceId),
	});
	const providers = providersQuery.data ?? [];
	const repositories = repositoriesQuery.data ?? [];
	const [selectedProviderId, setSelectedProviderId] = React.useState("");
	const [repositoryPath, setRepositoryPath] = React.useState("");

	React.useEffect(() => {
		if (providers.length > 0 && !selectedProviderId) {
			setSelectedProviderId(providers[0]?.providerId ?? "");
		}
	}, [providers, selectedProviderId]);

	const selectedProvider = providers.find(
		(provider) => provider.providerId === selectedProviderId,
	);
	const selectedProviderType = selectedProvider?.type ?? "github";
	const normalizedRepositoryPath = React.useMemo(
		() => normalizeRepositoryPath(selectedProviderType, repositoryPath),
		[repositoryPath, selectedProviderType],
	);
	const repositoryPathError = React.useMemo(() => {
		if (!repositoryPath.trim()) {
			return null;
		}

		return validateRepositoryPath(selectedProviderType, normalizedRepositoryPath);
	}, [normalizedRepositoryPath, repositoryPath, selectedProviderType]);

	const selectedProviderWorkspaces = workspaces.filter(
		(workspace) => workspace.providerId === selectedProvider?.providerId,
	);
	const selectedWorkspaceCount = selectedProviderWorkspaces.length;
	const selectedRepositoryCount = repositories.filter(
		(repository) => repository.providerId === selectedProvider?.providerId,
	).length;
	const selectedProviderStatus = selectedProvider
		? getProviderStatus({
				workspaceCount: selectedWorkspaceCount,
				repositoryCount: selectedRepositoryCount,
			})
		: "missing";
	const selectedProviderStatusCopy = getProviderStatusCopy(selectedProviderStatus);
	const checklist = getChecklist({
		providerCount: providers.length,
		workspaceCount: workspaces.length,
		repositoryCount: repositories.length,
	});

	const syncMutation = useMutation(
		trpc.repositories.sync.mutationOptions({
			onSuccess: async (result) => {
				await invalidateRepositoryData(activeWorkspaceId);
				await refreshWorkspaces();

				if (result.queued) {
					toast.success("Provider refresh queued. Workspace access will update shortly.");
					return;
				}

				toast.error(
					result.error
						? `Provider refresh could not be queued: ${result.error}`
						: "Provider refresh could not be queued.",
				);
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);
	const addRepositoryMutation = useMutation(
		trpc.repositories.addRepository.mutationOptions({
			onSuccess: async (result) => {
				await invalidateRepositoryData(activeWorkspaceId);
				await refreshWorkspaces();

				const addedRepositoryName =
					result.repository.repository.fullName ??
					result.repository.repository.repositoryPath;

				if (result.webhookSync.queued) {
					toast.success(`${addedRepositoryName} added. Webhook sync queued.`);
				} else {
					toast.warning(
						result.webhookSync.error
							? `${addedRepositoryName} added, but webhook sync could not be queued: ${result.webhookSync.error}`
							: `${addedRepositoryName} added, but webhook sync could not be queued.`,
					);
				}

				if (result.repository.organizationId) {
					const switched = await switchWorkspace(result.repository.organizationId);
					if (switched.error) {
						toast.error(switched.error);
					}
				}

				setRepositoryPath("");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	async function handleAddRepository(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (!selectedProviderId) {
			return;
		}

		const nextRepositoryPath = normalizeRepositoryPath(
			selectedProviderType,
			repositoryPath,
		);
		const nextPathError = validateRepositoryPath(
			selectedProviderType,
			nextRepositoryPath,
		);

		if (nextPathError) {
			toast.error(nextPathError);
			return;
		}

		await addRepositoryMutation.mutateAsync({
			providerId: selectedProviderId,
			repositoryPath: nextRepositoryPath,
		});
	}

	return (
		<main className="flex flex-col gap-6">
			<div className="flex flex-col gap-4 rounded-3xl border border-border/60 bg-gradient-to-br from-background via-background to-muted/20 p-6 shadow-sm md:p-8">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
					<div className="max-w-3xl space-y-3">
						<Badge variant="outline" className="w-fit">
							Repository install
						</Badge>
						<h1 className="font-heading font-medium text-3xl tracking-tight md:text-5xl">
							Connect GitHub or GitLab without guesswork.
						</h1>
						<p className="max-w-2xl text-muted-foreground text-sm leading-6 md:text-base">
							{getHeroDescription({
								providerCount: providers.length,
								workspaceCount: workspaces.length,
								repositoryCount: repositories.length,
							})}
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
						<Badge variant="outline" className="rounded-full px-3 py-1">
							{repositories.length} repositor
							{repositories.length === 1 ? "y" : "ies"}
						</Badge>
					</div>
				</div>
				<div className="grid gap-3 md:grid-cols-3">
					{checklist.map((item) => (
						<div
							key={item.title}
							className="rounded-2xl border border-border/60 bg-card/80 p-4"
						>
							<div className="flex items-center justify-between gap-3">
								<div className="font-medium text-sm">{item.title}</div>
								{item.done ? (
									<Badge variant="secondary">
										<CheckCircle2Icon className="size-3.5" />
										Done
									</Badge>
								) : (
									<Badge variant="outline">
										<AlertTriangleIcon className="size-3.5" />
										Needs attention
									</Badge>
								)}
							</div>
							<p className="mt-2 text-muted-foreground text-sm">
								{item.description}
							</p>
						</div>
					))}
				</div>
			</div>

			<div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
				<div className="space-y-4">
					<StepCard
						number="01"
						title="Provider access"
						description="Connect a provider, widen repository access there, then refresh here so GitPal can discover the right workspaces."
						className="border-border/60"
					>
						{providers.length > 0 ? (
							<div className="grid gap-3">
								{providers.map((provider) => {
									const providerWorkspaces = workspaces.filter(
										(workspace) => workspace.providerId === provider.providerId,
									);
									const repositoryCount = repositories.filter(
										(repository) =>
											repository.providerId === provider.providerId,
									).length;
									const workspaceCount = providerWorkspaces.length;
									const status = getProviderStatus({
										workspaceCount,
										repositoryCount,
									});
									const statusCopy = getProviderStatusCopy(status);

									return (
										<div
											key={provider.providerId}
											className="rounded-2xl border border-border/60 bg-muted/20 p-4"
										>
											<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
												<div className="space-y-3">
													<div className="flex flex-wrap items-center gap-3">
														<ProviderBadge
															providerId={
																provider.type === "gitlab" ? "gitlab" : "github"
															}
														/>
														<div>
															<div className="font-medium">{provider.label}</div>
															<div className="text-muted-foreground text-sm">
																{provider.type} provider
															</div>
														</div>
														<Badge variant={statusCopy.variant}>
															{statusCopy.badge}
														</Badge>
													</div>
													<p className="max-w-2xl font-medium text-sm">
														{statusCopy.title}
													</p>
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
													{providerWorkspaces.length > 0 ? (
														<div className="flex flex-wrap gap-2">
															{providerWorkspaces.slice(0, 3).map((workspace) => (
																<Badge
																	key={workspace.id}
																	variant="secondary"
																	className="rounded-full"
																>
																	{workspace.ownerPath}
																</Badge>
															))}
															{providerWorkspaces.length > 3 ? (
																<Badge variant="outline">
																	+{providerWorkspaces.length - 3} more
																</Badge>
															) : null}
														</div>
													) : null}
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
														{syncMutation.isPending
															? "Refreshing…"
															: "Refresh access"}
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
									<EmptyTitle>No Git provider connected</EmptyTitle>
									<EmptyDescription>
										You are already inside GitPal, but the wizard cannot install
										a repository until GitHub or GitLab is connected first.
									</EmptyDescription>
								</EmptyHeader>
								<div className="flex flex-wrap justify-center gap-2">
									<Button
										type="button"
										render={(props) => <Link {...props} href="/login" />}
										nativeButton={false}
									>
										Connect GitHub or GitLab
										<ArrowRightIcon />
									</Button>
									<Button
										type="button"
										variant="outline"
										render={(props) => (
											<Link {...props} href="/account/team-management" />
										)}
										nativeButton={false}
									>
										Open workspace access
										<ArrowRightIcon />
									</Button>
								</div>
							</Empty>
						)}
					</StepCard>

					<StepCard
						number="02"
						title="Add a repository"
						description="Paste a repository path or full URL. GitPal will normalize it before the install runs."
						className="border-border/60"
					>
						<form className="space-y-4" onSubmit={handleAddRepository}>
							{selectedProvider ? (
								<div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
									<div className="flex flex-wrap items-center gap-2">
										<Badge variant={selectedProviderStatusCopy.variant}>
											{selectedProviderStatusCopy.badge}
										</Badge>
										<Badge variant="outline">{selectedProvider.label}</Badge>
										<Badge variant="outline">{selectedProvider.type}</Badge>
									</div>
									<p className="mt-3 text-sm leading-6">
										{selectedProviderStatusCopy.title}
									</p>
									<p className="mt-2 text-muted-foreground text-sm leading-6">
										{selectedProvider.type === "gitlab"
											? "Paste the GitLab project path or project URL. Subgroups are supported and will be preserved."
											: "Paste the GitHub owner/repo path or repository URL. GitPal will trim extra URL parts like /tree/main automatically."}
									</p>
									{selectedProviderStatus === "needs-access" ? (
										<div className="mt-3 flex flex-wrap gap-2">
											{selectedProvider.settingsUrl ? (
												<a
													href={selectedProvider.settingsUrl}
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
														providerId: selectedProvider.providerId,
													})
												}
											>
												<RefreshCcwIcon />
												{syncMutation.isPending ? "Refreshing…" : "Refresh now"}
											</Button>
										</div>
									) : null}
								</div>
							) : null}

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
										placeholder={getRepositoryPathPlaceholder(selectedProviderType)}
										disabled={providers.length === 0}
									/>
									<p className="text-muted-foreground text-xs leading-5">
										Paste <code>{getRepositoryPathPlaceholder(selectedProviderType)}</code>{" "}
										or the full repository URL.
									</p>
									{repositoryPath.trim() &&
									normalizedRepositoryPath &&
									normalizedRepositoryPath !== repositoryPath.trim() ? (
										<p className="text-muted-foreground text-xs leading-5">
											GitPal will install <code>{normalizedRepositoryPath}</code>.
										</p>
									) : null}
									{repositoryPathError ? (
										<p className="text-destructive text-xs leading-5">
											{repositoryPathError}
										</p>
									) : null}
									{selectedProvider ? (
										<p className="text-muted-foreground text-xs leading-5">
											{selectedWorkspaceCount} workspace
											{selectedWorkspaceCount === 1 ? "" : "s"} and{" "}
											{selectedRepositoryCount}{" "}
											{selectedRepositoryCount === 1
												? "repository"
												: "repositories"}{" "}
											are already visible for this provider.
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
										!repositoryPath.trim() ||
										Boolean(repositoryPathError)
									}
								>
									{addRepositoryMutation.isPending
										? "Installing…"
										: selectedRepositoryCount > 0
											? "Add repository"
											: "Install first repository"}
									<ArrowRightIcon />
								</Button>
								<Badge variant="outline">
									{selectedProvider ? selectedProvider.type : "No provider"}
								</Badge>
								{selectedProvider && selectedWorkspaceCount === 0 ? (
									<Badge variant="outline">No synced workspaces yet</Badge>
								) : null}
							</div>
						</form>
					</StepCard>

					<StepCard
						number="03"
						title="After install"
						description="Verify the workspace GitPal picked, then move into repositories or workspace access."
						className="border-border/60"
					>
						<div className="grid gap-3 md:grid-cols-2">
							<div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
								<div className="font-medium text-sm">Active workspace</div>
								<p className="mt-1 text-muted-foreground text-sm">
									{activeWorkspace
										? `${activeWorkspace.name} • ${activeWorkspace.providerName}`
										: "No active workspace selected yet."}
								</p>
							</div>
							<div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
								<div className="font-medium text-sm">Visible repositories</div>
								<p className="mt-1 text-muted-foreground text-sm">
									{repositories.length > 0
										? `${repositories.length} ${repositories.length === 1 ? "repository is" : "repositories are"} currently visible in this workspace.`
										: "No repositories are visible in the selected workspace yet."}
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
								render={(props) => (
									<Link {...props} href="/account/team-management" />
								)}
								nativeButton={false}
							>
								Open workspace access
								<ArrowRightIcon />
							</Button>
						</div>
					</StepCard>
				</div>

				<div className="space-y-4">
					<StepCard
						number="04"
						title="GitHub and GitLab tips"
						description="The provider flow is different, so the troubleshooting should be different too."
						className="border-border/60"
					>
						<div className="space-y-3">
							<div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
								<div className="flex items-center gap-2 font-medium text-sm">
									<ProviderBadge providerId="github" />
									GitHub
								</div>
								<p className="mt-2 text-muted-foreground text-sm leading-6">
									If the repository is missing, update the GitHub App
									installation to include that repository or switch to all
									repositories, then refresh access in GitPal.
								</p>
							</div>
							<div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
								<div className="flex items-center gap-2 font-medium text-sm">
									<ProviderBadge providerId="gitlab" />
									GitLab
								</div>
								<p className="mt-2 text-muted-foreground text-sm leading-6">
									Paste the exact project path, including subgroups. If the
									project still cannot be found, confirm the connected GitLab
									account can read the group and project directly.
								</p>
							</div>
							<div className="rounded-2xl border border-border/60 bg-background p-4">
								<div className="font-medium text-sm">Why this page exists</div>
								<p className="mt-2 text-muted-foreground text-sm leading-6">
									The install flow should not hide repository access problems
									behind a generic sync button. This page now keeps the missing
									state, the provider action, and the explicit repository add in
									one place.
								</p>
							</div>
						</div>
					</StepCard>

					<Card className="border-border/60">
						<CardHeader>
							<CardTitle>Current install status</CardTitle>
							<CardDescription>
								A quick summary of the repositories GitPal can see right now.
							</CardDescription>
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
											If the provider is connected but the repo is still missing,
											widen provider access, refresh it here, and then paste the
											exact repository path or URL above.
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
