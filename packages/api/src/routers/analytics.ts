import { createDb } from "@gitpal/db";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import { inArray } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import {
	listRepositoriesForUser,
	type RepositorySummary,
} from "../services/repository-sync";

const db = createDb();

const dashboardViewSchema = z.enum([
	"summary",
	"quality-metrics",
	"time-metrics",
	"knowledge-base",
	"organization-trends",
	"pre-merge-checks",
	"reporting",
	"data-metrics",
	"data-export",
]);

const dashboardFiltersSchema = z.object({
	repositoryIds: z.array(z.string()).optional(),
	usernames: z.array(z.string()).optional(),
	teams: z.array(z.string()).optional(),
	dateRange: z
		.object({
			from: z.string().optional(),
			to: z.string().optional(),
		})
		.optional(),
	timezone: z.string().optional(),
});

const dashboardPageSchema = dashboardFiltersSchema.extend({
	view: dashboardViewSchema,
});

type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;
type DashboardView = z.infer<typeof dashboardViewSchema>;
type PullRequestRow = typeof dashboardSchema.pullRequest.$inferSelect;
type ReviewCommentRow = typeof dashboardSchema.reviewComment.$inferSelect;
type ToolFindingRow = typeof dashboardSchema.toolFinding.$inferSelect;
type CheckRunRow = typeof dashboardSchema.preMergeCheckRun.$inferSelect;
type LearningRow = typeof dashboardSchema.knowledgeBaseLearning.$inferSelect;
type ReportDeliveryRow = typeof dashboardSchema.reportDelivery.$inferSelect;

type MetricCard = {
	label: string;
	value: string;
	description?: string;
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

type DashboardPagePayload = {
	view: DashboardView;
	updatedAt: string;
	filters: {
		from: string;
		to: string;
		timezone: string;
		repositoryIds: string[];
		usernames: string[];
		teams: string[];
	};
	stats: MetricCard[];
	charts: ChartBlock[];
	tables: TableBlock[];
};

type AnalyticsContext = {
	repositories: RepositorySummary[];
	pullRequests: PullRequestRow[];
	reviewComments: ReviewCommentRow[];
	toolFindings: ToolFindingRow[];
	preMergeCheckRuns: CheckRunRow[];
	knowledgeBaseLearnings: LearningRow[];
	reportDeliveries: ReportDeliveryRow[];
	range: {
		from: Date;
		to: Date;
		timezone: string;
		repositoryIds: string[];
		usernames: string[];
		teams: string[];
	};
};

const dayMs = 24 * 60 * 60 * 1000;
const hourMs = 60 * 60 * 1000;

function getDefaultFromDate() {
	const date = new Date();
	date.setDate(date.getDate() - 30);
	date.setHours(0, 0, 0, 0);
	return date;
}

function parseDate(value: string | undefined, fallback: Date) {
	if (!value) {
		return fallback;
	}

	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? fallback : date;
}

function normalizeFilters(filters: DashboardFilters) {
	const to = parseDate(filters.dateRange?.to, new Date());
	const from = parseDate(filters.dateRange?.from, getDefaultFromDate());

	return {
		from,
		to,
		timezone: filters.timezone || "UTC",
		repositoryIds: filters.repositoryIds ?? [],
		usernames: (filters.usernames ?? [])
			.map((username) => username.trim().toLowerCase())
			.filter(Boolean),
		teams: filters.teams ?? [],
	};
}

function isInRange(value: Date | null | undefined, from: Date, to: Date) {
	if (!value) {
		return false;
	}

	const time = value.getTime();
	return time >= from.getTime() && time <= to.getTime();
}

function formatNumber(value: number) {
	return new Intl.NumberFormat("en").format(value);
}

function formatPercent(value: number) {
	if (!Number.isFinite(value)) {
		return "0%";
	}

	return `${Math.round(value)}%`;
}

function formatHours(value: number | null) {
	if (value === null || !Number.isFinite(value)) {
		return "0h";
	}

	if (value < 1) {
		return `${Math.round(value * 60)}m`;
	}

	return `${Math.round(value * 10) / 10}h`;
}

function durationHours(
	from: Date | null | undefined,
	to: Date | null | undefined,
) {
	if (!from || !to) {
		return null;
	}

	const value = (to.getTime() - from.getTime()) / hourMs;
	return value >= 0 && Number.isFinite(value) ? value : null;
}

function average(values: number[]) {
	if (values.length === 0) {
		return null;
	}

	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], percentileValue: number) {
	if (values.length === 0) {
		return null;
	}

	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
	return sorted[Math.max(0, Math.min(sorted.length - 1, index))] ?? null;
}

function countBy<T>(
	items: T[],
	getKey: (item: T) => string | null | undefined,
) {
	const counts = new Map<string, number>();

	for (const item of items) {
		const key = getKey(item) || "Uncategorized";
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([name, value]) => ({ name, value }));
}

function ratio(numerator: number, denominator: number) {
	return denominator === 0 ? 0 : (numerator / denominator) * 100;
}

function startOfWeek(date: Date) {
	const next = new Date(date);
	next.setHours(0, 0, 0, 0);
	const day = next.getDay();
	const diff = day === 0 ? -6 : 1 - day;
	next.setDate(next.getDate() + diff);
	return next;
}

function weekKey(date: Date) {
	return startOfWeek(date).toISOString().slice(0, 10);
}

function weekLabel(key: string) {
	const date = new Date(`${key}T00:00:00.000Z`);
	return date.toLocaleDateString("en", {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

function createWeeklyBuckets(from: Date, to: Date) {
	const buckets: Array<{ key: string; week: string }> = [];
	let cursor = startOfWeek(from);
	const end = startOfWeek(to);

	while (cursor.getTime() <= end.getTime()) {
		const key = cursor.toISOString().slice(0, 10);
		buckets.push({ key, week: weekLabel(key) });
		cursor = new Date(cursor.getTime() + 7 * dayMs);
	}

	return buckets;
}

function weeklySeries<T>({
	items,
	from,
	to,
	getDate,
	series,
}: {
	items: T[];
	from: Date;
	to: Date;
	getDate: (item: T) => Date | null | undefined;
	series: Array<{
		key: string;
		label: string;
		value: (items: T[]) => number;
	}>;
}) {
	const buckets = createWeeklyBuckets(from, to).map((bucket) => ({
		...bucket,
		items: [] as T[],
	}));
	const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));

	for (const item of items) {
		const date = getDate(item);

		if (!date) {
			continue;
		}

		const bucket = bucketMap.get(weekKey(date));
		bucket?.items.push(item);
	}

	return buckets.map((bucket) => {
		const row: Record<string, number | string> = { week: bucket.week };

		for (const entry of series) {
			row[entry.key] = entry.value(bucket.items);
		}

		return row;
	});
}

function hasChartData(chart: ChartBlock) {
	return chart.data.some((row) =>
		chart.series.some((series) => Number(row[series.key] ?? 0) > 0),
	);
}

function chart(block: ChartBlock): ChartBlock {
	return {
		...block,
		emptyLabel: hasChartData(block)
			? block.emptyLabel
			: (block.emptyLabel ?? "No data for the selected filters"),
	};
}

function getRepositoryNameMap(repositories: RepositorySummary[]) {
	return new Map(
		repositories.map((repository) => [repository.id, repository.fullName]),
	);
}

function getCommentCountByPullRequest(comments: ReviewCommentRow[]) {
	const counts = new Map<string, { total: number; accepted: number }>();

	for (const comment of comments) {
		const current = counts.get(comment.pullRequestId) ?? {
			total: 0,
			accepted: 0,
		};
		current.total += 1;
		current.accepted += comment.accepted ? 1 : 0;
		counts.set(comment.pullRequestId, current);
	}

	return counts;
}

function getToolFindingCountByPullRequest(toolFindings: ToolFindingRow[]) {
	const counts = new Map<string, number>();

	for (const finding of toolFindings) {
		if (!finding.pullRequestId) {
			continue;
		}

		counts.set(
			finding.pullRequestId,
			(counts.get(finding.pullRequestId) ?? 0) + 1,
		);
	}

	return counts;
}

function getActiveUsers({
	pullRequests,
	reviewComments,
}: Pick<AnalyticsContext, "pullRequests" | "reviewComments">) {
	const users = new Map<
		string,
		{
			username: string;
			pullRequests: number;
			comments: number;
		}
	>();

	for (const pullRequest of pullRequests) {
		const username = pullRequest.authorLogin || pullRequest.authorName;

		if (!username) {
			continue;
		}

		const key = username.toLowerCase();
		const current = users.get(key) ?? {
			username,
			pullRequests: 0,
			comments: 0,
		};
		current.pullRequests += 1;
		users.set(key, current);
	}

	for (const comment of reviewComments) {
		const username = comment.authorLogin;

		if (!username) {
			continue;
		}

		const key = username.toLowerCase();
		const current = users.get(key) ?? {
			username,
			pullRequests: 0,
			comments: 0,
		};
		current.comments += 1;
		users.set(key, current);
	}

	return [...users.values()].sort(
		(a, b) => b.pullRequests + b.comments - (a.pullRequests + a.comments),
	);
}

function getTimeMetrics(pullRequests: PullRequestRow[]) {
	const merged = pullRequests.filter((pullRequest) => pullRequest.mergedAt);
	const toMerge = merged
		.map((pullRequest) =>
			durationHours(pullRequest.createdAt, pullRequest.mergedAt),
		)
		.filter((value): value is number => value !== null);
	const toFirstHumanReview = pullRequests
		.map((pullRequest) =>
			durationHours(
				pullRequest.reviewReadyAt ?? pullRequest.createdAt,
				pullRequest.firstHumanReviewAt,
			),
		)
		.filter((value): value is number => value !== null);
	const toLastHumanReview = pullRequests
		.map((pullRequest) =>
			durationHours(
				pullRequest.reviewReadyAt ?? pullRequest.createdAt,
				pullRequest.lastHumanReviewAt,
			),
		)
		.filter((value): value is number => value !== null);
	const toLastCommit = pullRequests
		.map((pullRequest) =>
			durationHours(
				pullRequest.reviewReadyAt ?? pullRequest.createdAt,
				pullRequest.lastCommitAt,
			),
		)
		.filter((value): value is number => value !== null);

	return {
		toMerge,
		toFirstHumanReview,
		toLastHumanReview,
		toLastCommit,
	};
}

async function loadAnalyticsContext(
	userId: string,
	filters: DashboardFilters,
): Promise<AnalyticsContext> {
	const range = normalizeFilters(filters);
	const repositories = (await listRepositoriesForUser(userId))
		.filter((repository) => repository.enabled)
		.filter(
			(repository) =>
				range.repositoryIds.length === 0 ||
				range.repositoryIds.includes(repository.id),
		);
	const repositoryIds = repositories.map((repository) => repository.id);

	if (repositoryIds.length === 0) {
		return {
			repositories,
			pullRequests: [],
			reviewComments: [],
			toolFindings: [],
			preMergeCheckRuns: [],
			knowledgeBaseLearnings: [],
			reportDeliveries: [],
			range,
		};
	}

	const [
		pullRequests,
		reviewComments,
		toolFindings,
		preMergeCheckRuns,
		knowledgeBaseLearnings,
		reportDeliveries,
	] = await Promise.all([
		db
			.select()
			.from(dashboardSchema.pullRequest)
			.where(inArray(dashboardSchema.pullRequest.repositoryId, repositoryIds)),
		db
			.select()
			.from(dashboardSchema.reviewComment)
			.where(
				inArray(dashboardSchema.reviewComment.repositoryId, repositoryIds),
			),
		db
			.select()
			.from(dashboardSchema.toolFinding)
			.where(inArray(dashboardSchema.toolFinding.repositoryId, repositoryIds)),
		db
			.select()
			.from(dashboardSchema.preMergeCheckRun)
			.where(
				inArray(dashboardSchema.preMergeCheckRun.repositoryId, repositoryIds),
			),
		db
			.select()
			.from(dashboardSchema.knowledgeBaseLearning)
			.where(
				inArray(
					dashboardSchema.knowledgeBaseLearning.repositoryId,
					repositoryIds,
				),
			),
		db
			.select()
			.from(dashboardSchema.reportDelivery)
			.where(
				inArray(dashboardSchema.reportDelivery.repositoryId, repositoryIds),
			),
	]);

	const usernameFilter = new Set(range.usernames);
	const filterByUser = <
		T extends { authorLogin?: string | null; authorName?: string | null },
	>(
		items: T[],
	) => {
		if (usernameFilter.size === 0) {
			return items;
		}

		return items.filter((item) => {
			const author = (item.authorLogin || item.authorName || "").toLowerCase();
			return usernameFilter.has(author);
		});
	};

	return {
		repositories,
		pullRequests: filterByUser(
			pullRequests.filter((pullRequest) =>
				isInRange(
					pullRequest.mergedAt ??
						pullRequest.updatedAt ??
						pullRequest.createdAt,
					range.from,
					range.to,
				),
			),
		),
		reviewComments: filterByUser(
			reviewComments.filter((comment) =>
				isInRange(comment.createdAt, range.from, range.to),
			),
		),
		toolFindings: toolFindings.filter((finding) =>
			isInRange(finding.createdAt, range.from, range.to),
		),
		preMergeCheckRuns: preMergeCheckRuns.filter((run) =>
			isInRange(run.startedAt, range.from, range.to),
		),
		knowledgeBaseLearnings: knowledgeBaseLearnings.filter((learning) =>
			isInRange(learning.createdAt, range.from, range.to),
		),
		reportDeliveries: reportDeliveries.filter((delivery) =>
			isInRange(delivery.deliveredAt, range.from, range.to),
		),
		range,
	};
}

function buildBaseStats(ctx: AnalyticsContext) {
	const activeUsers = getActiveUsers(ctx);
	const mergedPullRequests = ctx.pullRequests.filter(
		(pullRequest) => pullRequest.state === "merged",
	);
	const acceptedComments = ctx.reviewComments.filter(
		(comment) => comment.accepted,
	);
	const timeMetrics = getTimeMetrics(ctx.pullRequests);

	return {
		activeUsers,
		mergedPullRequests,
		acceptedComments,
		timeMetrics,
	};
}

function buildSummary(ctx: AnalyticsContext) {
	const base = buildBaseStats(ctx);
	const severityCounts = countBy(
		ctx.reviewComments,
		(comment) => comment.severity,
	);
	const categoryCounts = countBy(
		ctx.reviewComments,
		(comment) => comment.category,
	);
	const toolTypeCounts = countBy(
		ctx.toolFindings,
		(finding) => finding.toolType,
	);
	const failedChecks = ctx.preMergeCheckRuns.filter(
		(run) => run.status === "failed",
	);
	const avgMerge = average(base.timeMetrics.toMerge);
	const acceptanceRate = ratio(
		base.acceptedComments.length,
		ctx.reviewComments.length,
	);

	return {
		stats: [
			{
				label: "Active repositories",
				value: formatNumber(ctx.repositories.length),
				description: "Synced and enabled for analytics",
			},
			{
				label: "Merged pull requests",
				value: formatNumber(base.mergedPullRequests.length),
				description: "Merged in the selected range",
			},
			{
				label: "Active users",
				value: formatNumber(base.activeUsers.length),
				description: "Authors and reviewers with activity",
			},
			{
				label: "Review comments",
				value: formatNumber(ctx.reviewComments.length),
				description: `${formatPercent(acceptanceRate)} accepted`,
			},
			{
				label: "Median time to merge",
				value: formatHours(percentile(base.timeMetrics.toMerge, 50)),
				description: `Average ${formatHours(avgMerge)}`,
			},
			{
				label: "Pipeline failures",
				value: formatNumber(failedChecks.length),
				description: "Failed pre-merge checks",
			},
		],
		charts: [
			chart({
				id: "weekly-merged-prs",
				title: "Weekly merged pull requests",
				type: "area",
				data: weeklySeries({
					items: base.mergedPullRequests,
					from: ctx.range.from,
					to: ctx.range.to,
					getDate: (pullRequest) => pullRequest.mergedAt,
					series: [
						{
							key: "merged",
							label: "Merged",
							value: (items) => items.length,
						},
					],
				}),
				series: [{ key: "merged", label: "Merged" }],
			}),
			chart({
				id: "review-comments-by-severity",
				title: "Review comments by severity",
				type: "bar",
				data: severityCounts,
				series: [{ key: "value", label: "Comments" }],
			}),
			chart({
				id: "severity-distribution",
				title: "Severity distribution",
				type: "pie",
				data: severityCounts,
				series: [{ key: "value", label: "Comments" }],
			}),
			chart({
				id: "review-comments-by-category",
				title: "Review comments by category",
				type: "bar",
				data: categoryCounts,
				series: [{ key: "value", label: "Comments" }],
			}),
			chart({
				id: "tool-findings",
				title: "Tool findings",
				type: "bar",
				data: toolTypeCounts,
				series: [{ key: "value", label: "Findings" }],
			}),
		],
		tables: [],
	};
}

function buildQuality(ctx: AnalyticsContext) {
	const severityCounts = countBy(
		ctx.reviewComments,
		(comment) => comment.severity,
	);
	const categoryCounts = countBy(
		ctx.reviewComments,
		(comment) => comment.category,
	);
	const accepted = ctx.reviewComments.filter((comment) => comment.accepted);

	const acceptanceBy = (field: "severity" | "category") =>
		countBy(ctx.reviewComments, (comment) => comment[field]).map((entry) => {
			const matching = ctx.reviewComments.filter(
				(comment) => comment[field] === entry.name,
			);

			return {
				name: entry.name,
				value: Math.round(
					ratio(
						matching.filter((comment) => comment.accepted).length,
						matching.length,
					),
				),
			};
		});

	return {
		stats: [
			{
				label: "Comments posted",
				value: formatNumber(ctx.reviewComments.length),
				description: "AI and human review comments",
			},
			{
				label: "Accepted comments",
				value: formatNumber(accepted.length),
				description: `${formatPercent(ratio(accepted.length, ctx.reviewComments.length))} acceptance`,
			},
			{
				label: "Resolved comments",
				value: formatNumber(
					ctx.reviewComments.filter((comment) => comment.resolved).length,
				),
				description: "Marked resolved",
			},
		],
		charts: [
			chart({
				id: "acceptance-rate-by-severity",
				title: "Acceptance rate by severity",
				type: "bar",
				data: acceptanceBy("severity"),
				series: [{ key: "value", label: "Acceptance %" }],
			}),
			chart({
				id: "review-comment-count-by-severity",
				title: "Review comment count by severity",
				type: "bar",
				data: severityCounts,
				series: [{ key: "value", label: "Comments" }],
			}),
			chart({
				id: "acceptance-rate-by-category",
				title: "Acceptance rate by category",
				type: "bar",
				data: acceptanceBy("category"),
				series: [{ key: "value", label: "Acceptance %" }],
			}),
			chart({
				id: "review-comment-count-by-category",
				title: "Review comment count by category",
				type: "bar",
				data: categoryCounts,
				series: [{ key: "value", label: "Comments" }],
			}),
		],
		tables: [],
	};
}

function buildTime(ctx: AnalyticsContext) {
	const metrics = getTimeMetrics(ctx.pullRequests);
	const metricCards = (label: string, values: number[]) => [
		{
			label: `${label} average`,
			value: formatHours(average(values)),
		},
		{
			label: `${label} median`,
			value: formatHours(percentile(values, 50)),
		},
		{
			label: `${label} P75`,
			value: formatHours(percentile(values, 75)),
		},
		{
			label: `${label} P90`,
			value: formatHours(percentile(values, 90)),
		},
	];

	const weeklyDurationChart = (
		id: string,
		title: string,
		getDuration: (pullRequest: PullRequestRow) => number | null,
	): ChartBlock =>
		chart({
			id,
			title,
			type: "line",
			data: weeklySeries({
				items: ctx.pullRequests,
				from: ctx.range.from,
				to: ctx.range.to,
				getDate: (pullRequest) =>
					pullRequest.reviewReadyAt ?? pullRequest.createdAt,
				series: [
					{
						key: "hours",
						label: "Hours",
						value: (items) => {
							const values = items
								.map(getDuration)
								.filter((value): value is number => value !== null);
							return Math.round((average(values) ?? 0) * 10) / 10;
						},
					},
				],
			}),
			series: [{ key: "hours", label: "Hours" }],
		});

	return {
		stats: [
			...metricCards("Time to merge", metrics.toMerge),
			...metricCards("First human review", metrics.toFirstHumanReview),
			...metricCards("Last human review", metrics.toLastHumanReview),
			...metricCards("Last commit", metrics.toLastCommit),
		],
		charts: [
			weeklyDurationChart(
				"weekly-review-ready-merge",
				"Weekly review-ready to merge time",
				(pullRequest) =>
					durationHours(
						pullRequest.reviewReadyAt ?? pullRequest.createdAt,
						pullRequest.mergedAt,
					),
			),
			weeklyDurationChart(
				"weekly-review-ready-first-human",
				"Weekly review-ready to first human review time",
				(pullRequest) =>
					durationHours(
						pullRequest.reviewReadyAt ?? pullRequest.createdAt,
						pullRequest.firstHumanReviewAt,
					),
			),
			weeklyDurationChart(
				"weekly-review-ready-last-human",
				"Weekly review-ready to last human review time",
				(pullRequest) =>
					durationHours(
						pullRequest.reviewReadyAt ?? pullRequest.createdAt,
						pullRequest.lastHumanReviewAt,
					),
			),
			weeklyDurationChart(
				"weekly-review-ready-last-commit",
				"Weekly review-ready to last commit time",
				(pullRequest) =>
					durationHours(
						pullRequest.reviewReadyAt ?? pullRequest.createdAt,
						pullRequest.lastCommitAt,
					),
			),
		],
		tables: [],
	};
}

function buildKnowledge(ctx: AnalyticsContext) {
	const learnings = ctx.knowledgeBaseLearnings;
	const applied = learnings.filter((learning) => learning.timesApplied > 0);
	const totalApplications = learnings.reduce(
		(sum, learning) => sum + learning.timesApplied,
		0,
	);

	return {
		stats: [
			{
				label: "Learnings created",
				value: formatNumber(learnings.length),
				description: "Knowledge entries generated",
			},
			{
				label: "PR coverage",
				value: formatPercent(ratio(applied.length, ctx.pullRequests.length)),
				description: "Pull requests with applied learnings",
			},
			{
				label: "Times applied",
				value: formatNumber(totalApplications),
				description: "Learning reuse events",
			},
		],
		charts: [
			chart({
				id: "weekly-learnings-created",
				title: "Weekly learnings created",
				type: "area",
				data: weeklySeries({
					items: learnings,
					from: ctx.range.from,
					to: ctx.range.to,
					getDate: (learning) => learning.createdAt,
					series: [
						{
							key: "created",
							label: "Created",
							value: (items) => items.length,
						},
					],
				}),
				series: [{ key: "created", label: "Created" }],
			}),
			chart({
				id: "weekly-learnings-applied",
				title: "Weekly learnings applied",
				type: "area",
				data: weeklySeries({
					items: learnings.filter((learning) => learning.lastAppliedAt),
					from: ctx.range.from,
					to: ctx.range.to,
					getDate: (learning) => learning.lastAppliedAt,
					series: [
						{
							key: "applied",
							label: "Applied",
							value: (items) =>
								items.reduce((sum, learning) => sum + learning.timesApplied, 0),
						},
					],
				}),
				series: [{ key: "applied", label: "Applied" }],
			}),
			chart({
				id: "pr-coverage-by-mcp-server",
				title: "PR coverage by MCP server",
				type: "bar",
				data: countBy(learnings, (learning) => learning.mcpServer),
				series: [{ key: "value", label: "Learnings" }],
			}),
			chart({
				id: "mcp-tool-usage",
				title: "MCP tool usage",
				type: "bar",
				data: countBy(learnings, (learning) => learning.toolName),
				series: [{ key: "value", label: "Uses" }],
			}),
			chart({
				id: "tool-findings-by-severity",
				title: "Tool findings by severity",
				type: "bar",
				data: countBy(ctx.toolFindings, (finding) => finding.severity),
				series: [{ key: "value", label: "Findings" }],
			}),
		],
		tables: [],
	};
}

function buildOrganizationTrends(ctx: AnalyticsContext) {
	const activeUsers = getActiveUsers(ctx);

	return {
		stats: [
			{
				label: "Enabled repositories",
				value: formatNumber(ctx.repositories.length),
			},
			{
				label: "Active users",
				value: formatNumber(activeUsers.length),
			},
			{
				label: "Merged PRs",
				value: formatNumber(
					ctx.pullRequests.filter(
						(pullRequest) => pullRequest.state === "merged",
					).length,
				),
			},
			{
				label: "Review comments",
				value: formatNumber(ctx.reviewComments.length),
			},
		],
		charts: [
			chart({
				id: "weekly-organization-throughput",
				title: "Weekly organization throughput",
				type: "area",
				data: weeklySeries({
					items: ctx.pullRequests,
					from: ctx.range.from,
					to: ctx.range.to,
					getDate: (pullRequest) =>
						pullRequest.mergedAt ?? pullRequest.updatedAt,
					series: [
						{
							key: "opened",
							label: "Updated PRs",
							value: (items) => items.length,
						},
						{
							key: "merged",
							label: "Merged PRs",
							value: (items) =>
								items.filter((pullRequest) => pullRequest.state === "merged")
									.length,
						},
					],
				}),
				series: [
					{ key: "opened", label: "Updated PRs" },
					{ key: "merged", label: "Merged PRs" },
				],
			}),
			chart({
				id: "weekly-review-comments",
				title: "Weekly review comments",
				type: "line",
				data: weeklySeries({
					items: ctx.reviewComments,
					from: ctx.range.from,
					to: ctx.range.to,
					getDate: (comment) => comment.createdAt,
					series: [
						{
							key: "comments",
							label: "Comments",
							value: (items) => items.length,
						},
					],
				}),
				series: [{ key: "comments", label: "Comments" }],
			}),
			chart({
				id: "active-users",
				title: "Most active users",
				type: "bar",
				data: activeUsers.slice(0, 10).map((user) => ({
					name: user.username,
					value: user.pullRequests + user.comments,
				})),
				series: [{ key: "value", label: "Activity" }],
			}),
		],
		tables: [],
	};
}

function buildPreMerge(ctx: AnalyticsContext) {
	const customRuns = ctx.preMergeCheckRuns.filter(
		(run) => run.checkType === "custom",
	);
	const builtInRuns = ctx.preMergeCheckRuns.filter(
		(run) => run.checkType !== "custom",
	);

	return {
		stats: [
			{
				label: "Custom checks configured",
				value: formatNumber(
					new Set(customRuns.map((run) => run.checkName)).size,
				),
			},
			{
				label: "Built-in runs",
				value: formatNumber(builtInRuns.length),
			},
			{
				label: "Custom runs",
				value: formatNumber(customRuns.length),
			},
			{
				label: "Failures",
				value: formatNumber(
					ctx.preMergeCheckRuns.filter((run) => run.status === "failed").length,
				),
			},
		],
		charts: [
			chart({
				id: "weekly-pre-merge-check-runs",
				title: "Weekly pre-merge check runs",
				type: "area",
				data: weeklySeries({
					items: ctx.preMergeCheckRuns,
					from: ctx.range.from,
					to: ctx.range.to,
					getDate: (run) => run.startedAt,
					series: [
						{
							key: "builtIn",
							label: "Built-in",
							value: (items) =>
								items.filter((run) => run.checkType !== "custom").length,
						},
						{
							key: "custom",
							label: "Custom",
							value: (items) =>
								items.filter((run) => run.checkType === "custom").length,
						},
					],
				}),
				series: [
					{ key: "builtIn", label: "Built-in" },
					{ key: "custom", label: "Custom" },
				],
			}),
			chart({
				id: "pre-merge-check-results",
				title: "Pre-merge check results",
				type: "bar",
				data: countBy(ctx.preMergeCheckRuns, (run) => run.status),
				series: [{ key: "value", label: "Runs" }],
			}),
		],
		tables: [],
	};
}

function buildReporting(ctx: AnalyticsContext) {
	return {
		stats: [
			{
				label: "Scheduled reports delivered",
				value: formatNumber(
					ctx.reportDeliveries.filter(
						(delivery) => delivery.reportType === "scheduled",
					).length,
				),
			},
			{
				label: "On-demand reports",
				value: formatNumber(
					ctx.reportDeliveries.filter(
						(delivery) => delivery.reportType === "on-demand",
					).length,
				),
			},
			{
				label: "Delivery failures",
				value: formatNumber(
					ctx.reportDeliveries.filter(
						(delivery) => delivery.status !== "delivered",
					).length,
				),
			},
		],
		charts: [
			chart({
				id: "reports-delivered-by-channel",
				title: "Reports delivered by channel",
				type: "bar",
				data: countBy(ctx.reportDeliveries, (delivery) => delivery.channel),
				series: [{ key: "value", label: "Reports" }],
			}),
			chart({
				id: "weekly-reports-delivered",
				title: "Weekly reports delivered",
				type: "area",
				data: weeklySeries({
					items: ctx.reportDeliveries,
					from: ctx.range.from,
					to: ctx.range.to,
					getDate: (delivery) => delivery.deliveredAt,
					series: [
						{
							key: "reports",
							label: "Reports",
							value: (items) => items.length,
						},
					],
				}),
				series: [{ key: "reports", label: "Reports" }],
			}),
		],
		tables: [],
	};
}

function buildDataMetrics(ctx: AnalyticsContext) {
	const repoNames = getRepositoryNameMap(ctx.repositories);
	const commentCounts = getCommentCountByPullRequest(ctx.reviewComments);
	const toolFindingCounts = getToolFindingCountByPullRequest(ctx.toolFindings);
	const activeUsers = getActiveUsers(ctx);

	return {
		stats: [
			{
				label: "Active user rows",
				value: formatNumber(activeUsers.length),
			},
			{
				label: "Pull request rows",
				value: formatNumber(ctx.pullRequests.length),
			},
			{
				label: "Tool finding rows",
				value: formatNumber(ctx.toolFindings.length),
			},
		],
		charts: [],
		tables: [
			{
				id: "active-user-details",
				title: "Active user details",
				pageSize: 20,
				columns: [
					{ key: "username", label: "User" },
					{ key: "pullRequests", label: "Pull requests" },
					{ key: "comments", label: "Comments" },
					{ key: "activity", label: "Activity" },
				],
				rows: activeUsers.map((user) => ({
					username: user.username,
					pullRequests: user.pullRequests,
					comments: user.comments,
					activity: user.pullRequests + user.comments,
				})),
			},
			{
				id: "pull-request-details",
				title: "Pull request details",
				pageSize: 10,
				columns: [
					{ key: "repository", label: "Repository" },
					{ key: "number", label: "PR" },
					{ key: "title", label: "Title" },
					{ key: "author", label: "Author" },
					{ key: "state", label: "State" },
					{ key: "comments", label: "Comments" },
					{ key: "mergedAt", label: "Merged" },
				],
				rows: ctx.pullRequests.map((pullRequest) => ({
					repository: repoNames.get(pullRequest.repositoryId) ?? "Unknown",
					number: pullRequest.number,
					title: pullRequest.title,
					author:
						pullRequest.authorLogin ?? pullRequest.authorName ?? "Unknown",
					state: pullRequest.state,
					comments: commentCounts.get(pullRequest.id)?.total ?? 0,
					mergedAt: pullRequest.mergedAt?.toISOString().slice(0, 10) ?? "-",
				})),
			},
			{
				id: "tool-finding-details",
				title: "Tool finding details",
				pageSize: 10,
				columns: [
					{ key: "repository", label: "Repository" },
					{ key: "tool", label: "Tool" },
					{ key: "severity", label: "Severity" },
					{ key: "status", label: "Status" },
					{ key: "title", label: "Title" },
					{ key: "createdAt", label: "Created" },
				],
				rows: ctx.toolFindings.map((finding) => ({
					repository: repoNames.get(finding.repositoryId) ?? "Unknown",
					tool: finding.toolName,
					severity: finding.severity,
					status: finding.status,
					title: finding.title,
					createdAt: finding.createdAt.toISOString().slice(0, 10),
					pullRequestFindings: finding.pullRequestId
						? (toolFindingCounts.get(finding.pullRequestId) ?? 0)
						: 0,
				})),
			},
		] satisfies TableBlock[],
	};
}

function buildDataExport(ctx: AnalyticsContext) {
	const rows = createReviewMetricRows(ctx);

	return {
		stats: [
			{
				label: "Exportable PR rows",
				value: formatNumber(rows.length),
				description: "Review metric rows matching current filters",
			},
			{
				label: "Date range",
				value: `${ctx.range.from.toISOString().slice(0, 10)} to ${ctx.range.to
					.toISOString()
					.slice(0, 10)}`,
			},
		],
		charts: [],
		tables: [
			{
				id: "review-metrics-export-preview",
				title: "Review metrics export preview",
				description:
					"The CSV export contains these columns for each pull request.",
				pageSize: 10,
				columns: [
					{ key: "repository", label: "Repository" },
					{ key: "number", label: "PR" },
					{ key: "author", label: "Author" },
					{ key: "state", label: "State" },
					{ key: "comments", label: "Comments" },
					{ key: "acceptedComments", label: "Accepted" },
					{ key: "timeToMergeHours", label: "Merge hours" },
				],
				rows,
			},
		] satisfies TableBlock[],
	};
}

function createReviewMetricRows(ctx: AnalyticsContext) {
	const repoNames = getRepositoryNameMap(ctx.repositories);
	const commentCounts = getCommentCountByPullRequest(ctx.reviewComments);
	const toolFindingCounts = getToolFindingCountByPullRequest(ctx.toolFindings);

	return ctx.pullRequests.map((pullRequest) => {
		const comments = commentCounts.get(pullRequest.id) ?? {
			total: 0,
			accepted: 0,
		};

		return {
			repository: repoNames.get(pullRequest.repositoryId) ?? "Unknown",
			number: pullRequest.number,
			title: pullRequest.title,
			author: pullRequest.authorLogin ?? pullRequest.authorName ?? "Unknown",
			state: pullRequest.state,
			createdAt: pullRequest.createdAt.toISOString(),
			mergedAt: pullRequest.mergedAt?.toISOString() ?? "",
			timeToMergeHours:
				durationHours(pullRequest.createdAt, pullRequest.mergedAt) ?? 0,
			comments: comments.total,
			acceptedComments: comments.accepted,
			toolFindings: toolFindingCounts.get(pullRequest.id) ?? 0,
		};
	});
}

function quoteCsv(value: number | string | boolean | null) {
	const text = String(value ?? "");
	return `"${text.replaceAll('"', '""')}"`;
}

function createCsv(
	rows: Array<Record<string, number | string | boolean | null>>,
) {
	const columns = [
		"repository",
		"number",
		"title",
		"author",
		"state",
		"createdAt",
		"mergedAt",
		"timeToMergeHours",
		"comments",
		"acceptedComments",
		"toolFindings",
	];
	return [
		columns.join(","),
		...rows.map((row) =>
			columns.map((column) => quoteCsv(row[column] ?? null)).join(","),
		),
	].join("\n");
}

function buildPayload(
	view: DashboardView,
	ctx: AnalyticsContext,
): DashboardPagePayload {
	const builders = {
		summary: buildSummary,
		"quality-metrics": buildQuality,
		"time-metrics": buildTime,
		"knowledge-base": buildKnowledge,
		"organization-trends": buildOrganizationTrends,
		"pre-merge-checks": buildPreMerge,
		reporting: buildReporting,
		"data-metrics": buildDataMetrics,
		"data-export": buildDataExport,
	} satisfies Record<
		DashboardView,
		(context: AnalyticsContext) => {
			stats: MetricCard[];
			charts: ChartBlock[];
			tables: TableBlock[];
		}
	>;
	const payload = builders[view](ctx);

	return {
		view,
		updatedAt: new Date().toISOString(),
		filters: {
			from: ctx.range.from.toISOString(),
			to: ctx.range.to.toISOString(),
			timezone: ctx.range.timezone,
			repositoryIds: ctx.range.repositoryIds,
			usernames: ctx.range.usernames,
			teams: ctx.range.teams,
		},
		stats: payload.stats,
		charts: payload.charts,
		tables: payload.tables,
	};
}

export const analyticsRouter = router({
	page: protectedProcedure
		.input(dashboardPageSchema)
		.query(async ({ ctx, input }) => {
			const analyticsContext = await loadAnalyticsContext(
				ctx.session.user.id,
				input,
			);
			return buildPayload(input.view, analyticsContext);
		}),
	exportReviewMetrics: protectedProcedure
		.input(dashboardFiltersSchema)
		.mutation(async ({ ctx, input }) => {
			const analyticsContext = await loadAnalyticsContext(
				ctx.session.user.id,
				input,
			);
			const rows = createReviewMetricRows(analyticsContext);
			const from = analyticsContext.range.from.toISOString().slice(0, 10);
			const to = analyticsContext.range.to.toISOString().slice(0, 10);

			return {
				filename: `gitpal-review-metrics-${from}-to-${to}.csv`,
				contentType: "text/csv;charset=utf-8",
				content: createCsv(rows),
			};
		}),
});
