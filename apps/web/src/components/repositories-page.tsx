"use client";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@gitpal/ui/components/avatar";
import { Badge } from "@gitpal/ui/components/badge";
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
import { ExternalLinkIcon, FolderGit2Icon } from "lucide-react";
import Link from "next/link";

import { queryClient, trpc } from "@/utils/trpc";

function getFallback(name: string) {
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

export function RepositoriesPage() {
	const repositoriesQuery = useQuery(trpc.repositories.list.queryOptions());
	const toggleMutation = useMutation(
		trpc.repositories.toggleEnabled.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries();
			},
		}),
	);
	const repositories = repositoriesQuery.data ?? [];
	const enabledCount = repositories.filter(
		(repository) => repository.enabled,
	).length;
	const privateCount = repositories.filter(
		(repository) => repository.private,
	).length;

	return (
		<main className="flex min-h-0 flex-1 flex-col gap-6">
			<div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
				<div className="flex flex-col gap-1">
					<h1 className="font-heading text-2xl font-medium tracking-tight md:text-3xl">
						Repositories
					</h1>
					<p className="max-w-3xl text-muted-foreground text-sm">
						Repositories are loaded on demand from the authenticated Git
						provider and cached with a TTL so the list stays current without
						manual sync.
					</p>
				</div>
			</div>

			<div className="grid gap-3 md:grid-cols-3">
				<Card size="sm">
					<CardHeader>
						<CardDescription>Total synced</CardDescription>
						<CardTitle className="text-3xl tabular-nums">
							{repositories.length}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card size="sm">
					<CardHeader>
						<CardDescription>Enabled for analytics</CardDescription>
						<CardTitle className="text-3xl tabular-nums">
							{enabledCount}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card size="sm">
					<CardHeader>
						<CardDescription>Private repositories</CardDescription>
						<CardTitle className="text-3xl tabular-nums">
							{privateCount}
						</CardTitle>
					</CardHeader>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>User projects</CardTitle>
					<CardDescription>
						Repositories are scoped to the authenticated provider accounts.
					</CardDescription>
					<CardAction>
						<Badge variant="outline">{repositories.length} repositories</Badge>
					</CardAction>
				</CardHeader>
				<CardContent>
					{repositoriesQuery.isLoading ? (
						<RepositorySkeleton />
					) : repositories.length > 0 ? (
						<div className="overflow-hidden rounded-xl border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Repository</TableHead>
										<TableHead>Provider</TableHead>
										<TableHead>Default branch</TableHead>
										<TableHead>Visibility</TableHead>
										<TableHead>Last sync</TableHead>
										<TableHead className="text-right">Analytics</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{repositories.map((repository) => (
										<TableRow key={repository.id}>
											<TableCell>
												<div className="flex items-center gap-3">
													<Avatar className="size-9 rounded-lg">
														{repository.ownerAvatarUrl ? (
															<AvatarImage
																src={repository.ownerAvatarUrl}
																alt={repository.fullName}
															/>
														) : null}
														<AvatarFallback className="rounded-lg">
															{getFallback(repository.fullName)}
														</AvatarFallback>
													</Avatar>
													<div className="flex min-w-0 flex-col">
														<Link
															href={repository.htmlUrl}
															target="_blank"
															className="inline-flex items-center gap-1 font-medium hover:underline"
														>
															<span className="truncate">
																{repository.fullName}
															</span>
															<ExternalLinkIcon />
														</Link>
														<span className="max-w-lg truncate text-muted-foreground text-xs">
															{repository.description ||
																repository.repositoryPath}
														</span>
													</div>
												</div>
											</TableCell>
											<TableCell>
												<Badge variant="secondary">
													{repository.providerName}
												</Badge>
											</TableCell>
											<TableCell>{repository.defaultBranch}</TableCell>
											<TableCell>
												<Badge variant="outline">
													{repository.private ? "Private" : "Public"}
												</Badge>
											</TableCell>
											<TableCell>
												{repository.lastSyncedAt
													? formatDistanceToNow(
															new Date(repository.lastSyncedAt),
															{
																addSuffix: true,
															},
														)
													: "Never"}
											</TableCell>
											<TableCell className="text-right">
												<Switch
													checked={repository.enabled}
													disabled={toggleMutation.isPending}
													onCheckedChange={(enabled) =>
														toggleMutation.mutate({
															repositoryId: repository.id,
															enabled,
														})
													}
													aria-label={`Toggle analytics for ${repository.fullName}`}
												/>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					) : (
						<Empty className="min-h-96">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<FolderGit2Icon />
								</EmptyMedia>
								<EmptyTitle>No repositories synced</EmptyTitle>
								<EmptyDescription>
									Open this page again after connecting a Git provider and the
									list will populate automatically.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					)}
				</CardContent>
			</Card>
		</main>
	);
}
