import { env } from "@gitpal/env/web";
import {
	ActivityIcon,
	BarChart3Icon,
	BellIcon,
	BookOpenIcon,
	CheckCircle2Icon,
	Clock3Icon,
	CreditCardIcon,
	DatabaseIcon,
	DownloadIcon,
	FolderGit2Icon,
	GitPullRequestIcon,
	KeyRoundIcon,
	LineChartIcon,
	PlugZapIcon,
	Settings2Icon,
	ShieldCheckIcon,
	TablePropertiesIcon,
	Users2Icon,
} from "lucide-react";

const cloudBillingEnabled = env.NEXT_PUBLIC_GITPAL_CLOUD_BILLING_ENABLED;

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
		title: "Observability",
		href: "/observability",
		icon: ActivityIcon,
	},
	{
		title: "Integrations",
		href: "/integrations",
		icon: PlugZapIcon,
	},
	{
		title: "Notifications",
		href: "/notifications",
		icon: BellIcon,
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
		title: "Workspaces",
		href: "/account/team-management",
		icon: Users2Icon,
	},
	...(cloudBillingEnabled
		? [
				{
					title: "Billing",
					href: "/account/billing",
					icon: CreditCardIcon,
				},
			]
		: []),
	{
		title: "API Keys",
		href: "/account/api-keys",
		icon: KeyRoundIcon,
	},
] as const;

export type DashboardView = (typeof dashboardNavItems)[number]["view"];

export function getWorkspacePageInfo(pathname: string) {
	const accountSubtitle = cloudBillingEnabled
		? "Workspaces, billing, and keys"
		: "Workspaces and keys";

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
			subtitle: accountSubtitle,
		};
	}

	if (pathname.startsWith("/observability")) {
		return {
			section: "Workspace",
			title: "Observability",
			subtitle: "Logs, traces, and system events",
		};
	}

	if (pathname.startsWith("/integrations")) {
		return {
			section: "Workspace",
			title: "Integrations",
			subtitle: "Connectors and external context",
		};
	}

	if (pathname.startsWith("/notifications")) {
		return {
			section: "Workspace",
			title: "Notifications",
			subtitle: "Important app events",
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
