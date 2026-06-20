"use client";

import type { AppRouter } from "@gitpal/api/routers/index";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@gitpal/ui/components/accordion";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@gitpal/ui/components/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@gitpal/ui/components/alert-dialog";
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@gitpal/ui/components/dropdown-menu";
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
import { Separator } from "@gitpal/ui/components/separator";
import { Skeleton } from "@gitpal/ui/components/skeleton";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@gitpal/ui/components/tabs";
import { cn } from "@gitpal/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { format, formatDistanceToNow } from "date-fns";
import {
	AlertCircleIcon,
	BotIcon,
	CheckCircle2Icon,
	CircleDotIcon,
	Clock3Icon,
	CopyIcon,
	ExternalLinkIcon,
	GitBranchIcon,
	GitPullRequestIcon,
	LoaderCircleIcon,
	MoreHorizontalIcon,
	PlayIcon,
	RefreshCcwIcon,
	RotateCcwIcon,
	ShieldCheckIcon,
	XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { queryClient, trpc } from "@/utils/trpc";
import { useActiveWorkspace } from "./active-workspace-provider";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type Detail = RouterOutputs["workItems"]["detail"];
type Run = Detail["runs"][number];
type WorkItemKind = "pull_request" | "issue";
type ConfirmAction = { type: "run" | "retry"; runId?: string } | null;

const ACTIVE_STATUSES = new Set(["queued", "running"]);

function toRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function stringArray(value: unknown) {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function initials(value: string | null | undefined) {
	return (value || "GitPal")
		.split(/\s+/)
		.map((part) => part[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

function durationLabel(milliseconds: number | null) {
	if (milliseconds === null) return "—";
	if (milliseconds < 1000) return `${milliseconds} ms`;
	if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)} s`;
	return `${Math.floor(milliseconds / 60_000)}m ${Math.round((milliseconds % 60_000) / 1000)}s`;
}

function runDuration(run: Run) {
	if (!run.startedAt) return null;
	const end = run.completedAt ? new Date(run.completedAt) : new Date();
	return Math.max(0, end.getTime() - new Date(run.startedAt).getTime());
}

function statusIcon(status: string) {
	if (status === "completed" || status === "succeeded" || status === "passed")
		return CheckCircle2Icon;
	if (status === "failed" || status === "error") return XCircleIcon;
	if (status === "running" || status === "queued") return LoaderCircleIcon;
	return Clock3Icon;
}

function StatusBadge({ status }: { status: string }) {
	const Icon = statusIcon(status);
	return (
		<Badge
			variant={
				status === "failed"
					? "destructive"
					: status === "completed"
						? "secondary"
						: "outline"
			}
		>
			<Icon
				data-icon="inline-start"
				className={cn(status === "running" && "motion-safe:animate-spin")}
			/>
			{status.replaceAll("_", " ")}
		</Badge>
	);
}

function CopyButton({ value, label }: { value: string; label: string }) {
	return (
		<Button
			variant="ghost"
			size="icon-sm"
			aria-label={`Copy ${label}`}
			onClick={async () => {
				await navigator.clipboard.writeText(value);
				toast.success(`${label} copied.`);
			}}
		>
			<CopyIcon />
		</Button>
	);
}

function DetailSkeleton() {
	return (
		<div className="flex flex-col gap-4">
			<Skeleton className="h-28 w-full" />
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
				<Skeleton className="h-[38rem] w-full" />
				<Skeleton className="h-[28rem] w-full" />
			</div>
		</div>
	);
}

function RunTrace({ run }: { run: Run }) {
	const fallbackSteps =
		run.steps.length === 0
			? run.events.map((event, index) => ({
					id: event.id,
					stepKey: event.action,
					position: index + 1,
					status: event.status,
					title: event.title,
					summary: event.body,
					details: {},
					errorCode: null,
					startedAt: event.occurredAt,
					completedAt: event.occurredAt,
					durationMs: event.durationMs,
					attempt: 1,
					reviewRunId: run.id,
					parentStepId: null,
					createdAt: event.occurredAt,
					updatedAt: event.occurredAt,
				}))
			: run.steps;

	return (
		<div className="flex flex-col gap-4">
			{run.steps.length === 0 ? (
				<Alert>
					<AlertCircleIcon />
					<AlertTitle>Partial historical trace</AlertTitle>
					<AlertDescription>
						This run predates structured step tracing. Available GitPal events
						are shown below.
					</AlertDescription>
				</Alert>
			) : null}
			<Accordion
				multiple
				defaultValue={fallbackSteps
					.filter(
						(step) => step.status === "running" || step.status === "failed",
					)
					.map((step) => step.id)}
			>
				{fallbackSteps.map((step) => {
					const Icon = statusIcon(step.status);
					const details = toRecord(step.details);
					return (
						<AccordionItem key={step.id} value={step.id}>
							<AccordionTrigger className="no-underline hover:no-underline">
								<div className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center">
									<Icon
										className={cn(
											"mt-0.5 size-5",
											step.status === "running" && "motion-safe:animate-spin",
											step.status === "failed"
												? "text-destructive"
												: "text-muted-foreground",
										)}
									/>
									<div className="min-w-0">
										<div className="font-medium">
											{step.position}. {step.title}
										</div>
										<div className="truncate text-muted-foreground text-xs">
											{step.summary || "No additional detail"}
										</div>
									</div>
									<span className="col-start-2 text-muted-foreground text-xs sm:col-auto">
										{step.startedAt
											? format(new Date(step.startedAt), "MMM d, HH:mm:ss")
											: "Pending"}
									</span>
									<span className="text-muted-foreground text-xs tabular-nums">
										{durationLabel(step.durationMs)}
									</span>
								</div>
							</AccordionTrigger>
							<AccordionContent>
								<div className="grid gap-3 rounded-xl bg-muted/50 p-3 sm:grid-cols-2">
									<div>
										<div className="text-muted-foreground text-xs">
											Step key
										</div>
										<div className="font-mono text-xs">{step.stepKey}</div>
									</div>
									<div>
										<div className="text-muted-foreground text-xs">Attempt</div>
										<div>{step.attempt}</div>
									</div>
									{Object.entries(details).map(([key, value]) => (
										<div key={key}>
											<div className="text-muted-foreground text-xs">
												{key.replaceAll(/([A-Z])/g, " $1")}
											</div>
											<div className="break-words text-sm">
												{Array.isArray(value)
													? value.join(", ")
													: String(value)}
											</div>
										</div>
									))}
								</div>
							</AccordionContent>
						</AccordionItem>
					);
				})}
			</Accordion>
		</div>
	);
}

function UsageSummary({ run }: { run: Run }) {
	const totalTokens = run.generations.reduce(
		(sum, generation) => sum + generation.totalTokens,
		0,
	);
	const costCents = run.generations.reduce(
		(sum, generation) => sum + (generation.costCents ?? 0),
		0,
	);
	return (
		<div className="grid gap-3 sm:grid-cols-3">
			<div>
				<div className="text-muted-foreground text-xs">Model</div>
				<div className="truncate font-medium">
					{run.generations[0]?.modelId ?? run.modelId ?? "Not recorded"}
				</div>
			</div>
			<div>
				<div className="text-muted-foreground text-xs">Total tokens</div>
				<div className="font-medium tabular-nums">
					{totalTokens.toLocaleString()}
				</div>
			</div>
			<div>
				<div className="text-muted-foreground text-xs">Estimated cost</div>
				<div className="font-medium tabular-nums">
					${(costCents / 100).toFixed(4)}
				</div>
			</div>
		</div>
	);
}

function ContextRail({
	detail,
	run,
	onRetry,
	retryDisabled,
}: {
	detail: Detail;
	run: Run | null;
	onRetry: (id: string) => void;
	retryDisabled: boolean;
}) {
	const item = detail.item;
	return (
		<aside className="flex flex-col gap-4 xl:sticky xl:top-4 xl:self-start">
			<Card size="sm">
				<CardHeader>
					<CardTitle>
						{detail.kind === "pull_request" ? "PR" : "Issue"} details
					</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3 text-sm">
					<div className="flex items-center justify-between gap-3">
						<span className="text-muted-foreground">Status</span>
						<StatusBadge status={item.state} />
					</div>
					<div className="flex items-center justify-between gap-3">
						<span className="text-muted-foreground">Author</span>
						<span className="truncate">
							{item.authorLogin ?? item.authorName ?? "Unknown"}
						</span>
					</div>
					<div className="flex items-center justify-between gap-3">
						<span className="text-muted-foreground">Updated</span>
						<span>
							{formatDistanceToNow(new Date(item.updatedAt), {
								addSuffix: true,
							})}
						</span>
					</div>
					<a
						href={item.htmlUrl}
						target="_blank"
						rel="noreferrer noopener"
						className="inline-flex items-center gap-2 font-medium hover:underline"
					>
						View on {detail.repository.providerName}
						<ExternalLinkIcon className="size-4" />
					</a>
				</CardContent>
			</Card>
			{run ? (
				<Card size="sm">
					<CardHeader>
						<CardTitle>Selected run</CardTitle>
						<CardDescription>
							{format(new Date(run.createdAt), "MMM d, yyyy · HH:mm")}
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3 text-sm">
						<div className="flex justify-between gap-3">
							<span className="text-muted-foreground">Status</span>
							<StatusBadge status={run.status} />
						</div>
						<UsageSummary run={run} />
						<Separator />
						<div>
							<div className="text-muted-foreground text-xs">Trigger</div>
							<div>{run.trigger}</div>
						</div>
						{run.retryOfRunId ? (
							<div>
								<div className="text-muted-foreground text-xs">Retry of</div>
								<div className="flex items-center gap-1">
									<code className="min-w-0 truncate text-xs">
										{run.retryOfRunId}
									</code>
									<CopyButton value={run.retryOfRunId} label="Parent run ID" />
								</div>
							</div>
						) : null}
						<div>
							<div className="text-muted-foreground text-xs">Trace ID</div>
							<div className="flex items-center gap-1">
								<code className="min-w-0 truncate text-xs">{run.traceId}</code>
								<CopyButton value={run.traceId} label="Trace ID" />
							</div>
						</div>
						{run.providerDeliveryId ? (
							<div>
								<div className="text-muted-foreground text-xs">
									Provider delivery ID
								</div>
								<div className="flex items-center gap-1">
									<code className="min-w-0 truncate text-xs">
										{run.providerDeliveryId}
									</code>
									<CopyButton
										value={run.providerDeliveryId}
										label="Provider delivery ID"
									/>
								</div>
							</div>
						) : null}
					</CardContent>
				</Card>
			) : null}
			<Card size="sm">
				<CardHeader>
					<CardTitle>Previous runs</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-2">
					{detail.runs.length ? (
						detail.runs.slice(0, 5).map((itemRun) => (
							<div
								key={itemRun.id}
								className="flex items-center justify-between gap-2 rounded-xl border p-2 text-sm"
							>
								<div className="min-w-0">
									<div className="truncate font-medium">
										{itemRun.reviewKind}
									</div>
									<div className="text-muted-foreground text-xs">
										{formatDistanceToNow(new Date(itemRun.createdAt), {
											addSuffix: true,
										})}
									</div>
								</div>
								{itemRun.status === "failed" ? (
									<Button
										size="sm"
										variant="outline"
										disabled={retryDisabled}
										onClick={() => onRetry(itemRun.id)}
									>
										<RotateCcwIcon data-icon="inline-start" />
										Retry
									</Button>
								) : (
									<StatusBadge status={itemRun.status} />
								)}
							</div>
						))
					) : (
						<p className="text-muted-foreground text-sm">No GitPal runs yet.</p>
					)}
				</CardContent>
			</Card>
		</aside>
	);
}

export function WorkItemDetailPage({
	kind,
	repositoryId,
	number,
}: {
	kind: WorkItemKind;
	repositoryId: string;
	number: number;
}) {
	const { activeWorkspaceId } = useActiveWorkspace();
	const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null);
	const [confirmAction, setConfirmAction] = React.useState<ConfirmAction>(null);
	const awaitingRunAt = React.useRef<number | null>(null);
	const queryInput = {
		organizationId: activeWorkspaceId ?? undefined,
		kind,
		repositoryId,
		number,
	};
	const detailQuery = useQuery({
		...trpc.workItems.detail.queryOptions(queryInput),
		enabled: Boolean(activeWorkspaceId),
		refetchInterval: (query) => {
			const data = query.state.data as Detail | undefined;
			return awaitingRunAt.current ||
				data?.runs.some((run) => ACTIVE_STATUSES.has(run.status))
				? 2500
				: false;
		},
	});
	const detail = detailQuery.data;
	const selectedRun =
		detail?.runs.find((run) => run.id === selectedRunId) ??
		detail?.runs[0] ??
		null;

	React.useEffect(() => {
		if (!selectedRunId && detail?.runs[0]) setSelectedRunId(detail.runs[0].id);
		if (
			awaitingRunAt.current &&
			detail?.runs[0] &&
			new Date(detail.runs[0].createdAt).getTime() >= awaitingRunAt.current
		)
			awaitingRunAt.current = null;
	}, [detail, selectedRunId]);

	const invalidate = async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.workItems.detail.queryKey(queryInput),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.workItems.list.queryKey(),
			}),
		]);
	};
	const refreshMutation = useMutation(
		trpc.workItems.refresh.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Provider state refreshed.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const runMutation = useMutation(
		trpc.workItems.run.mutationOptions({
			onSuccess: async () => {
				awaitingRunAt.current = Date.now();
				await invalidate();
				toast.success(
					kind === "pull_request" ? "Review queued." : "Labeler run queued.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const retryMutation = useMutation(
		trpc.workItems.retry.mutationOptions({
			onSuccess: async () => {
				awaitingRunAt.current = Date.now();
				await invalidate();
				toast.success("Retry queued as a new run.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (detailQuery.isLoading) return <DetailSkeleton />;
	if (detailQuery.isError || !detail)
		return (
			<Empty className="min-h-96 border">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<AlertCircleIcon />
					</EmptyMedia>
					<EmptyTitle>Work item unavailable</EmptyTitle>
					<EmptyDescription>
						{detailQuery.error?.message ?? "This item could not be loaded."}
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);

	const item = detail.item;
	const isPullRequest = detail.kind === "pull_request";
	const result = toRecord(selectedRun?.result);
	const suggestedLabels = stringArray(result.suggestedLabels);
	const appliedLabels = stringArray(result.appliedLabels);
	const providerLabels = "labels" in item ? stringArray(item.labels) : [];
	const selectedComments = detail.comments.filter(
		(comment) =>
			!selectedRun ||
			!comment.reviewRunId ||
			comment.reviewRunId === selectedRun.id,
	);
	const selectedChecks = detail.checks.filter(
		(check) =>
			!selectedRun ||
			!check.reviewRunId ||
			check.reviewRunId === selectedRun.id,
	);
	const isBusy =
		refreshMutation.isPending ||
		runMutation.isPending ||
		retryMutation.isPending;
	const activeRun = detail.runs.some((run) => ACTIVE_STATUSES.has(run.status));
	const executeConfirm = () => {
		if (confirmAction?.type === "retry" && confirmAction.runId)
			retryMutation.mutate({ ...queryInput, runId: confirmAction.runId });
		if (confirmAction?.type === "run")
			runMutation.mutate({
				...queryInput,
				idempotencyKey: crypto.randomUUID(),
			});
		setConfirmAction(null);
	};

	const actionButtons = (
		<>
			<Button
				variant="outline"
				disabled={isBusy}
				onClick={() => refreshMutation.mutate(queryInput)}
			>
				<RefreshCcwIcon data-icon="inline-start" />
				Refresh from provider
			</Button>
			<Button
				disabled={isBusy || activeRun}
				onClick={() => setConfirmAction({ type: "run" })}
			>
				<PlayIcon data-icon="inline-start" />
				{isPullRequest ? "Run new review" : "Run AI labeler"}
			</Button>
		</>
	);

	return (
		<main className="flex min-w-0 flex-col gap-6">
			<div className="flex flex-col gap-4">
				<div className="flex items-center gap-2 text-muted-foreground text-xs">
					<Link
						href={isPullRequest ? "/pull-requests" : "/issues"}
						className="hover:text-foreground"
					>
						{isPullRequest ? "Pull requests" : "Issues"}
					</Link>
					<span>/</span>
					<span>{detail.repository.fullName}</span>
					<span>/</span>
					<span>#{item.number}</span>
				</div>
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<StatusBadge status={item.state} />
							<span className="text-muted-foreground text-sm">
								{isPullRequest ? "PR" : "Issue"} #{item.number}
							</span>
						</div>
						<h1 className="mt-2 break-words font-heading font-medium text-2xl tracking-tight md:text-3xl">
							{item.title}
						</h1>
						<div className="mt-3 flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
							<Avatar className="size-6">
								<AvatarImage src={item.authorAvatarUrl ?? undefined} />
								<AvatarFallback>
									{initials(item.authorName ?? item.authorLogin)}
								</AvatarFallback>
							</Avatar>
							<span>{item.authorLogin ?? item.authorName ?? "Unknown"}</span>
							<span>·</span>
							<span>
								opened{" "}
								{formatDistanceToNow(new Date(item.createdAt), {
									addSuffix: true,
								})}
							</span>
						</div>
					</div>
					<div className="hidden shrink-0 gap-2 md:flex">{actionButtons}</div>
					<div className="md:hidden">
						<DropdownMenu>
							<DropdownMenuTrigger render={<Button variant="outline" />}>
								<MoreHorizontalIcon data-icon="inline-start" />
								Actions
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuGroup>
									<DropdownMenuItem
										disabled={isBusy}
										onClick={() => refreshMutation.mutate(queryInput)}
									>
										<RefreshCcwIcon />
										Refresh from provider
									</DropdownMenuItem>
									<DropdownMenuItem
										disabled={isBusy || activeRun}
										onClick={() => setConfirmAction({ type: "run" })}
									>
										<PlayIcon />
										{isPullRequest ? "Run new review" : "Run AI labeler"}
									</DropdownMenuItem>
								</DropdownMenuGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
				{isPullRequest && "sourceBranch" in item ? (
					<div className="flex flex-wrap items-center gap-2 text-sm">
						<GitBranchIcon className="size-4 text-muted-foreground" />
						<Badge variant="outline">{item.sourceBranch}</Badge>
						<span className="text-muted-foreground">into</span>
						<Badge variant="outline">{item.targetBranch}</Badge>
					</div>
				) : null}
			</div>

			<div className="xl:hidden">
				<Accordion multiple defaultValue={["work-item-context"]}>
					<AccordionItem
						value="work-item-context"
						className="rounded-xl border px-4"
					>
						<AccordionTrigger className="hover:no-underline">
							Context and run details
						</AccordionTrigger>
						<AccordionContent className="pt-2 pb-4">
							<ContextRail
								detail={detail}
								run={selectedRun}
								retryDisabled={activeRun || isBusy}
								onRetry={(runId) => setConfirmAction({ type: "retry", runId })}
							/>
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			</div>

			<div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
				<div className="min-w-0">
					<Tabs defaultValue="overview">
						<div className="overflow-x-auto">
							<TabsList variant="line">
								<TabsTrigger value="overview">Overview</TabsTrigger>
								<TabsTrigger value="runs">
									{isPullRequest ? "AI reviews" : "Labeler runs"}
									<Badge variant="outline">{detail.runs.length}</Badge>
								</TabsTrigger>
								{isPullRequest ? (
									<TabsTrigger value="findings">
										Findings{" "}
										<Badge variant="outline">{selectedComments.length}</Badge>
									</TabsTrigger>
								) : null}
								{isPullRequest ? (
									<TabsTrigger value="checks">
										Checks{" "}
										<Badge variant="outline">{selectedChecks.length}</Badge>
									</TabsTrigger>
								) : null}
								<TabsTrigger value="activity">Activity</TabsTrigger>
							</TabsList>
						</div>
						<TabsContent value="overview" className="mt-5 flex flex-col gap-4">
							{isPullRequest ? (
								<Card>
									<CardHeader>
										<CardTitle className="flex items-center gap-2">
											<BotIcon className="size-5" />
											AI review
										</CardTitle>
										<CardDescription>
											{selectedRun?.summary ??
												"Run a review to generate a GitPal assessment."}
										</CardDescription>
									</CardHeader>
									{selectedRun ? (
										<CardContent>
											<UsageSummary run={selectedRun} />
										</CardContent>
									) : null}
								</Card>
							) : (
								<div className="grid gap-4 lg:grid-cols-2">
									<Card>
										<CardHeader>
											<CardTitle>Issue description</CardTitle>
										</CardHeader>
										<CardContent>
											<p className="whitespace-pre-wrap text-sm leading-relaxed">
												{"body" in item && item.body
													? item.body
													: "No issue description provided."}
											</p>
										</CardContent>
									</Card>
									<Card>
										<CardHeader>
											<CardTitle>AI labeler result</CardTitle>
											<CardDescription>
												{selectedRun?.summary ?? "No labeler result yet."}
											</CardDescription>
										</CardHeader>
										<CardContent className="flex flex-col gap-3">
											<div>
												<div className="text-muted-foreground text-xs">
													Provider labels
												</div>
												<div className="mt-2 flex flex-wrap gap-2">
													{providerLabels.length ? (
														providerLabels.map((label) => (
															<Badge key={label} variant="secondary">
																{label}
															</Badge>
														))
													) : (
														<span className="text-muted-foreground text-sm">
															None
														</span>
													)}
												</div>
											</div>
											<div>
												<div className="text-muted-foreground text-xs">
													Suggested labels
												</div>
												<div className="mt-2 flex flex-wrap gap-2">
													{suggestedLabels.length ? (
														suggestedLabels.map((label) => (
															<Badge key={label} variant="outline">
																{label}
															</Badge>
														))
													) : (
														<span className="text-muted-foreground text-sm">
															None
														</span>
													)}
												</div>
											</div>
											<div>
												<div className="text-muted-foreground text-xs">
													Applied labels
												</div>
												<div className="mt-2 flex flex-wrap gap-2">
													{appliedLabels.length ? (
														appliedLabels.map((label) => (
															<Badge key={label} variant="secondary">
																{label}
															</Badge>
														))
													) : (
														<span className="text-muted-foreground text-sm">
															None
														</span>
													)}
												</div>
											</div>
										</CardContent>
									</Card>
								</div>
							)}
							<Card>
								<CardHeader>
									<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
										<div>
											<CardTitle>Execution trace</CardTitle>
											<CardDescription>
												Immutable step-by-step diagnostics for the selected run.
											</CardDescription>
										</div>
										{detail.runs.length ? (
											<Select
												value={selectedRun?.id ?? ""}
												onValueChange={(value) =>
													setSelectedRunId(value ?? null)
												}
											>
												<SelectTrigger className="w-full sm:w-56">
													<SelectValue placeholder="Select run" />
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														{detail.runs.map((run) => (
															<SelectItem key={run.id} value={run.id}>
																{format(
																	new Date(run.createdAt),
																	"MMM d, HH:mm",
																)}{" "}
																· {run.status}
															</SelectItem>
														))}
													</SelectGroup>
												</SelectContent>
											</Select>
										) : null}
									</div>
								</CardHeader>
								<CardContent>
									{selectedRun ? (
										<RunTrace run={selectedRun} />
									) : (
										<Empty>
											<EmptyHeader>
												<EmptyMedia variant="icon">
													{isPullRequest ? (
														<GitPullRequestIcon />
													) : (
														<CircleDotIcon />
													)}
												</EmptyMedia>
												<EmptyTitle>No runs yet</EmptyTitle>
												<EmptyDescription>
													Start the first GitPal AI run from the page actions.
												</EmptyDescription>
											</EmptyHeader>
										</Empty>
									)}
								</CardContent>
							</Card>
						</TabsContent>
						<TabsContent value="runs" className="mt-5">
							<Card>
								<CardHeader>
									<CardTitle>Run history</CardTitle>
									<CardDescription>
										Every run remains independently addressable and immutable.
									</CardDescription>
								</CardHeader>
								<CardContent className="flex flex-col gap-3">
									{detail.runs.map((run) => (
										<button
											type="button"
											key={run.id}
											aria-pressed={run.id === selectedRun?.id}
											onClick={() => setSelectedRunId(run.id)}
											className={cn(
												"flex items-center justify-between gap-3 rounded-xl border p-3 text-left hover:bg-muted/50",
												run.id === selectedRun?.id &&
													"border-primary bg-muted/50",
											)}
										>
											<div>
												<div className="font-medium">{run.reviewKind}</div>
												<div className="text-muted-foreground text-xs">
													{format(
														new Date(run.createdAt),
														"MMM d, yyyy · HH:mm",
													)}{" "}
													· {durationLabel(runDuration(run))}
												</div>
											</div>
											<StatusBadge status={run.status} />
										</button>
									))}
									{detail.runs.length === 0 ? (
										<p className="text-muted-foreground text-sm">
											No GitPal runs yet.
										</p>
									) : null}
								</CardContent>
							</Card>
						</TabsContent>
						{isPullRequest ? (
							<TabsContent value="findings" className="mt-5">
								<Card>
									<CardHeader>
										<CardTitle>Findings</CardTitle>
										<CardDescription>
											AI comments persisted by GitPal.
										</CardDescription>
									</CardHeader>
									<CardContent className="flex flex-col gap-3">
										{selectedComments.length ? (
											selectedComments.map((comment) => (
												<div key={comment.id} className="rounded-xl border p-4">
													<div className="flex flex-wrap items-center gap-2">
														<Badge variant="outline">{comment.severity}</Badge>
														<span className="font-medium">
															{comment.title ?? comment.category}
														</span>
													</div>
													{comment.filePath ? (
														<div className="mt-2 font-mono text-muted-foreground text-xs">
															{comment.filePath}
															{comment.line ? `:${comment.line}` : ""}
														</div>
													) : null}
													<p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
														{comment.body}
													</p>
												</div>
											))
										) : (
											<p className="text-muted-foreground text-sm">
												No findings recorded.
											</p>
										)}
									</CardContent>
								</Card>
							</TabsContent>
						) : null}
						{isPullRequest ? (
							<TabsContent value="checks" className="mt-5">
								<Card>
									<CardHeader>
										<CardTitle>Checks</CardTitle>
										<CardDescription>
											Pre-merge checks associated with this pull request.
										</CardDescription>
									</CardHeader>
									<CardContent className="flex flex-col gap-2">
										{selectedChecks.length ? (
											selectedChecks.map((check) => (
												<div
													key={check.id}
													className="flex items-center justify-between gap-3 rounded-xl border p-3"
												>
													<div className="flex items-center gap-2">
														<ShieldCheckIcon className="size-4 text-muted-foreground" />
														<span>{check.checkName}</span>
													</div>
													<StatusBadge status={check.status} />
												</div>
											))
										) : (
											<p className="text-muted-foreground text-sm">
												No checks recorded.
											</p>
										)}
									</CardContent>
								</Card>
							</TabsContent>
						) : null}
						<TabsContent value="activity" className="mt-5">
							<Card>
								<CardHeader>
									<CardTitle>Activity</CardTitle>
									<CardDescription>
										Safe GitPal events associated with the selected run.
									</CardDescription>
								</CardHeader>
								<CardContent className="flex flex-col gap-3">
									{selectedRun?.events.length ? (
										selectedRun.events.map((event) => (
											<div
												key={event.id}
												className="flex gap-3 border-b pb-3 last:border-0"
											>
												<Clock3Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
												<div>
													<div className="font-medium text-sm">
														{event.title}
													</div>
													<div className="text-muted-foreground text-xs">
														{format(
															new Date(event.occurredAt),
															"MMM d, HH:mm:ss",
														)}{" "}
														· {event.status}
													</div>
													{event.body ? (
														<p className="mt-1 text-sm">{event.body}</p>
													) : null}
												</div>
											</div>
										))
									) : (
										<p className="text-muted-foreground text-sm">
											No activity recorded for this run.
										</p>
									)}
								</CardContent>
							</Card>
						</TabsContent>
					</Tabs>
				</div>
				<div className="hidden xl:contents">
					<ContextRail
						detail={detail}
						run={selectedRun}
						retryDisabled={activeRun || isBusy}
						onRetry={(runId) => setConfirmAction({ type: "retry", runId })}
					/>
				</div>
			</div>

			<AlertDialog
				open={Boolean(confirmAction)}
				onOpenChange={(open) => {
					if (!open) setConfirmAction(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{confirmAction?.type === "retry"
								? "Retry failed run?"
								: isPullRequest
									? "Run a new AI review?"
									: "Run the AI labeler?"}
						</AlertDialogTitle>
						<AlertDialogDescription>
							This queues a new immutable run using the repository’s current
							settings and may incur AI usage costs. Existing history will not
							be changed.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={executeConfirm}>
							Queue run
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</main>
	);
}
