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
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import {
	CalendarIcon,
	DatabaseIcon,
	DownloadIcon,
	RefreshCcwIcon,
	SearchIcon,
} from "lucide-react";
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
import { authClient } from "@/lib/auth-client";
import { queryClient, trpc } from "@/utils/trpc";
import type { DashboardView } from "./workspace-nav";

type DashboardAnalyticsPageProps = {
	view: DashboardView;
	title: string;
	description: string;
};

type ChartBlock = {
	id: string;
	title: string;
	description?: string;
	type: "bar" | "line" | "area" | "pie";
	data: Array<Record<string, number | string>>;
	series: Array<{ key: string; label: string }>;
	emptyLabel?: string;
};

type TableBlock = {
	id: string;
	title: string;
	description?: string;
	pageSize: number;
	columns: Array<{ key: string; label: string }>;
	rows: Array<Record<string, number | string | boolean | null>>;
};

const presetRanges = [
	{ label: "Last 7 days", value: "7" },
	{ label: "Last 30 days", value: "30" },
	{ label: "Last 90 days", value: "90" },
] as const;

const chartColors = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
	"var(--chart-5)",
];

function getDateRangeFromSearch(searchParams: URLSearchParams) {
	const to = searchParams.get("to")
		? new Date(String(searchParams.get("to")))
		: new Date();
	const from = searchParams.get("from")
		? new Date(String(searchParams.get("from")))
		: subDays(to, 30);

	return {
		from: Number.isNaN(from.getTime()) ? subDays(new Date(), 30) : from,
		to: Number.isNaN(to.getTime()) ? new Date() : to,
	};
}

function toIsoDate(date: Date) {
	return format(date, "yyyy-MM-dd");
}

function getFilters(searchParams: URLSearchParams) {
	const range = getDateRangeFromSearch(searchParams);

	return {
		repositoryIds: searchParams.get("repository")
			? [String(searchParams.get("repository"))]
			: [],
		usernames: searchParams.get("user")
			? [String(searchParams.get("user"))]
			: [],
		teams: searchParams.get("team") ? [String(searchParams.get("team"))] : [],
		timezone: searchParams.get("timezone") ?? "UTC",
		dateRange: {
			from: range.from.toISOString(),
			to: range.to.toISOString(),
		},
	};
}

function hasChartData(chart: ChartBlock) {
	return chart.data.some((row) =>
		chart.series.some((series) => Number(row[series.key] ?? 0) > 0),
	);
}

function getChartConfig(chart: ChartBlock): ChartConfig {
	return Object.fromEntries(
		chart.series.map((series, index) => [
			series.key,
			{
				label: series.label,
				color: chartColors[index % chartColors.length],
			},
		]),
	);
}

function DashboardHeader({
	title,
	description,
	updatedAt,
}: {
	title: string;
	description: string;
	updatedAt?: string;
}) {
	return (
		<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
			<div className="flex flex-col gap-1">
				<h1 className="font-heading font-medium text-2xl tracking-tight md:text-3xl">
					{title}
				</h1>
				<p className="max-w-3xl text-muted-foreground text-sm">{description}</p>
			</div>
			{updatedAt ? (
				<Badge variant="outline">
					Updated {format(new Date(updatedAt), "MMM d, HH:mm")}
				</Badge>
			) : null}
		</div>
	);
}

function DashboardFilters({ isExportView }: { isExportView: boolean }) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const activeOrganizationQuery = authClient.useActiveOrganization();
	const activeOrganization = activeOrganizationQuery.data;
	const params = React.useMemo(
		() => new URLSearchParams(searchParams.toString()),
		[searchParams],
	);
	const repositoriesQuery = useQuery({
		...trpc.repositories.list.queryOptions({
			organizationId: activeOrganization?.id,
		}),
		enabled: Boolean(activeOrganization),
	});
	const exportMutation = useMutation(
		trpc.analytics.exportReviewMetrics.mutationOptions({
			onSuccess: (file) => {
				const blob = new Blob([file.content], { type: file.contentType });
				const url = URL.createObjectURL(blob);
				const link = document.createElement("a");
				link.href = url;
				link.download = file.filename;
				link.click();
				URL.revokeObjectURL(url);
				toast.success("Review metrics export is ready.");
			},
		}),
	);

	function updateParam(key: string, value: string | null) {
		const next = new URLSearchParams(params);

		if (value) {
			next.set(key, value);
		} else {
			next.delete(key);
		}

		router.replace(`${pathname}?${next.toString()}` as never);
	}

	function applyPreset(days: number) {
		const to = new Date();
		const from = subDays(to, days);
		const next = new URLSearchParams(params);
		next.set("from", toIsoDate(from));
		next.set("to", toIsoDate(to));
		router.replace(`${pathname}?${next.toString()}` as never);
	}

	const range = getDateRangeFromSearch(params);
	const filters = getFilters(params);

	return (
		<div className="flex flex-col gap-3 rounded-xl border bg-card p-3 md:flex-row md:items-center md:justify-between">
			<div className="flex flex-col gap-2 md:flex-row md:flex-wrap">
				<Select
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
							<SelectItem value="all">All repositories</SelectItem>
							{repositoriesQuery.data?.map((repository) => (
								<SelectItem key={repository.id} value={repository.id}>
									{repository.fullName}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
				<div className="relative">
					<SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={params.get("user") ?? ""}
						onChange={(event) =>
							updateParam("user", event.target.value.trim() || null)
						}
						placeholder="Username"
						className="pl-9 md:w-44"
					/>
				</div>
				<Input
					value={params.get("team") ?? ""}
					onChange={(event) =>
						updateParam("team", event.target.value.trim() || null)
					}
					placeholder="Team"
					className="md:w-40"
				/>
				<Popover>
					<PopoverTrigger
						render={
							<Button variant="outline" className="justify-start md:w-60" />
						}
					>
						<CalendarIcon data-icon="inline-start" />
						{format(range.from, "MMM d")} - {format(range.to, "MMM d")}
					</PopoverTrigger>
					<PopoverContent align="start" className="w-72">
						<div className="flex flex-col gap-3">
							<div className="flex flex-wrap gap-2">
								{presetRanges.map((preset) => (
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
							<div className="grid gap-2">
								<label className="text-muted-foreground text-xs" htmlFor="from">
									From
								</label>
								<Input
									id="from"
									type="date"
									value={toIsoDate(range.from)}
									onChange={(event) => updateParam("from", event.target.value)}
								/>
								<label className="text-muted-foreground text-xs" htmlFor="to">
									To
								</label>
								<Input
									id="to"
									type="date"
									value={toIsoDate(range.to)}
									onChange={(event) => updateParam("to", event.target.value)}
								/>
							</div>
						</div>
					</PopoverContent>
				</Popover>
			</div>
			<div className="flex items-center gap-2">
				<Badge variant="secondary">{filters.timezone}</Badge>
				<Button
					variant="outline"
					size="icon"
					onClick={() => {
						queryClient.invalidateQueries();
					}}
				>
					<RefreshCcwIcon />
					<span className="sr-only">Refresh dashboard</span>
				</Button>
				{isExportView ? (
					<Button
						disabled={exportMutation.isPending}
						onClick={() => exportMutation.mutate(filters)}
					>
						<DownloadIcon data-icon="inline-start" />
						Export
					</Button>
				) : null}
			</div>
		</div>
	);
}

function MetricCards({
	stats,
	isLoading,
}: {
	stats?: Array<{ label: string; value: string; description?: string }>;
	isLoading: boolean;
}) {
	if (isLoading) {
		return (
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				{Array.from({ length: 4 }).map((_, index) => (
					<Card key={index}>
						<CardHeader>
							<Skeleton className="h-4 w-28" />
							<Skeleton className="h-8 w-20" />
						</CardHeader>
					</Card>
				))}
			</div>
		);
	}

	if (!stats?.length) {
		return null;
	}

	return (
		<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
			{stats.map((stat) => (
				<Card key={stat.label} size="sm">
					<CardHeader>
						<CardDescription>{stat.label}</CardDescription>
						<CardTitle className="text-3xl tabular-nums">
							{stat.value}
						</CardTitle>
						{stat.description ? (
							<CardAction>
								<Badge variant="outline">{stat.description}</Badge>
							</CardAction>
						) : null}
					</CardHeader>
				</Card>
			))}
		</div>
	);
}

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

function DashboardChart({ chart }: { chart: ChartBlock }) {
	const config = getChartConfig(chart);
	const hasData = hasChartData(chart);
	const primarySeries = chart.series[0];
	const categoryKey = chart.data.some((row) => "week" in row) ? "week" : "name";

	return (
		<Card className={cn(chart.type === "pie" ? "" : "xl:col-span-2")}>
			<CardHeader>
				<CardTitle>{chart.title}</CardTitle>
				{chart.description ? (
					<CardDescription>{chart.description}</CardDescription>
				) : null}
			</CardHeader>
			<CardContent>
				{hasData && primarySeries ? (
					<ChartContainer config={config} className="h-72 w-full">
						{chart.type === "bar" ? (
							<BarChart data={chart.data} accessibilityLayer>
								<CartesianGrid vertical={false} />
								<XAxis
									dataKey={categoryKey}
									tickLine={false}
									axisLine={false}
									tickMargin={8}
								/>
								<YAxis tickLine={false} axisLine={false} tickMargin={8} />
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
						) : chart.type === "line" ? (
							<LineChart data={chart.data} accessibilityLayer>
								<CartesianGrid vertical={false} />
								<XAxis
									dataKey={categoryKey}
									tickLine={false}
									axisLine={false}
									tickMargin={8}
								/>
								<YAxis tickLine={false} axisLine={false} tickMargin={8} />
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
						) : chart.type === "area" ? (
							<AreaChart data={chart.data} accessibilityLayer>
								<CartesianGrid vertical={false} />
								<XAxis
									dataKey={categoryKey}
									tickLine={false}
									axisLine={false}
									tickMargin={8}
								/>
								<YAxis tickLine={false} axisLine={false} tickMargin={8} />
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
						) : (
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
											fill={chartColors[index % chartColors.length]}
										/>
									))}
								</Pie>
							</PieChart>
						)}
					</ChartContainer>
				) : (
					<EmptyChart label={chart.emptyLabel} />
				)}
			</CardContent>
		</Card>
	);
}

function DashboardTable({ table }: { table: TableBlock }) {
	const [page, setPage] = React.useState(0);
	const totalPages = Math.max(1, Math.ceil(table.rows.length / table.pageSize));
	const start = page * table.pageSize;
	const rows = table.rows.slice(start, start + table.pageSize);

	return (
		<Card>
			<CardHeader>
				<CardTitle>{table.title}</CardTitle>
				{table.description ? (
					<CardDescription>{table.description}</CardDescription>
				) : null}
				<CardAction>
					<Badge variant="outline">{table.rows.length} rows</Badge>
				</CardAction>
			</CardHeader>
			<CardContent>
				{table.rows.length > 0 ? (
					<div className="flex flex-col gap-3">
						<div className="overflow-hidden rounded-xl border">
							<Table>
								<TableHeader>
									<TableRow>
										{table.columns.map((column) => (
											<TableHead key={column.key}>{column.label}</TableHead>
										))}
									</TableRow>
								</TableHeader>
								<TableBody>
									{rows.map((row, rowIndex) => (
										<TableRow key={`${table.id}-${start + rowIndex}`}>
											{table.columns.map((column) => (
												<TableCell
													key={column.key}
													className="max-w-72 truncate"
												>
													{String(row[column.key] ?? "-")}
												</TableCell>
											))}
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
						<div className="flex items-center justify-end gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={page === 0}
								onClick={() => setPage((value) => Math.max(0, value - 1))}
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
								onClick={() =>
									setPage((value) => Math.min(totalPages - 1, value + 1))
								}
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

function ChartSkeletons() {
	return (
		<div className="grid gap-4 xl:grid-cols-2">
			{Array.from({ length: 4 }).map((_, index) => (
				<Card key={index}>
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

export function DashboardAnalyticsPage({
	view,
	title,
	description,
}: DashboardAnalyticsPageProps) {
	const searchParams = useSearchParams();
	const filters = React.useMemo(
		() => getFilters(new URLSearchParams(searchParams.toString())),
		[searchParams],
	);
	const analyticsQuery = useQuery(
		trpc.analytics.page.queryOptions({
			view,
			...filters,
		}),
	);
	const isExportView = view === "data-export";

	return (
		<main className="flex min-h-0 flex-1 flex-col gap-6">
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
					{analyticsQuery.data.charts.length > 0 ? (
						<div className="grid gap-4 xl:grid-cols-2">
							{analyticsQuery.data.charts.map((chart) => (
								<DashboardChart key={chart.id} chart={chart} />
							))}
						</div>
					) : null}
					{analyticsQuery.data.tables.length > 0 ? (
						<div className="flex flex-col gap-4">
							{analyticsQuery.data.tables.map((table) => (
								<DashboardTable
									key={`${table.id}-${table.rows.length}`}
									table={table}
								/>
							))}
						</div>
					) : null}
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
