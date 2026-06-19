"use client";

import { Badge } from "@gitpal/ui/components/badge";
import { Button } from "@gitpal/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@gitpal/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@gitpal/ui/components/dialog";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@gitpal/ui/components/empty";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
	FieldTitle,
} from "@gitpal/ui/components/field";
import { Input } from "@gitpal/ui/components/input";
import { Skeleton } from "@gitpal/ui/components/skeleton";
import { Switch } from "@gitpal/ui/components/switch";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@gitpal/ui/components/tabs";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@gitpal/ui/components/toggle-group";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
	ArchiveIcon,
	BellIcon,
	CheckCheckIcon,
	InboxIcon,
	PlusCircleIcon,
	RefreshCcwIcon,
	SendIcon,
	Settings2Icon,
	Trash2Icon,
} from "lucide-react";
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

const categoryOptions = [
	{ label: "Reviews", value: "review" },
	{ label: "Billing", value: "billing" },
	{ label: "AI", value: "ai" },
	{ label: "Webhooks", value: "webhook" },
	{ label: "Correctness", value: "correctness" },
	{ label: "Security", value: "security" },
	{ label: "Performance", value: "performance" },
	{ label: "Maintainability", value: "maintainability" },
	{ label: "Testing", value: "testing" },
	{ label: "Docs", value: "documentation" },
	{ label: "Architecture", value: "architecture" },
] as const;

const severityOptions = [
	{ label: "Info", value: "info" },
	{ label: "Success", value: "success" },
	{ label: "Warning", value: "warning" },
	{ label: "Error", value: "error" },
] as const;

const telegramLogoUrl = "https://cdn.simpleicons.org/telegram";

type StatusFilter = (typeof statusFilters)[number]["value"];
type CategoryFilter = (typeof categoryOptions)[number]["value"];
type SeverityFilter = (typeof severityOptions)[number]["value"];
type NotificationPageTab = "inbox" | "channels";

type NotificationChannel = {
	id: string;
	provider: "telegram";
	label: string;
	targetPreview: string | null;
	credentialPreview: string | null;
	settings: {
		categories: CategoryFilter[];
		severities: SeverityFilter[];
	};
	status: "configured" | "connected" | "disabled" | "error";
	enabled: boolean;
	lastTestedAt: string | null;
	lastError: string | null;
	createdAt: string;
	updatedAt: string;
};

type ChannelDialogState = {
	channel: NotificationChannel | null;
};

type ChannelFormState = {
	label: string;
	botToken: string;
	chatId: string;
	enabled: boolean;
	categories: CategoryFilter[];
	severities: SeverityFilter[];
};

function isCategoryFilter(value: string): value is CategoryFilter {
	return categoryOptions.some((category) => category.value === value);
}

function buildDefaultChannelForm(
	channel: NotificationChannel | null,
): ChannelFormState {
	const channelCategories =
		channel?.settings.categories.filter(isCategoryFilter) ?? [];

	return {
		label: channel?.label ?? "Telegram",
		botToken: "",
		chatId: "",
		enabled: channel?.enabled ?? true,
		categories: channelCategories.length
			? channelCategories
			: [...categoryOptions.map((category) => category.value)],
		severities: channel?.settings.severities.length
			? channel.settings.severities
			: ["success", "warning", "error"],
	};
}

function severityBadgeVariant(severity: string) {
	if (severity === "error") {
		return "destructive" as const;
	}

	if (severity === "success") {
		return "secondary" as const;
	}

	return "outline" as const;
}

function statusBadgeVariant(status: string) {
	if (status === "unread" || status === "read") {
		return "secondary" as const;
	}

	return "outline" as const;
}

function channelStatusLabel(channel: NotificationChannel) {
	if (!channel.enabled || channel.status === "disabled") {
		return "Disabled";
	}

	if (channel.status === "connected") {
		return "Connected";
	}

	if (channel.status === "error") {
		return "Needs attention";
	}

	return "Configured";
}

function channelStatusVariant(channel: NotificationChannel) {
	if (channel.status === "error") {
		return "destructive" as const;
	}

	if (channel.enabled && channel.status === "connected") {
		return "secondary" as const;
	}

	return "outline" as const;
}

function NotificationSkeleton() {
	return (
		<div className="rounded-lg border border-border/60 bg-background p-4">
			<div className="flex items-start gap-4">
				<Skeleton className="mt-1 size-10 shrink-0 rounded-full" />
				<div className="flex flex-1 flex-col gap-3">
					<Skeleton className="h-5 w-2/3" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-5/6" />
				</div>
			</div>
		</div>
	);
}

function TelegramLogo() {
	return (
		// biome-ignore lint/performance/noImgElement: Telegram's official logo is loaded from a fixed third-party URL without expanding Next image domains.
		<img
			src={telegramLogoUrl}
			alt=""
			className="size-6"
			loading="lazy"
			decoding="async"
		/>
	);
}

export function NotificationsPage() {
	const [tab, setTab] = React.useState<NotificationPageTab>("inbox");
	const [status, setStatus] = React.useState<StatusFilter>("active");
	const [channelDialog, setChannelDialog] =
		React.useState<ChannelDialogState | null>(null);
	const [channelForm, setChannelForm] = React.useState<ChannelFormState | null>(
		null,
	);

	const notificationsQuery = useQuery(
		trpc.notifications.list.queryOptions({
			status,
			limit: 50,
		}),
	);
	const channelsQuery = useQuery(trpc.notifications.channels.queryOptions());

	React.useEffect(() => {
		setChannelForm(
			channelDialog ? buildDefaultChannelForm(channelDialog.channel) : null,
		);
	}, [channelDialog]);

	const refreshNotifications = React.useCallback(async () => {
		await queryClient.invalidateQueries({
			queryKey: trpc.notifications.list.queryKey(),
		});
		await queryClient.invalidateQueries({
			queryKey: trpc.notifications.unreadCount.queryKey(),
		});
	}, []);

	const refreshChannels = React.useCallback(async () => {
		await queryClient.invalidateQueries({
			queryKey: trpc.notifications.channels.queryKey(),
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

	const saveChannelMutation = useMutation(
		trpc.notifications.saveChannel.mutationOptions({
			onSuccess: async () => {
				await refreshChannels();
				setChannelDialog(null);
				toast.success("Notification channel saved.");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const toggleChannelMutation = useMutation(
		trpc.notifications.toggleChannel.mutationOptions({
			onSuccess: async () => {
				await refreshChannels();
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const deleteChannelMutation = useMutation(
		trpc.notifications.deleteChannel.mutationOptions({
			onSuccess: async () => {
				await refreshChannels();
				setChannelDialog(null);
				toast.success("Notification channel removed.");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const testChannelMutation = useMutation(
		trpc.notifications.testChannel.mutationOptions({
			onSuccess: async () => {
				await Promise.all([refreshChannels(), refreshNotifications()]);
				toast.success("Test notification sent.");
			},
			onError: async (error) => {
				await refreshChannels();
				toast.error(error.message);
			},
		}),
	);

	const notifications = notificationsQuery.data ?? [];
	const channels = (channelsQuery.data ?? []) as NotificationChannel[];
	const unreadCount = notifications.filter(
		(notification) => notification.status === "unread",
	).length;
	const enabledChannelCount = channels.filter(
		(channel) => channel.enabled,
	).length;

	function handleSaveChannel(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (!channelDialog || !channelForm) {
			return;
		}

		saveChannelMutation.mutate({
			channelId: channelDialog.channel?.id,
			provider: "telegram",
			label: channelForm.label,
			enabled: channelForm.enabled,
			settings: {
				categories: channelForm.categories,
				severities: channelForm.severities,
			},
			telegram: {
				botToken: channelForm.botToken.trim() || undefined,
				chatId: channelForm.chatId.trim() || undefined,
			},
		});
	}

	return (
		<main className="flex flex-col gap-6">
			<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
				<div className="flex flex-col gap-1">
					<h1 className="font-heading font-medium text-2xl tracking-tight md:text-3xl">
						Notifications
					</h1>
					<p className="max-w-3xl text-muted-foreground text-sm">
						Review product events and route the right ones into external
						channels.
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant="outline">{unreadCount} unread</Badge>
					<Badge variant="outline">{enabledChannelCount} channels</Badge>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => {
							void Promise.all([refreshNotifications(), refreshChannels()]);
						}}
					>
						<RefreshCcwIcon data-icon="inline-start" />
						Refresh
					</Button>
				</div>
			</div>

			<Tabs
				value={tab}
				onValueChange={(value) => {
					if (value === "inbox" || value === "channels") {
						setTab(value);
					}
				}}
			>
				<TabsList>
					<TabsTrigger value="inbox">Inbox</TabsTrigger>
					<TabsTrigger value="channels">Channels</TabsTrigger>
				</TabsList>

				<TabsContent value="inbox" className="flex flex-col gap-4">
					<Card>
						<CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
							<div className="flex flex-col gap-1">
								<CardTitle>Inbox</CardTitle>
								<CardDescription>
									Filter the stream by status and work through items in order.
								</CardDescription>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<ToggleGroup
									value={[status]}
									onValueChange={(value) => {
										const nextStatus = value[0] as StatusFilter | undefined;
										if (nextStatus) {
											setStatus(nextStatus);
										}
									}}
									variant="outline"
									size="sm"
									spacing={0}
									className="max-w-full flex-wrap"
								>
									{statusFilters.map((item) => (
										<ToggleGroupItem key={item.value} value={item.value}>
											{item.label}
										</ToggleGroupItem>
									))}
								</ToggleGroup>
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
										<CheckCheckIcon data-icon="inline-start" />
										Mark all read
									</Button>
								) : null}
							</div>
						</CardHeader>
						<CardContent>
							{notificationsQuery.isLoading ? (
								<div className="flex flex-col gap-3">
									{Array.from({ length: 6 }).map((_, index) => (
										<NotificationSkeleton key={index} />
									))}
								</div>
							) : notifications.length > 0 ? (
								<div className="flex flex-col gap-3">
									{notifications.map((notification) => (
										<div
											key={notification.id}
											className="rounded-lg border border-border/60 bg-background p-4"
										>
											<div className="flex flex-col gap-4 sm:flex-row sm:items-start">
												<div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/40">
													<BellIcon />
												</div>
												<div className="flex min-w-0 flex-1 flex-col gap-3">
													<div className="flex flex-wrap items-center gap-2">
														<h3 className="font-medium">
															{notification.title}
														</h3>
														<Badge
															variant={statusBadgeVariant(notification.status)}
														>
															{notification.status}
														</Badge>
														<Badge
															variant={severityBadgeVariant(
																notification.severity,
															)}
														>
															{notification.severity}
														</Badge>
													</div>
													<p className="text-muted-foreground text-sm">
														{notification.body ?? "No additional details."}
													</p>
													<div className="flex flex-wrap items-center gap-3 text-muted-foreground text-xs">
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
												<div className="flex w-full shrink-0 gap-2 sm:w-auto sm:flex-col md:flex-row">
													{notification.status === "unread" ? (
														<Button
															type="button"
															variant="secondary"
															size="sm"
															className="flex-1 sm:flex-none"
															disabled={markReadMutation.isPending}
															onClick={() => {
																markReadMutation.mutate({
																	ids: [notification.id],
																});
															}}
														>
															<CheckCheckIcon data-icon="inline-start" />
															Mark read
														</Button>
													) : null}
													{notification.status !== "archived" ? (
														<Button
															type="button"
															variant="outline"
															size="sm"
															className="flex-1 sm:flex-none"
															disabled={archiveMutation.isPending}
															onClick={() => {
																archiveMutation.mutate({
																	ids: [notification.id],
																});
															}}
														>
															<ArchiveIcon data-icon="inline-start" />
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
				</TabsContent>

				<TabsContent value="channels" className="flex flex-col gap-4">
					<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
						<div className="flex flex-col gap-1">
							<h2 className="font-medium text-lg">Delivery channels</h2>
							<p className="max-w-2xl text-muted-foreground text-sm">
								Choose which notification categories and severities should leave
								the app.
							</p>
						</div>
						<Button
							type="button"
							onClick={() => setChannelDialog({ channel: null })}
						>
							<PlusCircleIcon data-icon="inline-start" />
							Add Telegram
						</Button>
					</div>

					{channelsQuery.isLoading ? (
						<div className="grid gap-3 lg:grid-cols-2">
							<Skeleton className="h-56 w-full" />
							<Skeleton className="h-56 w-full" />
						</div>
					) : channels.length > 0 ? (
						<div className="grid gap-3 lg:grid-cols-2">
							{channels.map((channel) => (
								<Card key={channel.id} size="sm">
									<CardHeader>
										<div className="flex min-w-0 items-center gap-3">
											<div className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-background">
												<TelegramLogo />
											</div>
											<div className="flex min-w-0 flex-col gap-1">
												<CardTitle className="truncate">
													{channel.label}
												</CardTitle>
												<CardDescription className="truncate">
													{channel.targetPreview ?? "Telegram chat configured"}
												</CardDescription>
											</div>
										</div>
										<CardAction>
											<Switch
												checked={channel.enabled}
												disabled={toggleChannelMutation.isPending}
												onCheckedChange={(enabled) =>
													toggleChannelMutation.mutate({
														channelId: channel.id,
														enabled,
													})
												}
												aria-label={`Toggle ${channel.label}`}
											/>
										</CardAction>
									</CardHeader>
									<CardContent className="flex flex-col gap-4">
										<div className="flex flex-wrap gap-2">
											<Badge variant={channelStatusVariant(channel)}>
												{channelStatusLabel(channel)}
											</Badge>
											<Badge variant="outline">
												{channel.settings.categories.length} categories
											</Badge>
											<Badge variant="outline">
												{channel.settings.severities.join(", ")}
											</Badge>
										</div>
										{channel.lastError ? (
											<p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
												{channel.lastError}
											</p>
										) : null}
										<div className="flex flex-wrap items-center gap-2">
											<Button
												type="button"
												variant="secondary"
												size="sm"
												onClick={() =>
													setChannelDialog({
														channel,
													})
												}
											>
												<Settings2Icon data-icon="inline-start" />
												Manage
											</Button>
											<Button
												type="button"
												variant="outline"
												size="sm"
												disabled={
													testChannelMutation.isPending || !channel.enabled
												}
												onClick={() =>
													testChannelMutation.mutate({
														channelId: channel.id,
													})
												}
											>
												<SendIcon data-icon="inline-start" />
												Send test
											</Button>
											{channel.lastTestedAt ? (
												<span className="text-muted-foreground text-xs">
													Tested{" "}
													{formatDistanceToNow(new Date(channel.lastTestedAt), {
														addSuffix: true,
													})}
												</span>
											) : null}
										</div>
									</CardContent>
								</Card>
							))}
						</div>
					) : (
						<Card>
							<CardContent>
								<Empty className="min-h-72">
									<EmptyHeader>
										<EmptyMedia variant="icon">
											<BellIcon />
										</EmptyMedia>
										<EmptyTitle>No channels connected</EmptyTitle>
										<EmptyDescription>
											Add Telegram to receive selected GitPal notifications
											outside the app.
										</EmptyDescription>
									</EmptyHeader>
								</Empty>
							</CardContent>
						</Card>
					)}
				</TabsContent>
			</Tabs>

			<Dialog
				open={Boolean(channelDialog)}
				onOpenChange={(open) => {
					if (!open) {
						setChannelDialog(null);
					}
				}}
			>
				<DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
					{channelDialog && channelForm ? (
						<form className="flex flex-col gap-6" onSubmit={handleSaveChannel}>
							<DialogHeader>
								<DialogTitle>
									{channelDialog.channel ? "Manage" : "Add"} Telegram
								</DialogTitle>
								<DialogDescription>
									Connect a Telegram bot and pick the events this channel should
									receive.
								</DialogDescription>
							</DialogHeader>

							<FieldGroup>
								<div className="grid gap-4 md:grid-cols-2">
									<Field>
										<FieldLabel htmlFor="notification-channel-label">
											Label
										</FieldLabel>
										<Input
											id="notification-channel-label"
											value={channelForm.label}
											onChange={(event) =>
												setChannelForm({
													...channelForm,
													label: event.target.value,
												})
											}
											required
										/>
									</Field>
									<Field orientation="horizontal">
										<Switch
											checked={channelForm.enabled}
											onCheckedChange={(enabled) =>
												setChannelForm({ ...channelForm, enabled })
											}
											aria-label="Enable notification channel"
										/>
										<FieldContent>
											<FieldLabel>Enabled</FieldLabel>
											<FieldDescription>
												Send matching notifications through Telegram.
											</FieldDescription>
										</FieldContent>
									</Field>
								</div>

								<div className="grid gap-4 md:grid-cols-2">
									<Field>
										<FieldLabel htmlFor="notification-bot-token">
											Bot token
										</FieldLabel>
										<Input
											id="notification-bot-token"
											type="password"
											autoComplete="new-password"
											value={channelForm.botToken}
											onChange={(event) =>
												setChannelForm({
													...channelForm,
													botToken: event.target.value,
												})
											}
											placeholder={
												channelDialog.channel?.credentialPreview ??
												"Telegram bot token"
											}
											required={!channelDialog.channel?.credentialPreview}
										/>
									</Field>
									<Field>
										<FieldLabel htmlFor="notification-chat-id">
											Chat ID
										</FieldLabel>
										<Input
											id="notification-chat-id"
											value={channelForm.chatId}
											onChange={(event) =>
												setChannelForm({
													...channelForm,
													chatId: event.target.value,
												})
											}
											placeholder={
												channelDialog.channel?.targetPreview ??
												"Telegram chat ID"
											}
											required={!channelDialog.channel?.targetPreview}
										/>
									</Field>
								</div>

								<FieldSet>
									<FieldLegend>Notification filters</FieldLegend>
									<Field>
										<FieldTitle>Categories</FieldTitle>
										<FieldDescription>
											The channel receives notifications from selected product
											areas.
										</FieldDescription>
										<ToggleGroup
											value={channelForm.categories}
											onValueChange={(value) =>
												setChannelForm({
													...channelForm,
													categories: value as CategoryFilter[],
												})
											}
											variant="outline"
											size="sm"
											className="max-w-full flex-wrap justify-start"
										>
											{categoryOptions.map((category) => (
												<ToggleGroupItem
													key={category.value}
													value={category.value}
												>
													{category.label}
												</ToggleGroupItem>
											))}
										</ToggleGroup>
									</Field>
									<Field>
										<FieldTitle>Severities</FieldTitle>
										<ToggleGroup
											value={channelForm.severities}
											onValueChange={(value) =>
												setChannelForm({
													...channelForm,
													severities: value as SeverityFilter[],
												})
											}
											variant="outline"
											size="sm"
											className="max-w-full flex-wrap justify-start"
										>
											{severityOptions.map((severity) => (
												<ToggleGroupItem
													key={severity.value}
													value={severity.value}
												>
													{severity.label}
												</ToggleGroupItem>
											))}
										</ToggleGroup>
									</Field>
								</FieldSet>
							</FieldGroup>

							<DialogFooter className="gap-2 sm:justify-between">
								{channelDialog.channel ? (
									<Button
										type="button"
										variant="destructive"
										disabled={deleteChannelMutation.isPending}
										onClick={() =>
											deleteChannelMutation.mutate({
												channelId: channelDialog.channel?.id ?? "",
											})
										}
									>
										<Trash2Icon data-icon="inline-start" />
										Remove
									</Button>
								) : (
									<div />
								)}
								<div className="flex flex-col-reverse gap-2 sm:flex-row">
									<Button
										type="button"
										variant="outline"
										onClick={() => setChannelDialog(null)}
									>
										Cancel
									</Button>
									<Button
										type="submit"
										disabled={
											saveChannelMutation.isPending ||
											channelForm.categories.length === 0 ||
											channelForm.severities.length === 0
										}
									>
										<SendIcon data-icon="inline-start" />
										Save channel
									</Button>
								</div>
							</DialogFooter>
						</form>
					) : null}
				</DialogContent>
			</Dialog>
		</main>
	);
}
