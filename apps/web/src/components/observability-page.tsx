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
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@gitpal/ui/components/toggle-group";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow, subDays } from "date-fns";
import {
	ActivityIcon,
	BellIcon,
	BotIcon,
	BriefcaseBusinessIcon,
	CreditCardIcon,
	GitPullRequestIcon,
	RefreshCcwIcon,
	WrenchIcon,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { queryClient, trpc } from "@/utils/trpc";
import { useActiveWorkspace } from "./active-workspace-provider";

const kindFilters = [
	{ label: "All", value: "all" },
	{ label: "AI", value: "ai" },
	{ label: "Tools", value: "tool" },
	{ label: "Reviews", value: "review" },
	{ label: "Webhooks", value: "webhook" },
	{ label: "Billing", value: "billing" },
	{ label: "Jobs", value: "job" },
] as const;

const rangeOptions = [
	{ label: "Last 24 hours", value: "1" },
	{ label: "Last 7 days", value: "7" },
	{ label: "Last 14 days", value: "14" },
	{ label: "Last 30 days", value: "30" },
] as const;

type KindFilter = (typeof kindFilters)[number]["value"];

function formatUsd(cents: number) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
	}).format(cents / 100);
}

function formatDuration(durationMs: number | null) {
	if (durationMs === null) {
		return "-";
	}

	if (durationMs < 1000) {
		return `${durationMs}ms`;
	}

	const seconds = durationMs / 1000;
	if (seconds < 60) {
		return `${Math.round(seconds * 10) / 10}s`;
	}

	return `${Math.round((seconds / 60) * 10) / 10}m`;
}

function EventIcon({ kind }: { kind: string }) {
	const Icon =
		kind === "ai"
			? BotIcon
			: kind === "tool"
				? WrenchIcon
				: kind === "review"
					? GitPullRequestIcon
					: kind === "webhook"
						? ActivityIcon
						: kind === "billing"
							? CreditCardIcon
							: kind === "notification"
								? BellIcon
								: BriefcaseBusinessIcon;

	return <Icon className="text-muted-foreground" />;
}

function severityBadgeVariant(severity: string) {
	if (severity === "error") {
		return "destructive" as const;
	}

	if (severity === "success") {
		return "secondary" as const;
	}

	return "outline" as const;
}

export function ObservabilityPage() {
	const { activeWorkspace, activeWorkspaceId } = useActiveWorkspace();
	const [kind, setKind] = React.useState<KindFilter>("all");
	const [days, setDays] = React.useState("14");
	const [repositoryId, setRepositoryId] = React.useState("all");
	const now = React.useMemo(() => new Date(), []);
	const dateRange = React.useMemo(() => {
		const to = new Date();
		const from = subDays(to, Number(days));
		return {
			from: from.toISOString(),
			to: to.toISOString(),
		};
	}, [days]);

	const timelineQuery = useQuery({
		...trpc.observability.timeline.queryOptions({
			organizationId: activeWorkspaceId ?? undefined,
			repositoryId: repositoryId === "all" ? undefined : repositoryId,
			kind,
			dateRange,
			limit: 160,
		}),
		enabled: Boolean(activeWorkspaceId),
	});

	const repositoryItems = [
		{ label: "All repositories", value: "all" },
		...(timelineQuery.data?.repositories.map((repository) => ({
			label: repository.fullName,
			value: repository.id,
		})) ?? []),
	];

	const stats = timelineQuery.data?.stats;
	const events = timelineQuery.data?.events ?? [];

	if (!activeWorkspace) {
		return (
			<main className="flex flex-col gap-6">
				<div className="flex flex-col gap-1">
					<h1 className="font-heading font-medium text-2xl tracking-tight md:text-3xl">
						Observability
					</h1>
				</div>
				<Card>
					<CardContent className="pt-6">
						<Empty className="min-h-96">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<ActivityIcon />
								</EmptyMedia>
								<EmptyTitle>No active workspace</EmptyTitle>
								<EmptyDescription>
									Sync provider access and pick a workspace.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					</CardContent>
				</Card>
			</main>
		);
	}

	return (
		<main className="flex flex-col gap-6">
			<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
				<div className="flex flex-col gap-1">
					<h1 className="font-heading font-medium text-2xl tracking-tight md:text-3xl">
						Observability
					</h1>
					<p className="max-w-3xl text-muted-foreground text-sm">
						Trace AI calls, tool activity, webhooks, billing, jobs, and inbox
						events across {activeWorkspace.name}.
					</p>
				</div>
				<Badge variant="outline">
					Updated{" "}
					{timelineQuery.data?.updatedAt
						? format(new Date(timelineQuery.data.updatedAt), "MMM d, HH:mm")
						: format(now, "MMM d, HH:mm")}
				</Badge>
			</div>

			<div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 xl:flex-row xl:items-center xl:justify-between">
				<div className="flex flex-wrap items-center gap-2">
					<ToggleGroup
						value={[kind]}
						onValueChange={(value) => {
							const nextKind = value[0] as KindFilter | undefined;
							if (nextKind) {
								setKind(nextKind);
							}
						}}
						variant="outline"
						size="sm"
						spacing={0}
						className="max-w-full flex-wrap bg-background"
						aria-label="Observability event kind"
					>
						{kindFilters.map((item) => (
							<ToggleGroupItem key={item.value} value={item.value}>
								{item.label}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</div>
				<div className="flex flex-col gap-2 md:flex-row md:items-center">
					<Select
						items={repositoryItems}
						value={repositoryId}
						onValueChange={(value) => {
							setRepositoryId(value ?? "all");
						}}
					>
						<SelectTrigger className="w-full md:w-72">
							<SelectValue placeholder="Repository" />
						</SelectTrigger>
						<SelectContent align="end">
							<SelectGroup>
								{repositoryItems.map((item) => (
									<SelectItem key={item.value} value={item.value}>
										{item.label}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
					<Select
						items={rangeOptions}
						value={days}
						onValueChange={(value) => {
							setDays(value ?? "14");
						}}
					>
						<SelectTrigger className="w-full md:w-44">
							<SelectValue placeholder="Range" />
						</SelectTrigger>
						<SelectContent align="end">
							<SelectGroup>
								{rangeOptions.map((item) => (
									<SelectItem key={item.value} value={item.value}>
										{item.label}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
					<Button
						variant="outline"
						size="icon"
						aria-label="Refresh observability"
						onClick={() =>
							queryClient.invalidateQueries({
								queryKey: trpc.observability.timeline.queryKey(),
							})
						}
					>
						<RefreshCcwIcon />
					</Button>
				</div>
			</div>

			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				<Card size="sm">
					<CardHeader>
						<CardDescription>Total events</CardDescription>
						<CardTitle className="text-3xl tabular-nums">
							{stats ? stats.totalEvents : "0"}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card size="sm">
					<CardHeader>
						<CardDescription>Failures</CardDescription>
						<CardTitle className="text-3xl tabular-nums">
							{stats ? stats.failedEvents : "0"}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card size="sm">
					<CardHeader>
						<CardDescription>Running</CardDescription>
						<CardTitle className="text-3xl tabular-nums">
							{stats ? stats.runningEvents : "0"}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card size="sm">
					<CardHeader>
						<CardDescription>AI cost</CardDescription>
						<CardTitle className="text-3xl tabular-nums">
							{stats ? formatUsd(stats.aiCostCents) : "$0.00"}
						</CardTitle>
					</CardHeader>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Event timeline</CardTitle>
					<CardDescription>
						{timelineQuery.data
							? `${format(new Date(timelineQuery.data.filters.from), "MMM d, HH:mm")} to ${format(
									new Date(timelineQuery.data.filters.to),
									"MMM d, HH:mm",
								)}`
							: "Loading"}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{timelineQuery.isLoading ? (
						<div className="flex flex-col gap-3">
							{Array.from({ length: 8 }).map((_, index) => (
								<Skeleton key={index} className="h-14 w-full" />
							))}
						</div>
					) : events.length > 0 ? (
						<div className="flex flex-col gap-3">
							<div className="flex flex-col gap-3 lg:hidden">
								{events.map((event) => (
									<div
										key={event.id}
										className="rounded-xl border border-border/60 bg-background p-4"
									>
										<div className="flex items-start gap-3">
											<div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40">
												<EventIcon kind={event.kind} />
											</div>
											<div className="min-w-0 flex-1">
												<div className="flex flex-wrap items-center gap-2">
													{event.pullRequest && event.repository ? (
														<Link
															href={`/repositories/${event.repository.id}/pull-requests/${event.pullRequest.number}`}
															className="font-medium hover:underline"
														>
															{event.title}
														</Link>
													) : event.issue && event.repository ? (
														<Link
															href={`/repositories/${event.repository.id}/issues/${event.issue.number}`}
															className="font-medium hover:underline"
														>
															{event.title}
														</Link>
													) : (
														<span className="font-medium">{event.title}</span>
													)}
													<Badge variant="outline">{event.kind}</Badge>
													<Badge variant={severityBadgeVariant(event.severity)}>
														{event.status}
													</Badge>
												</div>
												<p className="mt-2 line-clamp-3 text-muted-foreground text-sm">
													{event.body ??
														event.repository?.fullName ??
														event.pullRequest?.title ??
														"-"}
												</p>
												<div className="mt-3 grid gap-2 text-muted-foreground text-xs sm:grid-cols-2">
													<div>
														<span className="font-medium text-foreground">
															Duration
														</span>{" "}
														{formatDuration(event.durationMs)}
													</div>
													<div>
														<span className="font-medium text-foreground">
															Cost
														</span>{" "}
														{event.costCents ? formatUsd(event.costCents) : "-"}
													</div>
													<div className="min-w-0">
														<span className="font-medium text-foreground">
															Source
														</span>{" "}
														<span className="font-mono">
															{event.sourceType ?? "event"}
														</span>
													</div>
													<div>
														{formatDistanceToNow(new Date(event.timestamp), {
															addSuffix: true,
														})}
													</div>
												</div>
											</div>
										</div>
									</div>
								))}
							</div>
							<div className="hidden overflow-x-auto rounded-xl border border-border/60 lg:block">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Event</TableHead>
											<TableHead>Status</TableHead>
											<TableHead>Source</TableHead>
											<TableHead>Duration</TableHead>
											<TableHead>Cost</TableHead>
											<TableHead>Time</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{events.map((event) => (
											<TableRow key={event.id}>
												<TableCell className="min-w-80 whitespace-normal">
													<div className="flex items-start gap-3">
														<div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40">
															<EventIcon kind={event.kind} />
														</div>
														<div className="min-w-0">
															<div className="flex flex-wrap items-center gap-2">
																{event.pullRequest && event.repository ? (
																	<Link
																		href={`/repositories/${event.repository.id}/pull-requests/${event.pullRequest.number}`}
																		className="font-medium hover:underline"
																	>
																		{event.title}
																	</Link>
																) : event.issue && event.repository ? (
																	<Link
																		href={`/repositories/${event.repository.id}/issues/${event.issue.number}`}
																		className="font-medium hover:underline"
																	>
																		{event.title}
																	</Link>
																) : (
																	<span className="font-medium">
																		{event.title}
																	</span>
																)}
																<Badge variant="outline">{event.kind}</Badge>
															</div>
															<div className="mt-1 line-clamp-2 text-muted-foreground text-xs">
																{event.body ??
																	event.repository?.fullName ??
																	event.pullRequest?.title ??
																	"-"}
															</div>
														</div>
													</div>
												</TableCell>
												<TableCell>
													<Badge variant={severityBadgeVariant(event.severity)}>
														{event.status}
													</Badge>
												</TableCell>
												<TableCell className="max-w-64">
													<div className="truncate font-mono text-xs">
														{event.sourceType ?? "event"}
													</div>
													<div
														className="truncate text-muted-foreground text-xs"
														title={event.sourceId ?? undefined}
													>
														{event.sourceId ?? event.traceId ?? "-"}
													</div>
												</TableCell>
												<TableCell>
													{formatDuration(event.durationMs)}
												</TableCell>
												<TableCell>
													{event.costCents ? formatUsd(event.costCents) : "-"}
												</TableCell>
												<TableCell>
													<div className="whitespace-nowrap text-sm">
														{formatDistanceToNow(new Date(event.timestamp), {
															addSuffix: true,
														})}
													</div>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						</div>
					) : (
						<Empty className="min-h-72">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<ActivityIcon />
								</EmptyMedia>
								<EmptyTitle>No events found</EmptyTitle>
								<EmptyDescription>
									Adjust the filters or expand the time range.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					)}
				</CardContent>
			</Card>
		</main>
	);
}
