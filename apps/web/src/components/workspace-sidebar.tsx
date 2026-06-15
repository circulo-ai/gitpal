"use client";

import * as React from "react";
import { authClient } from "@/lib/auth-client";
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
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { GitPalMark } from "./gitpal-mark";
import {
	accountNavItems,
	workspaceNavItems,
} from "./workspace-nav";

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

function OrganizationSwitcher() {
	const router = useRouter();
	const organizationsQuery = authClient.useListOrganizations();
	const activeOrganizationQuery = authClient.useActiveOrganization();
	const activeMemberRoleQuery = authClient.useActiveMemberRole();
	const organizations = organizationsQuery.data ?? [];
	const activeOrganization = activeOrganizationQuery.data;
	const activeMemberRole = activeMemberRoleQuery.data;
	const [isSwitching, startTransition] = React.useTransition();

	async function setActiveOrganization(organizationId: string | null) {
		startTransition(async () => {
			await authClient.organization.setActive({
				organizationId,
			});
			router.refresh();
		});
	}

	if (organizations.length === 0) {
		return (
			<SidebarGroup>
				<SidebarGroupLabel>Organization</SidebarGroupLabel>
				<SidebarGroupContent>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton
								tooltip="Create an organization"
								render={<Link href="/account/general" />}
							>
								<PlusIcon />
								<span>Create organization</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarGroupContent>
			</SidebarGroup>
		);
	}

	const currentOrganization = activeOrganization ?? organizations[0];

	return (
		<SidebarGroup>
			<SidebarGroupLabel>Organization</SidebarGroupLabel>
			<SidebarGroupContent>
				<SidebarMenu>
					<SidebarMenuItem>
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<SidebarMenuButton
										size="lg"
										tooltip={currentOrganization.name}
										className="min-w-0"
									/>
								}
							>
								<div className="flex min-w-0 flex-1 items-center gap-3">
									<div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/60 text-xs font-medium">
										{currentOrganization.name.slice(0, 2).toUpperCase()}
									</div>
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="truncate font-medium">
											{currentOrganization.name}
										</span>
										<span className="truncate text-muted-foreground text-xs">
											{activeMemberRole?.role
												? `${activeMemberRole.role} access`
												: "Organization access"}
										</span>
									</span>
									<ChevronDownIcon className="ml-auto size-4 shrink-0 text-muted-foreground" />
								</div>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start" className="w-72">
								<DropdownMenuLabel>Switch organization</DropdownMenuLabel>
								<DropdownMenuSeparator />
								<DropdownMenuGroup>
									{organizations.map((organization) => (
										<DropdownMenuItem
											key={organization.id}
											disabled={isSwitching}
											onSelect={(event) => {
												event.preventDefault();
												void setActiveOrganization(organization.id);
											}}
										>
											<div className="flex min-w-0 flex-1 items-center justify-between gap-3">
												<span className="truncate">{organization.name}</span>
												{organization.id === currentOrganization.id ? (
													<Badge variant="secondary" className="shrink-0">
														Active
													</Badge>
												) : null}
											</div>
										</DropdownMenuItem>
									))}
								</DropdownMenuGroup>
				<DropdownMenuSeparator />
								<DropdownMenuItem render={<Link href="/account/general" />}>
									Manage organizations
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
	const ReviewsIcon = workspaceNavItems[1].icon;
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
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							size="lg"
							tooltip="GitPal"
							render={<Link href="/dashboard/summary" />}
						>
							<GitPalMark className="size-8 text-[0.65rem]" />
							<span className="font-semibold">GitPal</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
				<OrganizationSwitcher />
			</SidebarHeader>
			<SidebarContent className="gap-3">
				<SidebarGroup>
					<SidebarGroupLabel>Workspace</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{workspaceNavItems
								.filter((item) => item.title === "Repositories")
								.map((item) => {
									const Icon = item.icon;

									return (
										<SidebarMenuItem key={item.title}>
											<SidebarMenuButton
												isActive={pathname === item.href}
												tooltip={item.title}
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
									onClick={() => setReviewsOpen((value) => !value)}
									aria-expanded={reviewsOpen}
									aria-controls="git-platform-reviews"
								>
									<ReviewsIcon />
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
								{workspaceNavItems[1].items.map((subItem) => {
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
						<SidebarMenuButton size="lg" tooltip={user.email}>
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
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
