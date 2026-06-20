"use client";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@gitpal/ui/components/avatar";
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
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@gitpal/ui/components/select";
import { Skeleton } from "@gitpal/ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@gitpal/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { CircleDotIcon, GitPullRequestIcon, SearchIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import * as React from "react";

import { trpc } from "@/utils/trpc";
import { useActiveWorkspace } from "./active-workspace-provider";

type WorkItemKind = "pull_request" | "issue";

function initials(value: string | null) {
	return (value || "GitPal")
		.split(/\s+/)
		.map((part) => part[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

function itemHref(kind: WorkItemKind, repositoryId: string, number: number) {
	return `/repositories/${repositoryId}/${kind === "pull_request" ? "pull-requests" : "issues"}/${number}` as Route;
}

function WorkItemsSkeleton() {
	return (
		<div className="flex flex-col gap-3">
			{Array.from({ length: 7 }).map((_, index) => (
				<Skeleton key={index} className="h-20 w-full" />
			))}
		</div>
	);
}

export function WorkItemsPage({
	kind,
	repositoryId,
}: {
	kind: WorkItemKind;
	repositoryId?: string;
}) {
	const { activeWorkspace, activeWorkspaceId } = useActiveWorkspace();
	const [search, setSearch] = React.useState("");
	const [state, setState] = React.useState("all");
	const [page, setPage] = React.useState(1);
	const deferredSearch = React.useDeferredValue(search);
	const title = kind === "pull_request" ? "Pull requests" : "Issues";
	const singular = kind === "pull_request" ? "pull request" : "issue";
	const Icon = kind === "pull_request" ? GitPullRequestIcon : CircleDotIcon;
	const query = useQuery({
		...trpc.workItems.list.queryOptions({
			organizationId: activeWorkspaceId ?? undefined,
			kind,
			query: deferredSearch.trim() || undefined,
			state: state === "all" ? undefined : state,
			repositoryId,
			page,
			pageSize: 20,
		}),
		enabled: Boolean(activeWorkspaceId),
	});
	const pageCount = Math.max(1, Math.ceil((query.data?.total ?? 0) / 20));

	if (!activeWorkspace) {
		return (
			<Empty className="min-h-96 border">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Icon />
					</EmptyMedia>
					<EmptyTitle>Select a workspace</EmptyTitle>
					<EmptyDescription>
						{title} are scoped to the active provider workspace.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<main className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h1 className="font-heading font-medium text-2xl tracking-tight md:text-3xl">
					{title}{" "}
					<span className="text-muted-foreground text-sm italic">
						{activeWorkspace.name}
					</span>
				</h1>
				<p className="max-w-3xl text-muted-foreground text-sm">
					Trace provider state and every GitPal AI run from request to result.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{title}</CardTitle>
					<CardDescription>
						Search by title or author and filter by provider state.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<div className="flex flex-col gap-3 sm:flex-row">
						<div className="relative flex-1">
							<SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={search}
								onChange={(event) => {
									setSearch(event.target.value);
									setPage(1);
								}}
								placeholder={`Search ${title.toLowerCase()}...`}
								className="pl-9"
							/>
						</div>
						<Select
							value={state}
							onValueChange={(value) => {
								setState(value ?? "all");
								setPage(1);
							}}
						>
							<SelectTrigger className="w-full sm:w-40">
								<SelectValue placeholder="State" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="all">All states</SelectItem>
									<SelectItem value="open">Open</SelectItem>
									<SelectItem value="closed">Closed</SelectItem>
									{kind === "pull_request" ? (
										<SelectItem value="merged">Merged</SelectItem>
									) : null}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>

					{query.isLoading ? (
						<WorkItemsSkeleton />
					) : query.data?.items.length ? (
						<>
							<div className="flex flex-col gap-3 md:hidden">
								{query.data.items.map((item) => (
									<Link
										key={item.id}
										href={itemHref(kind, item.repositoryId, item.number)}
										className="rounded-2xl border p-4 transition-colors hover:bg-muted/50"
									>
										<div className="flex items-start gap-3">
											<Avatar className="size-9">
												<AvatarImage src={item.authorAvatarUrl ?? undefined} />
												<AvatarFallback>
													{initials(item.authorName ?? item.authorLogin)}
												</AvatarFallback>
											</Avatar>
											<div className="min-w-0 flex-1">
												<div className="font-medium leading-snug">
													{item.title}
												</div>
												<div className="mt-1 text-muted-foreground text-xs">
													{item.repository?.fullName} #{item.number}
												</div>
											</div>
											<Badge variant="outline">{item.state}</Badge>
										</div>
										<div className="mt-3 text-muted-foreground text-xs">
											Updated{" "}
											{formatDistanceToNow(new Date(item.updatedAt), {
												addSuffix: true,
											})}
										</div>
									</Link>
								))}
							</div>
							<div className="hidden overflow-x-auto rounded-xl border md:block">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>{singular}</TableHead>
											<TableHead>Repository</TableHead>
											<TableHead>Author</TableHead>
											<TableHead>State</TableHead>
											<TableHead>Updated</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{query.data.items.map((item) => (
											<TableRow key={item.id}>
												<TableCell>
													<Link
														href={itemHref(
															kind,
															item.repositoryId,
															item.number,
														)}
														className="font-medium hover:underline"
													>
														#{item.number} {item.title}
													</Link>
												</TableCell>
												<TableCell className="text-muted-foreground">
													{item.repository?.fullName}
												</TableCell>
												<TableCell>
													{item.authorLogin ?? item.authorName ?? "Unknown"}
												</TableCell>
												<TableCell>
													<Badge variant="outline">{item.state}</Badge>
												</TableCell>
												<TableCell className="text-muted-foreground">
													{formatDistanceToNow(new Date(item.updatedAt), {
														addSuffix: true,
													})}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
							<div className="flex items-center justify-between gap-3 text-muted-foreground text-sm">
								<span>
									Page {page} of {pageCount} · {query.data.total} total
								</span>
								<div className="flex gap-2">
									<Button
										variant="outline"
										disabled={page <= 1}
										onClick={() => setPage((value) => value - 1)}
									>
										Previous
									</Button>
									<Button
										variant="outline"
										disabled={page >= pageCount}
										onClick={() => setPage((value) => value + 1)}
									>
										Next
									</Button>
								</div>
							</div>
						</>
					) : (
						<Empty className="min-h-80">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<Icon />
								</EmptyMedia>
								<EmptyTitle>No {title.toLowerCase()} found</EmptyTitle>
								<EmptyDescription>
									Provider events and manual refreshes will populate this
									catalog.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					)}
				</CardContent>
			</Card>
		</main>
	);
}
