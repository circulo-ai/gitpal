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
import { ScrollArea } from "@gitpal/ui/components/scroll-area";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@gitpal/ui/components/select";
import { Separator } from "@gitpal/ui/components/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@gitpal/ui/components/sheet";
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
	AlertTriangleIcon,
	BellIcon,
	BotIcon,
	BriefcaseBusinessIcon,
	CreditCardIcon,
	GitPullRequestIcon,
	InfoIcon,
	RefreshCcwIcon,
	ShieldCheckIcon,
	WrenchIcon,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { queryClient, trpc } from "@/utils/trpc";
import { useActiveWorkspace } from "./active-workspace-provider";
import {
	PageHeader,
	PageSectionCard,
	PageStatCard,
	PageStatGrid,
} from "./workspace-page";

const kindFilters = [
	{ label: "All", value: "all" },
	{ label: "AI", value: "ai" },
	{ label: "Tools", value: "tool" },
	{ label: "Reviews", value: "review" },
	{ label: "Webhooks", value: "webhook" },
	{ label: "Billing", value: "billing" },
	{ label: "Admin", value: "admin" },
	{ label: "Jobs", value: "job" },
] as const;

const rangeOptions = [
	{ label: "Last 24 hours", value: "1" },
	{ label: "Last 7 days", value: "7" },
	{ label: "Last 14 days", value: "14" },
	{ label: "Last 30 days", value: "30" },
] as const;

const severityOptions = [
	{ label: "All severities", value: "all" },
	{ label: "Info", value: "info" },
	{ label: "Success", value: "success" },
	{ label: "Warning", value: "warning" },
	{ label: "Error", value: "error" },
] as const;

type KindFilter = (typeof kindFilters)[number]["value"];
type ObservabilityKind = Exclude<KindFilter, "all">;
type ObservabilitySeverity = "info" | "success" | "warning" | "error";

type ObservabilityTimelineEvent = {
	id: string;
	timestamp: string;
	kind: ObservabilityKind;
	action: string;
	status: string;
	severity: ObservabilitySeverity;
	title: string;
	body: string | null;
	sourceType: string | null;
	sourceId: string | null;
	traceId: string | null;
	durationMs: number | null;
	costCents: number | null;
	repository: {
		id: string;
		fullName: string;
		htmlUrl: string;
	} | null;
	pullRequest: {
		id: string;
		number: number;
		title: string;
		htmlUrl: string;
	} | null;
	issue: {
		id: string;
		number: number;
		title: string;
		htmlUrl: string;
	} | null;
	metadata: Record<string, unknown>;
};

type ObservabilityDetailSource = {
	title: string;
	subtitle: string | null;
	fields: Array<{
		label: string;
		value: string | null;
	}>;
	raw: Record<string, unknown>;
};

type ObservabilityDetailInput = {
	id: string;
	kind?: ObservabilityKind;
	sourceType?: string | null;
	sourceId?: string | null;
	traceId?: string | null;
	repositoryId?: string | null;
	pullRequestId?: string | null;
	issueId?: string | null;
};

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
						: kind === "admin"
							? ShieldCheckIcon
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

function buildDetailInput(
	event: ObservabilityTimelineEvent | null,
): ObservabilityDetailInput {
	if (!event) {
		return {
			id: "placeholder",
			sourceType: null,
			sourceId: null,
			traceId: null,
			repositoryId: null,
			pullRequestId: null,
			issueId: null,
		};
	}

	return {
		id: event.id,
		kind: event.kind,
		sourceType: event.sourceType,
		sourceId: event.sourceId,
		traceId: event.traceId,
		repositoryId: event.repository?.id ?? null,
		pullRequestId: event.pullRequest?.id ?? null,
		issueId: event.issue?.id ?? null,
	};
}

function hasRawPayload(raw: Record<string, unknown>) {
	return Object.keys(raw).length > 0;
}

function formatTimelineTimestamp(timestamp: string) {
	return format(new Date(timestamp), "MMM d, HH:mm:ss");
}

function TimelineEventCard({
	event,
	emphasis,
}: {
	event: ObservabilityTimelineEvent;
	emphasis?: "normal" | "error";
}) {
	return (
		<div
			className={
				emphasis === "error"
					? "rounded-xl border border-destructive/20 bg-destructive/5 p-4"
					: "rounded-xl border border-border/60 bg-background p-4"
			}
		>
			<div className="flex items-start gap-3">
				<div
					className={
						emphasis === "error"
							? "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-destructive/20 bg-destructive/10 text-destructive"
							: "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/40"
					}
				>
					{emphasis === "error" ? (
						<AlertTriangleIcon className="size-4" />
					) : (
						<EventIcon kind={event.kind} />
					)}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<div className="font-medium">{event.title}</div>
						<Badge variant="outline">{event.kind}</Badge>
						<Badge variant={severityBadgeVariant(event.severity)}>
							{event.status}
						</Badge>
					</div>
					<p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
						{event.body ?? event.traceId ?? event.sourceId ?? "-"}
					</p>
					<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground text-xs">
						<span className="tabular-nums">
							{formatTimelineTimestamp(event.timestamp)}
						</span>
						<span>Duration {formatDuration(event.durationMs)}</span>
						<span>
							Cost {event.costCents !== null ? formatUsd(event.costCents) : "-"}
						</span>
						{event.sourceType ? (
							<span className="font-mono">
								{event.sourceType}
								{event.sourceId ? ` · ${event.sourceId}` : ""}
							</span>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}

function TimelineSection({
	title,
	description,
	events,
	emptyTitle,
	emptyDescription,
	emphasis,
}: {
	title: string;
	description: string;
	events: ObservabilityTimelineEvent[];
	emptyTitle: string;
	emptyDescription: string;
	emphasis?: "normal" | "error";
}) {
	return (
		<Card
			className={
				emphasis === "error"
					? "border-destructive/20 bg-destructive/5"
					: "border-border/60"
			}
		>
			<CardHeader className="pb-3">
				<CardTitle className="text-lg">{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				{events.length > 0 ? (
					<div className="flex flex-col gap-3">
						{events.map((event) => (
							<TimelineEventCard
								key={event.id}
								event={event}
								emphasis={emphasis}
							/>
						))}
					</div>
				) : (
					<Empty className="min-h-40 border border-border/60 border-dashed bg-background">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								{emphasis === "error" ? <AlertTriangleIcon /> : <InfoIcon />}
							</EmptyMedia>
							<EmptyTitle>{emptyTitle}</EmptyTitle>
							<EmptyDescription>{emptyDescription}</EmptyDescription>
						</EmptyHeader>
					</Empty>
				)}
			</CardContent>
		</Card>
	);
}

function DetailFieldsCard({
	source,
}: {
	source: ObservabilityDetailSource | null;
}) {
	if (!source) {
		return (
			<Card className="border-border/60">
				<CardContent className="pt-6 text-muted-foreground text-sm">
					No source data was returned for this event.
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="border-border/60">
			<CardHeader className="space-y-2">
				<CardTitle className="text-lg">{source.title}</CardTitle>
				{source.subtitle ? (
					<CardDescription className="text-sm">
						{source.subtitle}
					</CardDescription>
				) : null}
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{source.fields.length > 0 ? (
					<div className="grid gap-3 md:grid-cols-2">
						{source.fields.map((field) => (
							<div
								key={`${field.label}:${field.value}`}
								className="rounded-lg border border-border/60 bg-muted/20 p-3"
							>
								<div className="text-muted-foreground text-xs uppercase tracking-wide">
									{field.label}
								</div>
								<div className="mt-1 whitespace-pre-wrap break-words font-mono text-xs leading-5">
									{field.value}
								</div>
							</div>
						))}
					</div>
				) : null}
				<Separator />
				<div className="flex flex-col gap-2">
					<div className="font-medium text-sm">Raw payload</div>
					{hasRawPayload(source.raw) ? (
						<details className="rounded-lg border border-border/60 bg-background">
							<summary className="cursor-pointer select-none px-4 py-3 font-medium text-sm">
								View JSON
							</summary>
							<div className="border-border/60 border-t p-4">
								<pre className="max-h-96 overflow-auto rounded-lg bg-muted/30 p-4 font-mono text-xs leading-5">
									{JSON.stringify(source.raw, null, 2)}
								</pre>
							</div>
						</details>
					) : (
						<div className="rounded-lg border border-border/60 border-dashed bg-background px-4 py-3 text-muted-foreground text-sm">
							No raw payload was captured for this source event.
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

function ObservabilityDetailSheet({
	open,
	onOpenChange,
	event,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	event: ObservabilityTimelineEvent | null;
}) {
	const detailInput = React.useMemo(() => buildDetailInput(event), [event]);
	const detailQuery = useQuery({
		...trpc.observability.detail.queryOptions(detailInput),
		enabled: open && Boolean(event),
	});

	const source = detailQuery.data?.source ?? null;
	const timeline = (detailQuery.data?.timeline ??
		[]) as ObservabilityTimelineEvent[];
	const errorTimeline = (detailQuery.data?.errorTimeline ??
		[]) as ObservabilityTimelineEvent[];

	return (
		<Sheet
			open={open}
			onOpenChange={(nextOpen) => {
				onOpenChange(nextOpen);
			}}
		>
			<SheetContent className="sm:!max-w-4xl w-full p-0" side="right">
				<div className="flex h-full min-h-0 flex-col">
					<SheetHeader className="border-border/60 border-b bg-muted/30 px-6 py-5">
						<div className="flex items-start justify-between gap-4">
							<div className="min-w-0">
								<SheetTitle className="truncate">
									{event?.title ?? "Observability details"}
								</SheetTitle>
								<SheetDescription className="mt-1 line-clamp-2">
									{event?.body ??
										"Inspect the exact source event and failure timeline."}
								</SheetDescription>
								{event ? (
									<div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
										{event.repository ? (
											<span className="rounded-full border border-border/60 bg-background px-2.5 py-1 font-medium text-foreground">
												{event.repository.fullName}
											</span>
										) : null}
										{event.pullRequest && event.repository ? (
											<Link
												href={`/repositories/${event.repository.id}/pull-requests/${event.pullRequest.number}`}
												className="rounded-full border border-border/60 bg-background px-2.5 py-1 font-medium text-foreground transition-colors hover:bg-muted/40"
											>
												PR #{event.pullRequest.number}
											</Link>
										) : null}
										{event.issue && event.repository ? (
											<Link
												href={`/repositories/${event.repository.id}/issues/${event.issue.number}`}
												className="rounded-full border border-border/60 bg-background px-2.5 py-1 font-medium text-foreground transition-colors hover:bg-muted/40"
											>
												Issue #{event.issue.number}
											</Link>
										) : null}
										<span className="rounded-full border border-border/60 bg-background px-2.5 py-1 font-medium text-foreground">
											Source {event.sourceType ?? "event"}
										</span>
										<span className="rounded-full border border-border/60 bg-background px-2.5 py-1 font-medium text-foreground">
											Trace {event.traceId ?? "-"}
										</span>
										<span className="rounded-full border border-border/60 bg-background px-2.5 py-1 font-medium text-foreground">
											{formatTimelineTimestamp(event.timestamp)}
										</span>
									</div>
								) : null}
							</div>
							{event ? (
								<div className="flex flex-wrap items-center justify-end gap-2">
									<Badge variant="outline">{event.kind}</Badge>
									<Badge variant={severityBadgeVariant(event.severity)}>
										{event.status}
									</Badge>
								</div>
							) : null}
						</div>
					</SheetHeader>
					<ScrollArea className="min-h-0 flex-1">
						<div className="flex flex-col gap-6 p-6">
							{detailQuery.isLoading ? (
								<div className="flex flex-col gap-4">
									<Skeleton className="h-40 w-full" />
									<Skeleton className="h-80 w-full" />
									<Skeleton className="h-72 w-full" />
								</div>
							) : detailQuery.isError ? (
								<Card className="border-destructive/20 bg-destructive/5">
									<CardContent className="pt-6">
										<Empty className="min-h-52">
											<EmptyHeader>
												<EmptyMedia variant="icon">
													<AlertTriangleIcon />
												</EmptyMedia>
												<EmptyTitle>Failed to load details</EmptyTitle>
												<EmptyDescription>
													We could not resolve the source event for this row.
												</EmptyDescription>
											</EmptyHeader>
										</Empty>
									</CardContent>
								</Card>
							) : detailQuery.data ? (
								<>
									<DetailFieldsCard source={source} />
									<TimelineSection
										title="Trace timeline"
										description="Chronological view of the source event and its related records."
										events={timeline}
										emptyTitle="No related events"
										emptyDescription="This source event did not produce any related trace records."
									/>
									<TimelineSection
										title="Failure timeline"
										description="Only the events tied to the failure path are shown here."
										events={errorTimeline}
										emptyTitle="No failure events"
										emptyDescription="This trace did not capture a failure path."
										emphasis="error"
									/>
								</>
							) : (
								<Card className="border-border/60">
									<CardContent className="pt-6">
										<Empty className="min-h-52">
											<EmptyHeader>
												<EmptyMedia variant="icon">
													<InfoIcon />
												</EmptyMedia>
												<EmptyTitle>Select a row</EmptyTitle>
												<EmptyDescription>
													Choose a timeline row to inspect the exact source
													event.
												</EmptyDescription>
											</EmptyHeader>
										</Empty>
									</CardContent>
								</Card>
							)}
						</div>
					</ScrollArea>
				</div>
			</SheetContent>
		</Sheet>
	);
}

export function ObservabilityPage() {
	const { activeWorkspace, activeWorkspaceId } = useActiveWorkspace();
	const [kind, setKind] = React.useState<KindFilter>("all");
	const [days, setDays] = React.useState("14");
	const [repositoryId, setRepositoryId] = React.useState("all");
	const [severity, setSeverity] =
		React.useState<(typeof severityOptions)[number]["value"]>("all");
	const [pullRequestNumber, setPullRequestNumber] = React.useState("");
	const [issueNumber, setIssueNumber] = React.useState("");
	const [user, setUser] = React.useState("");
	const [sourceId, setSourceId] = React.useState("");
	const [detailOpen, setDetailOpen] = React.useState(false);
	const [selectedEvent, setSelectedEvent] =
		React.useState<ObservabilityTimelineEvent | null>(null);
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
			severity,
			pullRequestNumber: Number(pullRequestNumber) || undefined,
			issueNumber: Number(issueNumber) || undefined,
			user: user.trim() || undefined,
			sourceId: sourceId.trim() || undefined,
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
	const events = (timelineQuery.data?.events ??
		[]) as ObservabilityTimelineEvent[];
	const openDetails = (event: ObservabilityTimelineEvent) => {
		setSelectedEvent(event);
		setDetailOpen(true);
	};
	const handleDetailOpenChange = (open: boolean) => {
		setDetailOpen(open);
		if (!open) {
			setSelectedEvent(null);
		}
	};

	if (!activeWorkspace) {
		return (
			<main className="flex flex-col gap-6">
				<PageHeader
					eyebrow="Observability"
					title="System activity and AI traces"
					description="Trace AI calls, tools, jobs, and webhooks once a synced workspace is active."
				/>
				<PageSectionCard
					title="No active workspace"
					description="Sync provider access and pick a workspace."
					contentClassName="pt-0"
				>
					<Empty className="min-h-80">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<ActivityIcon />
							</EmptyMedia>
							<EmptyTitle>Select a workspace</EmptyTitle>
							<EmptyDescription>
								Observability is scoped to the active provider workspace so the
								event timeline stays relevant and readable.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				</PageSectionCard>
			</main>
		);
	}

	return (
		<main className="flex flex-col gap-6">
			<PageHeader
				eyebrow="Observability"
				title={`${activeWorkspace.name} activity timeline`}
				description={`Trace AI calls, tool activity, webhooks, billing, admin actions, jobs, and inbox events across ${activeWorkspace.name}.`}
				badges={
					<Badge variant="outline">
						Updated{" "}
						{timelineQuery.data?.updatedAt
							? format(new Date(timelineQuery.data.updatedAt), "MMM d, HH:mm")
							: format(now, "MMM d, HH:mm")}
					</Badge>
				}
			/>

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
			<div className="grid gap-2 rounded-xl border border-border/60 bg-background p-3 sm:grid-cols-2 xl:grid-cols-5">
				<Select
					items={severityOptions}
					value={severity}
					onValueChange={(value) => setSeverity(value ?? "all")}
				>
					<SelectTrigger aria-label="Severity filter" className="w-full">
						<SelectValue placeholder="Severity" />
					</SelectTrigger>
					<SelectContent>
						{severityOptions.map((item) => (
							<SelectItem key={item.value} value={item.value}>
								{item.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Input
					name="pullRequestNumber"
					type="number"
					inputMode="numeric"
					autoComplete="off"
					aria-label="Pull request number"
					placeholder="Pull request #…"
					value={pullRequestNumber}
					onChange={(event) => setPullRequestNumber(event.target.value)}
				/>
				<Input
					name="issueNumber"
					type="number"
					inputMode="numeric"
					autoComplete="off"
					aria-label="Issue number"
					placeholder="Issue #…"
					value={issueNumber}
					onChange={(event) => setIssueNumber(event.target.value)}
				/>
				<Input
					name="userFilter"
					autoComplete="off"
					aria-label="User filter"
					placeholder="User or actor…"
					value={user}
					onChange={(event) => setUser(event.target.value)}
				/>
				<Input
					name="sourceIdFilter"
					autoComplete="off"
					spellCheck={false}
					aria-label="Source ID filter"
					placeholder="Source ID…"
					value={sourceId}
					onChange={(event) => setSourceId(event.target.value)}
				/>
			</div>

			<PageStatGrid>
				<PageStatCard
					label="Total events"
					value={stats ? stats.totalEvents : "0"}
					meta="All events inside the current filter range."
				/>
				<PageStatCard
					label="Failures"
					value={stats ? stats.failedEvents : "0"}
					meta="Events that completed with warnings or errors."
				/>
				<PageStatCard
					label="Running"
					value={stats ? stats.runningEvents : "0"}
					meta="In-flight jobs and long-running traces."
				/>
				<PageStatCard
					label="AI cost"
					value={stats ? formatUsd(stats.aiCostCents) : "$0.00"}
					meta="Cloud-routed AI cost inside the selected range."
				/>
			</PageStatGrid>

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
														{event.costCents !== null
															? formatUsd(event.costCents)
															: "-"}
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
												<div className="mt-4 flex justify-end">
													<Button
														type="button"
														variant="outline"
														size="sm"
														className="h-8 gap-2"
														onClick={() => openDetails(event)}
													>
														<InfoIcon className="size-4" />
														Details
													</Button>
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
											<TableHead className="text-right">Details</TableHead>
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
													{event.costCents !== null
														? formatUsd(event.costCents)
														: "-"}
												</TableCell>
												<TableCell>
													<div className="whitespace-nowrap text-sm">
														{formatDistanceToNow(new Date(event.timestamp), {
															addSuffix: true,
														})}
													</div>
												</TableCell>
												<TableCell className="text-right">
													<Button
														type="button"
														variant="outline"
														size="sm"
														className="h-8 gap-2"
														onClick={() => openDetails(event)}
													>
														<InfoIcon className="size-4" />
														Details
													</Button>
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
			<ObservabilityDetailSheet
				open={detailOpen}
				onOpenChange={handleDetailOpenChange}
				event={selectedEvent}
			/>
		</main>
	);
}
