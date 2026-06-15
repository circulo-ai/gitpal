"use client";

import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@gitpal/ui/components/breadcrumb";
import { Separator } from "@gitpal/ui/components/separator";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@gitpal/ui/components/sidebar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import UserMenu from "./user-menu";
import { dashboardNavItems } from "./workspace-nav";
import { WorkspaceSidebar } from "./workspace-sidebar";

type WorkspaceShellProps = {
	children: ReactNode;
	user: {
		name: string;
		email: string;
		image?: string | null;
	};
};

function getCurrentPage(pathname: string) {
	if (pathname.startsWith("/repositories")) {
		return {
			section: "Workspace",
			title: "Repositories",
		};
	}

	const dashboardItem = dashboardNavItems.find(
		(item) => item.href === pathname,
	);

	return {
		section: "Dashboard",
		title: dashboardItem?.title ?? "Summary",
	};
}

export function WorkspaceShell({ children, user }: WorkspaceShellProps) {
	const pathname = usePathname();
	const currentPage = getCurrentPage(pathname);

	return (
		<SidebarProvider>
			<WorkspaceSidebar user={user} />
			<SidebarInset>
				<header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80">
					<div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-3 px-4 md:px-6 lg:px-8">
						<SidebarTrigger />
						<Separator
							orientation="vertical"
							className="data-[orientation=vertical]:h-5"
						/>
						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem className="hidden md:block">
									<BreadcrumbLink render={<Link href="/dashboard/summary" />}>
										{currentPage.section}
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator className="hidden md:block" />
								<BreadcrumbItem>
									<BreadcrumbPage>{currentPage.title}</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
						<div className="ml-auto">
							<UserMenu user={user} />
						</div>
					</div>
				</header>
				<div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-5 md:px-6 md:py-6 lg:px-8">
					{children}
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
