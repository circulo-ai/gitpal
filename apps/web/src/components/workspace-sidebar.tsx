"use client";

import * as React from "react";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@gitpal/ui/components/avatar";
import { Collapsible, CollapsibleContent } from "@gitpal/ui/components/collapsible";
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
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";

import { GitPalMark } from "./gitpal-mark";
import { workspaceNavItems } from "./workspace-nav";

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

export function WorkspaceSidebar({ user }: WorkspaceSidebarProps) {
	const pathname = usePathname();
	const [reviewsOpen, setReviewsOpen] = React.useState(
		pathname.startsWith("/dashboard"),
	);
	const ReviewsIcon = workspaceNavItems[1].icon;

	React.useEffect(() => {
		if (pathname.startsWith("/dashboard")) {
			setReviewsOpen(true);
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
			</SidebarHeader>
			<SidebarContent>
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
