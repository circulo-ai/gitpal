"use client";

import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@gitpal/ui/components/breadcrumb";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@gitpal/ui/components/sidebar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ActiveWorkspaceProvider } from "./active-workspace-provider";
import { NotificationBell } from "./notification-bell";
import UserMenu from "./user-menu";
import { getWorkspacePageInfo } from "./workspace-nav";
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
	return getWorkspacePageInfo(pathname);
}

export function WorkspaceShell({ children, user }: WorkspaceShellProps) {
	const pathname = usePathname();
	const currentPage = getCurrentPage(pathname);

	return (
		<SidebarProvider>
			<ActiveWorkspaceProvider>
				<WorkspaceSidebar user={user} />
				<SidebarInset className="flex min-h-svh min-w-0 flex-1 flex-col bg-muted/[0.18]">
					<header className="sticky top-0 z-10 border-b border-border/60 bg-background/88 backdrop-blur supports-backdrop-filter:bg-background/82">
						<div className="mx-auto flex h-16 w-full min-w-0 max-w-[1600px] items-center gap-3 px-4 md:px-6 lg:px-8">
							<SidebarTrigger />

							<Breadcrumb className="min-w-0">
								<BreadcrumbList>
									<BreadcrumbItem className="hidden md:block">
										<BreadcrumbLink
											render={
												<Link
													href={
														currentPage.section === "Account"
															? "/account/general"
															: currentPage.section === "Repositories"
																? "/repositories"
																: "/dashboard/summary"
													}
												/>
											}
										>
											{currentPage.section}
										</BreadcrumbLink>
									</BreadcrumbItem>
									<BreadcrumbSeparator className="hidden md:block" />
									<BreadcrumbItem className="min-w-0">
										<BreadcrumbPage>{currentPage.title}</BreadcrumbPage>
									</BreadcrumbItem>
								</BreadcrumbList>
							</Breadcrumb>
							<div className="ml-auto flex shrink-0 items-center gap-2">
								<NotificationBell />
								<UserMenu user={user} />
							</div>
						</div>
					</header>
					<div className="mx-auto flex min-h-0 w-full min-w-0 max-w-[1600px] flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 py-6 md:px-6 md:py-7 lg:px-8">
						{children}
					</div>
				</SidebarInset>
			</ActiveWorkspaceProvider>
		</SidebarProvider>
	);
}
