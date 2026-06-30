"use client";

// ─── UI components ────────────────────────────────────────────────────────────
import { Badge } from "@gitpal/ui/components/badge";
import { Button } from "@gitpal/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@gitpal/ui/components/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@gitpal/ui/components/chart";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@gitpal/ui/components/empty";
import { Input } from "@gitpal/ui/components/input";
import { Label } from "@gitpal/ui/components/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@gitpal/ui/components/popover";
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
import { cn } from "@gitpal/ui/lib/utils";
// ─── External imports ────────────────────────────────────────────────────────
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import {
	CalendarIcon,
	DatabaseIcon,
	DownloadIcon,
	RefreshCcwIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Line,
	LineChart,
	Pie,
	PieChart,
	XAxis,
	YAxis,
} from "recharts";
import { toast } from "sonner";
import { queryClient, trpc } from "@/utils/trpc";
// ─── Internal imports ─────────────────────────────────────────────────────────
import { useActiveWorkspace } from "./active-workspace-provider";
import { PageHeader, PageStatCard, PageStatGrid } from "./workspace-page";
import type { DashboardView } from "./workspace-nav";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardAnalyticsPageProps {
	view: DashboardView;
	title: string;
	description: string;
}

interface ChartSeries {
	key: string;
	label: string;
}

interface ChartBlock {
	id: string;
	title: string;
	description?: string;
	type: "bar" | "line" | "area" | "pie";
	data: Array<Record<string, number | string>>;
	series: ChartSeries[];
	emptyLabel?: string;
}

interface TableColumn {
	key: string;
	label: string;
}

interface TableBlock {
	id: string;
	title: string;
	description?: string;
	pageSize: number;
	columns: TableColumn[];
	rows: Array<Record<string, number | string | boolean | null>>;
}

interface StatCard {
	label: string;
	value: string;
	description?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESET_RANGES = [
	{ label: "Last 7 days", value: "7" },
	{ label: "Last 30 days", value: "30" },
	{ label: "Last 90 days", value: "90" },
] as const;

const CHART_COLORS = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
	"var(--chart-5)",
] as const;

const DEFAULT_LOOKBACK_DAYS = 30;
const SKELETON_CARD_COUNT = 4;

// ─── Utility functions ────────────────────────────────────────────────────────

function toIsoDate(date: Date): string {
	return format(date, "yyyy-MM-dd");
}

function safeDateOrFallback(raw: string | null, fallback: Date): Date {
	if (!raw) return fallback;
	const parsed = new Date(raw);
	return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function getDateRangeFromSearch(searchParams: URLSearchParams): {
	from: Date;
	to: Date;
} {
	const now = new Date();
	const to = safeDateOrFallback(searchParams.get("to"), now);
	const from = safeDateOrFallback(
		searchParams.get("from"),
		subDays(to, DEFAULT_LOOKBACK_DAYS),
	);
	return { from, to };
}

function getFiltersFromSearch(searchParams: URLSearchParams) {
	const { from, to } = getDateRangeFromSearch(searchParams);

	const single = (key: string): string[] => {
		const val = searchParams.get(key);
		return val ? [val] : [];
	};

	return {
		repositoryIds: single("repository"),
		usernames: single("user"),
		teams: single("team"),
		timezone: searchParams.get("timezone") ?? "UTC",
		dateRange: {
			from: from.toISOString(),
			to: to.toISOString(),
		},
	};
}

function hasChartData(chart: ChartBlock): boolean {
	return chart.data.some((row) =>
		chart.series.some((s) => Number(row[s.key] ?? 0) > 0),
	);
}

function buildChartConfig(chart: ChartBlock): ChartConfig {
	return Object.fromEntries(
		chart.series.map((series, index) => [
			series.key,
			{
				label: series.label,
				color: CHART_COLORS[index % CHART_COLORS.length],
			},
		]),
	);
}

function inferCategoryKey(data: ChartBlock["data"]): string {
	return data.some((row) => "week" in row) ? "week" : "name";
}

// ─── Custom hook ──────────────────────────────────────────────────────────────

function useDashboardParams() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const params = React.useMemo(
		() => new URLSearchParams(searchParams.toString()),
		[searchParams],
	);

	const updateParam = React.useCallback(
		(key: string, value: string | null) => {
			const next = new URLSearchParams(params);
			if (value) {
				next.set(key, value);
			} else {
				next.delete(key);
			}
			router.replace(`${pathname}?${next.toString()}` as never);
		},
		[params, pathname, router],
	);

	const applyPreset = React.useCallback(
		(days: number) => {
			const to = new Date();
			const from = subDays(to, days);
			const next = new URLSearchParams(params);
			next.set("from", toIsoDate(from));
			next.set("to", toIsoDate(to));
			router.replace(`${pathname}?${next.toString()}` as never);
		},
		[params, pathname, router],
	);

	return { params, updateParam, applyPreset };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface DashboardHeaderProps {
	title: string;
	description: string;
	updatedAt?: string;
}

function DashboardHeader({
	title,
	description,
	updatedAt,
}: DashboardHeaderProps) {
	return (
		<PageHeader
			eyebrow="Dashboard"
			title={title}
			description={description}
			badges={
				updatedAt ? (
					<Badge variant="outline">
						Updated {format(new Date(updatedAt), "MMM d, HH:mm")}
					</Badge>
				) : null
			}
		/>
	);
}

// ─────────────────────────────────────────────────────────────────────────────

interface DashboardFiltersProps {
	isExportView: boolean;
}

function DashboardFilters({ isExportView }: DashboardFiltersProps) {
	const { params, updateParam, applyPreset } = useDashboardParams();
	const { activeWorkspaceId } = useActiveWorkspace();

	const repositoriesQuery = useQuery({
		...trpc.repositories.list.queryOptions({
			organizationId: activeWorkspaceId ?? undefined,
		}),
		enabled: Boolean(activeWorkspaceId),
	});

	const exportMutation = useMutation(
		trpc.analytics.exportReviewMetrics.mutationOptions({
			onSuccess: (file) => {
				const blob = new Blob([file.content], { type: file.contentType });
				const objectUrl = URL.createObjectURL(blob);
				const link = document.createElement("a");
				link.href = objectUrl;
				link.download = file.filename;
				link.click();
				URL.revokeObjectURL(objectUrl);
				toast.success("Review metrics export is ready.");
			},
		}),
	);

	const range = getDateRangeFromSearch(params);
	const filters = getFiltersFromSearch(params);

	const repositoryItems = [
		{ label: "All repositories", value: "all" },
		...(repositoriesQuery.data?.map((repo) => ({
			label: repo.fullName,
			value: repo.id,
		})) ?? []),
	];

	const handleRefresh = React.useCallback(
		() =>
			Promise.all([
				queryClient.invalidateQueries({
					queryKey: trpc.analytics.page.queryKey(),
				}),
				queryClient.invalidateQueries({
					queryKey: trpc.repositories.list.queryKey({
						organizationId: activeWorkspaceId ?? undefined,
					}),
				}),
			]),
		[activeWorkspaceId],
	);

	const handleExport = React.useCallback(
		() =>
			exportMutation.mutate({
				organizationId: activeWorkspaceId ?? undefined,
				...filters,
			}),
		[exportMutation, activeWorkspaceId, filters],
	);

	return (
		<div className="flex flex-col gap-3 rounded-xl p-3 md:flex-row md:items-center md:justify-between">
			<div className="flex flex-col gap-2 md:flex-row md:flex-wrap">
				{/* Repository filter */}
				<Select
					items={repositoryItems}
					value={params.get("repository") ?? "all"}
					onValueChange={(value) =>
						updateParam("repository", value === "all" ? null : value)
					}
				>
					<SelectTrigger className="w-full md:w-56">
						<SelectValue placeholder="Repository" />
					</SelectTrigger>
					<SelectContent align="start">
						<SelectGroup>
							{repositoryItems.map((item) => (
								<SelectItem key={item.value} value={item.value}>
									{item.label}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>

				{/* Date range picker */}
				<Popover>
					<PopoverTrigger
						render={
							<Button variant="outline" className="justify-start md:w-60" />
						}
					>
						<CalendarIcon data-icon="inline-start" />
						{format(range.from, "MMM d")} – {format(range.to, "MMM d")}
					</PopoverTrigger>
					<PopoverContent align="start" className="w-72">
						<div className="flex flex-col gap-3">
							{/* Quick presets */}
							<div className="flex flex-wrap gap-2">
								{PRESET_RANGES.map((preset) => (
									<Button
										key={preset.value}
										type="button"
										variant="outline"
										size="sm"
										onClick={() => applyPreset(Number(preset.value))}
									>
										{preset.label}
									</Button>
								))}
							</div>

							{/* Custom range */}
							<div className="grid gap-2">
								<Label className="text-muted-foreground text-xs" htmlFor="from">
									From
								</Label>
								<Input
									id="from"
									type="date"
									value={toIsoDate(range.from)}
									onChange={(e) => updateParam("from", e.target.value)}
								/>
								<Label className="text-muted-foreground text-xs" htmlFor="to">
									To
								</Label>
								<Input
									id="to"
									type="date"
									value={toIsoDate(range.to)}
									onChange={(e) => updateParam("to", e.target.value)}
								/>
							</div>
						</div>
					</PopoverContent>
				</Popover>
			</div>

			<div className="flex items-center gap-2">
				<Button
					variant="outline"
					size="icon"
					onClick={handleRefresh}
					aria-label="Refresh dashboard"
				>
					<RefreshCcwIcon />
					<span className="sr-only">Refresh dashboard</span>
				</Button>

				{isExportView && (
					<Button disabled={exportMutation.isPending} onClick={handleExport}>
						<DownloadIcon data-icon="inline-start" />
						Export
					</Button>
				)}
			</div>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────────

interface MetricCardsProps {
	stats?: StatCard[];
	isLoading: boolean;
}

function MetricCards({ stats, isLoading }: MetricCardsProps) {
	if (isLoading) {
		return (
			<PageStatGrid>
				{Array.from({ length: SKELETON_CARD_COUNT }).map((_, i) => (
					<Card key={i}>
						<CardHeader>
							<Skeleton className="h-4 w-28" />
							<Skeleton className="h-8 w-20" />
						</CardHeader>
					</Card>
				))}
			</PageStatGrid>
		);
	}

	if (!stats?.length) return null;

	return (
		<PageStatGrid>
			{stats.map((stat) => (
				<PageStatCard
					key={stat.label}
					label={stat.label}
					value={stat.value}
					meta={stat.description}
				/>
			))}
		</PageStatGrid>
	);
}

// ─────────────────────────────────────────────────────────────────────────────

function EmptyChart({ label }: { label?: string }) {
	return (
		<Empty className="min-h-60 border-0 p-6">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<DatabaseIcon />
				</EmptyMedia>
				<EmptyTitle>No data yet</EmptyTitle>
				<EmptyDescription>
					{label ?? "Sync repositories or widen the selected date range."}
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

// ─────────────────────────────────────────────────────────────────────────────

function DashboardChart({ chart }: { chart: ChartBlock }) {
	const config = buildChartConfig(chart);
	const hasData = hasChartData(chart);
	const primarySeries = chart.series[0];
	const categoryKey = inferCategoryKey(chart.data);

	const axisProps = {
		tickLine: false,
		axisLine: false,
		tickMargin: 8,
	} as const;

	const renderChart = () => {
		if (!hasData || !primarySeries) {
			return <EmptyChart label={chart.emptyLabel} />;
		}

		if (chart.type === "bar") {
			return (
				<BarChart data={chart.data} accessibilityLayer>
					<CartesianGrid vertical={false} />
					<XAxis dataKey={categoryKey} {...axisProps} />
					<YAxis {...axisProps} />
					<ChartTooltip content={<ChartTooltipContent />} />
					{chart.series.map((series, index) => (
						<Bar
							key={series.key}
							dataKey={series.key}
							fill={`var(--color-${series.key})`}
							radius={index === chart.series.length - 1 ? 6 : 0}
						/>
					))}
				</BarChart>
			);
		}

		if (chart.type === "line") {
			return (
				<LineChart data={chart.data} accessibilityLayer>
					<CartesianGrid vertical={false} />
					<XAxis dataKey={categoryKey} {...axisProps} />
					<YAxis {...axisProps} />
					<ChartTooltip content={<ChartTooltipContent />} />
					{chart.series.map((series) => (
						<Line
							key={series.key}
							type="monotone"
							dataKey={series.key}
							stroke={`var(--color-${series.key})`}
							strokeWidth={2}
							dot={false}
						/>
					))}
				</LineChart>
			);
		}

		if (chart.type === "area") {
			return (
				<AreaChart data={chart.data} accessibilityLayer>
					<CartesianGrid vertical={false} />
					<XAxis dataKey={categoryKey} {...axisProps} />
					<YAxis {...axisProps} />
					<ChartTooltip content={<ChartTooltipContent />} />
					{chart.series.map((series) => (
						<Area
							key={series.key}
							type="monotone"
							dataKey={series.key}
							fill={`var(--color-${series.key})`}
							fillOpacity={0.18}
							stroke={`var(--color-${series.key})`}
							strokeWidth={2}
						/>
					))}
				</AreaChart>
			);
		}

		// Pie chart
		return (
			<PieChart accessibilityLayer>
				<ChartTooltip content={<ChartTooltipContent hideLabel />} />
				<Pie
					data={chart.data}
					dataKey={primarySeries.key}
					nameKey="name"
					innerRadius={56}
					outerRadius={96}
					paddingAngle={2}
				>
					{chart.data.map((_, index) => (
						<Cell
							key={index}
							fill={CHART_COLORS[index % CHART_COLORS.length]}
						/>
					))}
				</Pie>
			</PieChart>
		);
	};

	return (
		<Card className={cn(chart.type !== "pie" && "xl:col-span-2")}>
			<CardHeader>
				<CardTitle>{chart.title}</CardTitle>
				{chart.description && (
					<CardDescription>{chart.description}</CardDescription>
				)}
			</CardHeader>
			<CardContent>
				{hasData && primarySeries ? (
					<ChartContainer config={config} className="h-72 w-full">
						{renderChart()}
					</ChartContainer>
				) : (
					<EmptyChart label={chart.emptyLabel} />
				)}
			</CardContent>
		</Card>
	);
}

// ─────────────────────────────────────────────────────────────────────────────

function DashboardTable({ table }: { table: TableBlock }) {
	const [page, setPage] = React.useState(0);
	const totalPages = Math.max(1, Math.ceil(table.rows.length / table.pageSize));
	const start = page * table.pageSize;
	const visibleRows = table.rows.slice(start, start + table.pageSize);

	return (
		<Card>
			<CardHeader>
				<CardTitle>{table.title}</CardTitle>
				{table.description && (
					<CardDescription>{table.description}</CardDescription>
				)}
				<CardAction>
					<Badge variant="outline">{table.rows.length} rows</Badge>
				</CardAction>
			</CardHeader>
			<CardContent>
				{table.rows.length > 0 ? (
					<div className="flex flex-col gap-3">
						<div className="overflow-x-auto rounded-xl border">
							<Table>
								<TableHeader>
									<TableRow>
										{table.columns.map((col) => (
											<TableHead key={col.key}>{col.label}</TableHead>
										))}
									</TableRow>
								</TableHeader>
								<TableBody>
									{visibleRows.map((row, rowIndex) => (
										<TableRow key={`${table.id}-${start + rowIndex}`}>
											{table.columns.map((col) => (
												<TableCell
													key={col.key}
													className="max-w-72 truncate"
													title={String(row[col.key] ?? "")}
												>
													{col.key === "number" &&
													typeof row.href === "string" ? (
														<Link
															href={row.href as Route}
															className="font-medium hover:underline"
														>
															#{String(row[col.key] ?? "–")}
														</Link>
													) : (
														String(row[col.key] ?? "–")
													)}
												</TableCell>
											))}
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>

						{/* Pagination */}
						<div className="flex items-center justify-end gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={page === 0}
								onClick={() => setPage((p) => Math.max(0, p - 1))}
							>
								Previous
							</Button>
							<Badge variant="secondary">
								{page + 1} / {totalPages}
							</Badge>
							<Button
								variant="outline"
								size="sm"
								disabled={page + 1 >= totalPages}
								onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
							>
								Next
							</Button>
						</div>
					</div>
				) : (
					<Empty className="min-h-56">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<DatabaseIcon />
							</EmptyMedia>
							<EmptyTitle>No rows found</EmptyTitle>
							<EmptyDescription>
								Sync repositories or adjust the current filters.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				)}
			</CardContent>
		</Card>
	);
}

// ─────────────────────────────────────────────────────────────────────────────

function ChartSkeletons() {
	return (
		<div className="grid gap-4 xl:grid-cols-2">
			{Array.from({ length: SKELETON_CARD_COUNT }).map((_, i) => (
				<Card key={i}>
					<CardHeader>
						<Skeleton className="h-5 w-48" />
					</CardHeader>
					<CardContent>
						<Skeleton className="h-72 w-full" />
					</CardContent>
				</Card>
			))}
		</div>
	);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function DashboardAnalyticsPage({
	view,
	title,
	description,
}: DashboardAnalyticsPageProps) {
	const { activeWorkspace, activeWorkspaceId } = useActiveWorkspace();
	const searchParams = useSearchParams();

	const filters = React.useMemo(
		() => ({
			organizationId: activeWorkspaceId ?? undefined,
			...getFiltersFromSearch(new URLSearchParams(searchParams.toString())),
		}),
		[activeWorkspaceId, searchParams],
	);

	const analyticsQuery = useQuery({
		...trpc.analytics.page.queryOptions({ view, ...filters }),
		enabled: Boolean(activeWorkspaceId),
	});

	const isExportView = view === "data-export";

	// ── No workspace ────────────────────────────────────────────────────────────
	if (!activeWorkspace) {
		return (
			<main className="flex flex-col gap-6">
				<DashboardHeader title={title} description={description} />
				<Card>
					<CardContent className="pt-6">
						<Empty className="min-h-96">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<DatabaseIcon />
								</EmptyMedia>
								<EmptyTitle>No active workspace</EmptyTitle>
								<EmptyDescription>
									Sync provider access and pick a workspace before opening
									review analytics.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					</CardContent>
				</Card>
			</main>
		);
	}

	// ── Main layout ─────────────────────────────────────────────────────────────
	return (
		<main className="flex flex-col gap-6">
			<DashboardHeader
				title={title}
				description={description}
				updatedAt={analyticsQuery.data?.updatedAt}
			/>

			<DashboardFilters isExportView={isExportView} />

			<MetricCards
				stats={analyticsQuery.data?.stats}
				isLoading={analyticsQuery.isLoading}
			/>

			{analyticsQuery.isLoading ? (
				<ChartSkeletons />
			) : analyticsQuery.data ? (
				<>
					{analyticsQuery.data.charts.length > 0 && (
						<div className="grid gap-4 xl:grid-cols-2">
							{analyticsQuery.data.charts.map((chart) => (
								<DashboardChart key={chart.id} chart={chart} />
							))}
						</div>
					)}

					{analyticsQuery.data.tables.length > 0 && (
						<div className="flex flex-col gap-4">
							{analyticsQuery.data.tables.map((table) => (
								<DashboardTable
									key={`${table.id}-${table.rows.length}`}
									table={table}
								/>
							))}
						</div>
					)}
				</>
			) : (
				<Empty className="min-h-96">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<DatabaseIcon />
						</EmptyMedia>
						<EmptyTitle>Dashboard unavailable</EmptyTitle>
						<EmptyDescription>
							The analytics endpoint did not return a dashboard payload.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</main>
	);
}
