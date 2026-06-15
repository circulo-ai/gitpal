import { Skeleton } from "@gitpal/ui/components/skeleton";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DashboardAnalyticsPage } from "@/components/dashboard-analytics-page";
import {
	type DashboardView,
	dashboardNavItems,
} from "@/components/workspace-nav";

type DashboardViewPageProps = {
	params: Promise<{
		view: string;
	}>;
};

const descriptions = {
	summary:
		"High-signal review health across synced repositories, reviewers, findings, and merge flow.",
	"quality-metrics":
		"Acceptance, category, and severity trends for AI and human review comments.",
	"time-metrics":
		"Review-ready, human review, commit, and merge timing across active pull requests.",
	"knowledge-base":
		"Learnings created by reviews, MCP usage, and reuse across pull requests.",
	"organization-trends":
		"Throughput, reviewer activity, and organization-level trends over time.",
	"pre-merge-checks":
		"Built-in and custom pre-merge checks, run volume, and results.",
	reporting:
		"Scheduled and on-demand report delivery across configured channels.",
	"data-metrics":
		"Detailed active user, pull request, and tool finding tables.",
	"data-export": "Download review metrics for merged pull requests as CSV.",
} satisfies Record<DashboardView, string>;

function DashboardPageFallback() {
	return (
		<main className="flex flex-1 flex-col gap-5 p-4 md:p-6">
			<div className="flex flex-col gap-2">
				<Skeleton className="h-9 w-64" />
				<Skeleton className="h-4 w-full max-w-2xl" />
			</div>
			<Skeleton className="h-16 w-full" />
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				{Array.from({ length: 4 }).map((_, index) => (
					<Skeleton key={index} className="h-32" />
				))}
			</div>
			<Skeleton className="h-96 w-full" />
		</main>
	);
}

export default async function DashboardViewPage({
	params,
}: DashboardViewPageProps) {
	const { view } = await params;
	const item = dashboardNavItems.find((navItem) => navItem.view === view);

	if (!item) {
		notFound();
	}

	return (
		<Suspense fallback={<DashboardPageFallback />}>
			<DashboardAnalyticsPage
				view={item.view}
				title={item.title}
				description={descriptions[item.view]}
			/>
		</Suspense>
	);
}
