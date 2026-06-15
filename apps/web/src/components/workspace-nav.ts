import {
	BarChart3Icon,
	BookOpenIcon,
	CreditCardIcon,
	CheckCircle2Icon,
	Clock3Icon,
	DatabaseIcon,
	DownloadIcon,
	FolderGit2Icon,
	GitPullRequestIcon,
	LineChartIcon,
	Settings2Icon,
	ShieldCheckIcon,
	Users2Icon,
	TablePropertiesIcon,
	KeyRoundIcon,
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

export const accountNavItems = [
	{
		title: "General",
		href: "/account/general",
		icon: Settings2Icon,
	},
	{
		title: "Team Management",
		href: "/account/team-management",
		icon: Users2Icon,
	},
	{
		title: "Billing",
		href: "/account/billing",
		icon: CreditCardIcon,
	},
	{
		title: "Developer settings",
		href: "/account/developer-settings",
		icon: KeyRoundIcon,
	},
] as const;

export type DashboardView = (typeof dashboardNavItems)[number]["view"];

export function getWorkspacePageInfo(pathname: string) {
	if (pathname.startsWith("/repositories/")) {
		const repositoryId = pathname.split("/")[2] ?? "Repository";

		if (pathname.endsWith("/settings")) {
			return {
				section: "Repositories",
				title: "Repository settings",
				subtitle: repositoryId,
			};
		}

		return {
			section: "Repositories",
			title: repositoryId,
			subtitle: "Repository",
		};
	}

	if (pathname.startsWith("/repositories")) {
		return {
			section: "Workspace",
			title: "Repositories",
			subtitle: "Repository catalog",
		};
	}

	if (pathname.startsWith("/account/")) {
		const item = accountNavItems.find((navItem) => navItem.href === pathname);

		return {
			section: "Account",
			title: item?.title ?? "Account",
			subtitle: "Organization and billing settings",
		};
	}

	const dashboardItem = dashboardNavItems.find(
		(item) => item.href === pathname,
	);

	return {
		section: "Dashboard",
		title: dashboardItem?.title ?? "Summary",
		subtitle: "Git platform reviews",
	};
}
