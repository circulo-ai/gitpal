import {
	BarChart3Icon,
	BookOpenIcon,
	CheckCircle2Icon,
	Clock3Icon,
	DatabaseIcon,
	DownloadIcon,
	FolderGit2Icon,
	GitPullRequestIcon,
	LineChartIcon,
	ShieldCheckIcon,
	TablePropertiesIcon,
} from "lucide-react";

export const dashboardNavItems = [
	{
		title: "Summary",
		href: "/dashboard/summary",
		view: "summary",
		icon: BarChart3Icon,
	},
	{
		title: "Quality metrics",
		href: "/dashboard/quality-metrics",
		view: "quality-metrics",
		icon: ShieldCheckIcon,
	},
	{
		title: "Time metrics",
		href: "/dashboard/time-metrics",
		view: "time-metrics",
		icon: Clock3Icon,
	},
	{
		title: "Knowledge base",
		href: "/dashboard/knowledge-base",
		view: "knowledge-base",
		icon: BookOpenIcon,
	},
	{
		title: "Organization trends",
		href: "/dashboard/organization-trends",
		view: "organization-trends",
		icon: LineChartIcon,
	},
	{
		title: "Pre-merge checks",
		href: "/dashboard/pre-merge-checks",
		view: "pre-merge-checks",
		icon: CheckCircle2Icon,
	},
	{
		title: "Reporting",
		href: "/dashboard/reporting",
		view: "reporting",
		icon: GitPullRequestIcon,
	},
	{
		title: "Data metrics",
		href: "/dashboard/data-metrics",
		view: "data-metrics",
		icon: TablePropertiesIcon,
	},
	{
		title: "Data export",
		href: "/dashboard/data-export",
		view: "data-export",
		icon: DownloadIcon,
	},
] as const;

export const workspaceNavItems = [
	{
		title: "Repositories",
		href: "/repositories",
		icon: FolderGit2Icon,
	},
	{
		title: "Git platform reviews",
		href: "/dashboard/summary",
		icon: DatabaseIcon,
		items: dashboardNavItems,
	},
] as const;

export type DashboardView = (typeof dashboardNavItems)[number]["view"];
