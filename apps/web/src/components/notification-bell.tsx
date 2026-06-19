"use client";

import { Badge } from "@gitpal/ui/components/badge";
import { Button } from "@gitpal/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { BellIcon } from "lucide-react";
import Link from "next/link";
import { trpc } from "@/utils/trpc";

export function NotificationBell() {
	const unreadQuery = useQuery(trpc.notifications.unreadCount.queryOptions());
	const unreadCount = unreadQuery.data?.total ?? 0;
	const label =
		unreadCount > 0
			? `${unreadCount} unread notifications`
			: "Open notifications";

	return (
		<Button
			variant="ghost"
			size="icon"
			className="relative"
			aria-label={label}
			render={<Link href="/notifications" />}
		>
			<BellIcon />
			{unreadCount > 0 ? (
				<Badge className="absolute -top-1 -right-1 h-5 min-w-5 justify-center rounded-full px-1 text-[10px]">
					{unreadCount > 99 ? "99+" : unreadCount}
				</Badge>
			) : null}
		</Button>
	);
}
