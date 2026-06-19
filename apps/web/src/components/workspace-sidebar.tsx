"use client";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@gitpal/ui/components/avatar";
import { Badge } from "@gitpal/ui/components/badge";
import {
	Collapsible,
	CollapsibleContent,
} from "@gitpal/ui/components/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@gitpal/ui/components/dropdown-menu";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "@gitpal/ui/components/sidebar";
import { cn } from "@gitpal/ui/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { useActiveWorkspace } from "./active-workspace-provider";
import { accountNavItems, workspaceNavItems } from "./workspace-nav";
import { formatWorkspaceScope } from "./workspace-scope";

type WorkspaceSidebarProps = {
	user: {
		name: string;
		email: string;
		image?: string | null;
	};
};

function getInitials(name: string) {
	return name
		.split(" ")
		.map((part) => part[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

function WorkspaceSwitcher() {
	const { activeWorkspace, isSwitching, switchWorkspace, workspaces } =
		useActiveWorkspace();

	if (workspaces.length === 0) {
		return (
			<SidebarGroup>
				<SidebarGroupLabel>Workspace</SidebarGroupLabel>
				<SidebarGroupContent>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton
								tooltip="Sync workspaces"
								render={<Link href="/account/team-management" />}
							>
								<span>Sync workspaces</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarGroupContent>
			</SidebarGroup>
		);
	}

	const currentWorkspace = activeWorkspace ?? workspaces[0];

	return (
		<SidebarGroup>
			<SidebarGroupLabel>Workspace</SidebarGroupLabel>
			<SidebarGroupContent>
				<SidebarMenu>
					<SidebarMenuItem>
						<DropdownMenu>
							<DropdownMenuTrigger
								render={(props) => (
									<SidebarMenuButton
										{...props}
										size="lg"
										tooltip={currentWorkspace.name}
										className="min-w-0 justify-start border border-sidebar-border/60 bg-sidebar-accent/20 hover:bg-sidebar-accent/40"
									/>
								)}
							>
								<div className="flex min-w-0 flex-1 items-center gap-3">
									<Avatar>
										<AvatarImage
											className={"rounded-sm"}
											src={currentWorkspace.logo || undefined}
										/>
										<AvatarFallback className={"rounded-sm"}>
											{currentWorkspace.name.slice(0, 2).toUpperCase()}
										</AvatarFallback>
									</Avatar>
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="truncate font-medium">
											{currentWorkspace.name}
										</span>
										<span className="truncate text-muted-foreground text-xs">
											{`${formatWorkspaceScope(currentWorkspace.scope)} • ${currentWorkspace.role} access`}
										</span>
									</span>
									<ChevronDownIcon className="ml-auto size-4 shrink-0 text-muted-foreground" />
								</div>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start" className="w-72">
								<DropdownMenuGroup>
									<DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
									<DropdownMenuSeparator />
									{workspaces.map((workspace) => (
										<DropdownMenuItem
											key={workspace.id}
											disabled={isSwitching}
											onClick={async (event) => {
												event.preventDefault();
												const result = await switchWorkspace(workspace.id);

												if (result.error) {
													toast.error(result.error);
												}
											}}
										>
											<div className="flex min-w-0 flex-1 items-center justify-between gap-3">
												<div className="flex items-start gap-2">
													<Avatar>
														<AvatarImage
															className={"rounded-sm"}
															src={workspace.logo || undefined}
														/>
														<AvatarFallback className={"rounded-sm"}>
															{workspace.name.slice(0, 2).toUpperCase()}
														</AvatarFallback>
													</Avatar>
													<div className="min-w-0">
														<div className="truncate font-medium">
															{workspace.name}
														</div>
														<div className="truncate text-[10px] text-muted-foreground">
															{formatWorkspaceScope(workspace.scope)}
														</div>
													</div>
												</div>
												{workspace.id === currentWorkspace.id ? (
													<Badge variant="secondary" className="shrink-0">
														Active
													</Badge>
												) : null}
											</div>
										</DropdownMenuItem>
									))}
								</DropdownMenuGroup>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									render={<Link href="/account/team-management" />}
								>
									Manage workspaces
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}

export function WorkspaceSidebar({ user }: WorkspaceSidebarProps) {
	const pathname = usePathname();
	const [reviewsOpen, setReviewsOpen] = React.useState(
		pathname.startsWith("/dashboard"),
	);
	const [accountOpen, setAccountOpen] = React.useState(
		pathname.startsWith("/account"),
	);
	const reviewNavItem = workspaceNavItems.find((item) => "items" in item);
	const ReviewsIcon = reviewNavItem?.icon;
	const AccountIcon = accountNavItems[0].icon;

	React.useEffect(() => {
		if (pathname.startsWith("/dashboard")) {
			setReviewsOpen(true);
		}

		if (pathname.startsWith("/account")) {
			setAccountOpen(true);
		}
	}, [pathname]);

	return (
		<Sidebar collapsible="icon" variant="inset">
			<SidebarHeader>
				<WorkspaceSwitcher />
			</SidebarHeader>
			<SidebarContent className="gap-4 pt-1">
				<SidebarGroup>
					<SidebarGroupLabel>Navigation</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{workspaceNavItems
								.filter((item) => !("items" in item))
								.map((item) => {
									const Icon = item.icon;

									return (
										<SidebarMenuItem key={item.title}>
											<SidebarMenuButton
												isActive={
													pathname === item.href ||
													pathname.startsWith(`${item.href}/`)
												}
												tooltip={item.title}
												className="justify-start"
												render={<Link href={item.href} />}
											>
												<Icon />
												<span>{item.title}</span>
											</SidebarMenuButton>
										</SidebarMenuItem>
									);
								})}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
				<Collapsible open={reviewsOpen} onOpenChange={setReviewsOpen}>
					<SidebarGroup>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton
									isActive={pathname.startsWith("/dashboard")}
									tooltip="Git platform reviews"
									className="justify-start"
									onClick={() => setReviewsOpen((value) => !value)}
									aria-expanded={reviewsOpen}
									aria-controls="git-platform-reviews"
								>
									{ReviewsIcon ? <ReviewsIcon /> : null}
									<span>Git platform reviews</span>
									<ChevronDownIcon
										data-icon="inline-end"
										className={cn(
											"ml-auto transition-transform",
											reviewsOpen && "rotate-180",
										)}
									/>
								</SidebarMenuButton>
							</SidebarMenuItem>
						</SidebarMenu>
						<CollapsibleContent
							id="git-platform-reviews"
							className={cn(!reviewsOpen && "hidden")}
						>
							<SidebarMenuSub>
								{reviewNavItem?.items.map((subItem) => {
									const SubIcon = subItem.icon;

									return (
										<SidebarMenuSubItem key={subItem.href}>
											<SidebarMenuSubButton
												isActive={pathname === subItem.href}
												render={<Link href={subItem.href} />}
											>
												<SubIcon />
												<span>{subItem.title}</span>
											</SidebarMenuSubButton>
										</SidebarMenuSubItem>
									);
								})}
							</SidebarMenuSub>
						</CollapsibleContent>
					</SidebarGroup>
				</Collapsible>
				<Collapsible open={accountOpen} onOpenChange={setAccountOpen}>
					<SidebarGroup>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton
									isActive={pathname.startsWith("/account")}
									tooltip="Account"
									className="justify-start"
									onClick={() => setAccountOpen((value) => !value)}
									aria-expanded={accountOpen}
									aria-controls="account-navigation"
								>
									<AccountIcon />
									<span>Account</span>
									<ChevronDownIcon
										data-icon="inline-end"
										className={cn(
											"ml-auto transition-transform",
											accountOpen && "rotate-180",
										)}
									/>
								</SidebarMenuButton>
							</SidebarMenuItem>
						</SidebarMenu>
						<CollapsibleContent
							id="account-navigation"
							className={cn(!accountOpen && "hidden")}
						>
							<SidebarMenuSub>
								{accountNavItems.map((item) => {
									const Icon = item.icon;

									return (
										<SidebarMenuSubItem key={item.href}>
											<SidebarMenuSubButton
												isActive={pathname === item.href}
												render={<Link href={item.href} />}
											>
												<Icon />
												<span>{item.title}</span>
											</SidebarMenuSubButton>
										</SidebarMenuSubItem>
									);
								})}
							</SidebarMenuSub>
						</CollapsibleContent>
					</SidebarGroup>
				</Collapsible>
			</SidebarContent>
			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							size="lg"
							tooltip={user.email}
							className="h-auto justify-start px-2.5 py-2.5"
						>
							<div className="flex min-w-0 flex-1 items-center gap-3">
								<Avatar className="size-8 rounded-lg">
									{user.image ? (
										<AvatarImage src={user.image} alt={user.name} />
									) : null}
									<AvatarFallback className="rounded-lg">
										{getInitials(user.name)}
									</AvatarFallback>
								</Avatar>
								<span className="flex min-w-0 flex-col">
									<span className="truncate font-medium">{user.name}</span>
									<span className="truncate text-muted-foreground text-xs">
										{user.email}
									</span>
								</span>
							</div>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
