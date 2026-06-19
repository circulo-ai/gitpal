"use client";

import { Badge } from "@gitpal/ui/components/badge";
import { Button } from "@gitpal/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@gitpal/ui/components/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@gitpal/ui/components/empty";
import { Skeleton } from "@gitpal/ui/components/skeleton";
import { cn } from "@gitpal/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { BellIcon, InboxIcon, RefreshCcwIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { queryClient, trpc } from "@/utils/trpc";

const statusFilters = [
	{ label: "Active", value: "active" },
	{ label: "Unread", value: "unread" },
	{ label: "Read", value: "read" },
	{ label: "Archived", value: "archived" },
	{ label: "All", value: "all" },
] as const;

type StatusFilter = (typeof statusFilters)[number]["value"];

function severityBadgeClass(severity: string) {
	if (severity === "error") {
		return "border-destructive/30 bg-destructive/10 text-destructive";
	}

	if (severity === "warning") {
		return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
	}

	if (severity === "success") {
		return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
	}

	return "border-border bg-muted/30 text-foreground";
}

function statusBadgeClass(status: string) {
	if (status === "unread") {
		return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
	}

	if (status === "read") {
		return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
	}

	if (status === "archived") {
		return "border-muted-foreground/30 bg-muted/40 text-muted-foreground";
	}

	return "border-border bg-muted/30 text-foreground";
}

function NotificationSkeleton() {
	return (
		<div className="rounded-xl border border-border/60 bg-background p-4">
			<div className="flex items-start gap-4">
				<Skeleton className="mt-1 size-10 shrink-0 rounded-full" />
				<div className="flex-1 space-y-3">
					<Skeleton className="h-5 w-2/3" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-5/6" />
				</div>
			</div>
		</div>
	);
}

export function NotificationsPage() {
	const [status, setStatus] = React.useState<StatusFilter>("active");
	const notificationsQuery = useQuery(
		trpc.notifications.list.queryOptions({
			status,
			limit: 50,
		}),
	);

	const refreshNotifications = React.useCallback(async () => {
		await queryClient.invalidateQueries({
			queryKey: trpc.notifications.list.queryKey(),
		});
		await queryClient.invalidateQueries({
			queryKey: trpc.notifications.unreadCount.queryKey(),
		});
	}, []);

	const markReadMutation = useMutation(
		trpc.notifications.markRead.mutationOptions({
			onSuccess: async () => {
				await refreshNotifications();
				toast.success("Notification marked as read.");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const markAllReadMutation = useMutation(
		trpc.notifications.markAllRead.mutationOptions({
			onSuccess: async () => {
				await refreshNotifications();
				toast.success("All notifications marked as read.");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const archiveMutation = useMutation(
		trpc.notifications.archive.mutationOptions({
			onSuccess: async () => {
				await refreshNotifications();
				toast.success("Notification archived.");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const notifications = notificationsQuery.data ?? [];
	const unreadCount = notifications.filter(
		(notification) => notification.status === "unread",
	).length;

	return (
		<main className="flex flex-col gap-6">
			<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
				<div className="space-y-1">
					<h1 className="font-heading font-medium text-2xl tracking-tight md:text-3xl">
						Notifications
					</h1>
					<p className="max-w-3xl text-muted-foreground text-sm">
						Review important product events, mark them as read, or archive
						anything you do not need to keep in the inbox.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Badge variant="outline">{unreadCount} unread</Badge>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => {
							void refreshNotifications();
						}}
					>
						<RefreshCcwIcon />
						Refresh
					</Button>
				</div>
			</div>

			<Card>
				<CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
					<div>
						<CardTitle>Inbox</CardTitle>
						<CardDescription>
							Filter the stream by status and work through items in order.
						</CardDescription>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{statusFilters.map((item) => (
							<Button
								key={item.value}
								type="button"
								variant={status === item.value ? "default" : "outline"}
								size="sm"
								onClick={() => setStatus(item.value)}
							>
								{item.label}
							</Button>
						))}
						{unreadCount > 0 ? (
							<Button
								type="button"
								variant="secondary"
								size="sm"
								onClick={() => {
									markAllReadMutation.mutate();
								}}
								disabled={markAllReadMutation.isPending}
							>
								Mark all read
							</Button>
						) : null}
					</div>
				</CardHeader>
				<CardContent>
					{notificationsQuery.isLoading ? (
						<div className="space-y-3">
							{Array.from({ length: 6 }).map((_, index) => (
								<NotificationSkeleton key={index} />
							))}
						</div>
					) : notifications.length > 0 ? (
						<div className="space-y-3">
							{notifications.map((notification) => (
								<div
									key={notification.id}
									className="rounded-xl border border-border/60 bg-background p-4"
								>
									<div className="flex items-start gap-4">
										<div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/40">
											<BellIcon className="size-4 text-muted-foreground" />
										</div>
										<div className="min-w-0 flex-1">
											<div className="flex flex-wrap items-center gap-2">
												<h3 className="font-medium">{notification.title}</h3>
												<Badge
													variant="outline"
													className={cn(statusBadgeClass(notification.status))}
												>
													{notification.status}
												</Badge>
												<Badge
													variant="outline"
													className={cn(
														severityBadgeClass(notification.severity),
													)}
												>
													{notification.severity}
												</Badge>
											</div>
											<p className="mt-2 text-muted-foreground text-sm">
												{notification.body ?? "No additional details."}
											</p>
											<div className="mt-3 flex flex-wrap items-center gap-3 text-muted-foreground text-xs">
												<span>
													{formatDistanceToNow(
														new Date(notification.createdAt),
														{ addSuffix: true },
													)}
												</span>
												{notification.sourceType ? (
													<span className="font-mono">
														{notification.sourceType}
													</span>
												) : null}
												{notification.sourceId ? (
													<span className="font-mono">
														{notification.sourceId}
													</span>
												) : null}
											</div>
										</div>
										<div className="flex shrink-0 flex-col gap-2 sm:flex-row">
											{notification.status === "unread" ? (
												<Button
													type="button"
													variant="secondary"
													size="sm"
													disabled={markReadMutation.isPending}
													onClick={() => {
														markReadMutation.mutate({ ids: [notification.id] });
													}}
												>
													Mark read
												</Button>
											) : null}
											{notification.status !== "archived" ? (
												<Button
													type="button"
													variant="outline"
													size="sm"
													disabled={archiveMutation.isPending}
													onClick={() => {
														archiveMutation.mutate({ ids: [notification.id] });
													}}
												>
													Archive
												</Button>
											) : null}
										</div>
									</div>
								</div>
							))}
						</div>
					) : (
						<Empty className="min-h-72">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<InboxIcon />
								</EmptyMedia>
								<EmptyTitle>No notifications</EmptyTitle>
								<EmptyDescription>
									You are all caught up for the selected filter.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					)}
				</CardContent>
			</Card>
		</main>
	);
}
