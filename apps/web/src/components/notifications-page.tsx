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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@gitpal/ui/components/select";
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
import { MultiSelectField } from "./multi-select-field";

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

const notificationProviderOptions = [
  {
    label: "Resend",
    value: "resend",
    logoUrl: "https://www.google.com/s2/favicons?domain=resend.com&sz=64",
    defaultLabel: "Resend email",
    description: "Send notifications to an email inbox.",
  },
  {
    label: "Telegram",
    value: "telegram",
    logoUrl: "https://cdn.simpleicons.org/telegram",
    defaultLabel: "Telegram",
    description: "Send notifications to a Telegram chat.",
  },
  {
    label: "Linear",
    value: "linear",
    logoUrl: "https://cdn.simpleicons.org/linear",
    defaultLabel: "Linear issue",
    description: "Post notifications into a Linear issue thread.",
  },
  {
    label: "Microsoft Teams",
    value: "teams",
    logoUrl: "https://cdn.simpleicons.org/microsoftteams",
    defaultLabel: "Teams channel",
    description: "Send notifications to a Teams conversation.",
  },
  {
    label: "Slack",
    value: "slack",
    logoUrl: "https://cdn.simpleicons.org/slack",
    defaultLabel: "Slack channel",
    description: "Send notifications to a Slack channel.",
  },
] as const;

type StatusFilter = (typeof statusFilters)[number]["value"];
type CategoryFilter = (typeof categoryOptions)[number]["value"];
type SeverityFilter = (typeof severityOptions)[number]["value"];
type NotificationChannelProvider =
  (typeof notificationProviderOptions)[number]["value"];
type NotificationPageTab = "inbox" | "channels";

type NotificationChannel = {
  id: string;
  provider: NotificationChannelProvider;
  label: string;
  targetId: string | null;
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
  provider: NotificationChannelProvider;
  label: string;
  enabled: boolean;
  categories: CategoryFilter[];
  severities: SeverityFilter[];
  telegramBotToken: string;
  telegramChatId: string;
  telegramWebhookSecretToken: string;
  telegramBotUsername: string;
  slackBotToken: string;
  slackChannelId: string;
  slackSigningSecret: string;
  slackBotUsername: string;
  teamsAppId: string;
  teamsAppPassword: string;
  teamsAppTenantId: string;
  teamsConversationId: string;
  teamsServiceUrl: string;
  teamsAppType: "MultiTenant" | "SingleTenant";
  teamsBotUsername: string;
  linearApiKey: string;
  linearAccessToken: string;
  linearIssueId: string;
  linearWebhookSecret: string;
  linearBotUsername: string;
  resendApiKey: string;
  resendFromAddress: string;
  resendFromName: string;
  resendToEmail: string;
  resendWebhookSecret: string;
};

function isCategoryFilter(value: string): value is CategoryFilter {
  return categoryOptions.some((category) => category.value === value);
}

function isSeverityFilter(value: string): value is SeverityFilter {
  return severityOptions.some((severity) => severity.value === value);
}

function getProviderOption(provider: NotificationChannelProvider) {
  return (
    notificationProviderOptions.find((option) => option.value === provider) ??
    notificationProviderOptions[1]
  );
}

function buildDefaultChannelForm(
  channel: NotificationChannel | null,
): ChannelFormState {
  const channelCategories =
    channel?.settings.categories.filter(isCategoryFilter) ?? [];
  const channelSeverities =
    channel?.settings.severities.filter(isSeverityFilter) ?? [];
  const provider = channel?.provider ?? "telegram";
  const providerOption = getProviderOption(provider);

  return {
    provider,
    label: channel?.label ?? providerOption.defaultLabel,
    enabled: channel?.enabled ?? true,
    categories: channelCategories.length
      ? channelCategories
      : [...categoryOptions.map((category) => category.value)],
    severities: channelSeverities.length
      ? channelSeverities
      : ["success", "warning", "error"],
    telegramBotToken: "",
    telegramChatId: "",
    telegramWebhookSecretToken: "",
    telegramBotUsername: "",
    slackBotToken: "",
    slackChannelId: "",
    slackSigningSecret: "",
    slackBotUsername: "",
    teamsAppId: "",
    teamsAppPassword: "",
    teamsAppTenantId: "",
    teamsConversationId: "",
    teamsServiceUrl: "",
    teamsAppType: "MultiTenant",
    teamsBotUsername: "",
    linearApiKey: "",
    linearAccessToken: "",
    linearIssueId: "",
    linearWebhookSecret: "",
    linearBotUsername: "",
    resendApiKey: "",
    resendFromAddress: "",
    resendFromName: "",
    resendToEmail: "",
    resendWebhookSecret: "",
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

function ChannelProviderLogo({
  provider,
}: {
  provider: NotificationChannelProvider;
}) {
  const providerOption = getProviderOption(provider);

  return (
    // biome-ignore lint/performance/noImgElement: Provider logos are loaded from fixed third-party URLs without expanding Next image domains.
    <img
      src={providerOption.logoUrl}
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

    const basePayload = {
      channelId: channelDialog.channel?.id,
      provider: channelForm.provider,
      label: channelForm.label,
      enabled: channelForm.enabled,
      settings: {
        categories: channelForm.categories,
        severities: channelForm.severities,
      },
    };

    if (channelForm.provider === "telegram") {
      saveChannelMutation.mutate({
        ...basePayload,
        provider: "telegram",
        telegram: {
          botToken: channelForm.telegramBotToken.trim() || undefined,
          chatId: channelForm.telegramChatId.trim() || undefined,
          webhookSecretToken:
            channelForm.telegramWebhookSecretToken.trim() || undefined,
          botUsername: channelForm.telegramBotUsername.trim() || undefined,
        },
      });
      return;
    }

    if (channelForm.provider === "slack") {
      saveChannelMutation.mutate({
        ...basePayload,
        provider: "slack",
        slack: {
          botToken: channelForm.slackBotToken.trim() || undefined,
          channelId: channelForm.slackChannelId.trim() || undefined,
          signingSecret: channelForm.slackSigningSecret.trim() || undefined,
          botUsername: channelForm.slackBotUsername.trim() || undefined,
        },
      });
      return;
    }

    if (channelForm.provider === "teams") {
      saveChannelMutation.mutate({
        ...basePayload,
        provider: "teams",
        teams: {
          appId: channelForm.teamsAppId.trim() || undefined,
          appPassword: channelForm.teamsAppPassword.trim() || undefined,
          appTenantId: channelForm.teamsAppTenantId.trim() || undefined,
          conversationId: channelForm.teamsConversationId.trim() || undefined,
          serviceUrl: channelForm.teamsServiceUrl.trim() || undefined,
          appType: channelForm.teamsAppType,
          botUsername: channelForm.teamsBotUsername.trim() || undefined,
        },
      });
      return;
    }

    if (channelForm.provider === "linear") {
      saveChannelMutation.mutate({
        ...basePayload,
        provider: "linear",
        linear: {
          apiKey: channelForm.linearApiKey.trim() || undefined,
          accessToken: channelForm.linearAccessToken.trim() || undefined,
          issueId: channelForm.linearIssueId.trim() || undefined,
          webhookSecret: channelForm.linearWebhookSecret.trim() || undefined,
          botUsername: channelForm.linearBotUsername.trim() || undefined,
        },
      });
      return;
    }

    saveChannelMutation.mutate({
      ...basePayload,
      provider: "resend",
      resend: {
        apiKey: channelForm.resendApiKey.trim() || undefined,
        fromAddress: channelForm.resendFromAddress.trim() || undefined,
        fromName: channelForm.resendFromName.trim() || undefined,
        toEmail: channelForm.resendToEmail.trim() || undefined,
        webhookSecret: channelForm.resendWebhookSecret.trim() || undefined,
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
              Add channel
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
                        <ChannelProviderLogo provider={channel.provider} />
                      </div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <CardTitle className="truncate">
                          {channel.label}
                        </CardTitle>
                        <CardDescription className="truncate">
                          {channel.targetPreview ??
                            `${getProviderOption(channel.provider).label} target configured`}
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
                      Add a delivery channel to receive selected GitPal
                      notifications outside the app.
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
                  {channelDialog.channel ? "Manage" : "Add"}{" "}
                  {getProviderOption(channelForm.provider).label}
                </DialogTitle>
                <DialogDescription>
                  {getProviderOption(channelForm.provider).description} Pick the
                  events this channel should receive.
                </DialogDescription>
              </DialogHeader>

              <FieldGroup>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="notification-channel-provider">
                      Provider
                    </FieldLabel>
                    <Select
                      items={notificationProviderOptions}
                      value={channelForm.provider}
                      onValueChange={(value) => {
                        if (!value || channelDialog.channel) {
                          return;
                        }

                        const nextProvider =
                          value as NotificationChannelProvider;
                        setChannelForm({
                          ...channelForm,
                          provider: nextProvider,
                          label: getProviderOption(nextProvider).defaultLabel,
                        });
                      }}
                    >
                      <SelectTrigger
                        id="notification-channel-provider"
                        className="w-full"
                        disabled={Boolean(channelDialog.channel)}
                      >
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {notificationProviderOptions.map((provider) => (
                          <SelectItem
                            key={provider.value}
                            value={provider.value}
                          >
                            {provider.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
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
                        Send matching notifications through this channel.
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                </div>

                {channelForm.provider === "telegram" ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="notification-telegram-token">
                        Bot token
                      </FieldLabel>
                      <Input
                        id="notification-telegram-token"
                        type="password"
                        autoComplete="new-password"
                        value={channelForm.telegramBotToken}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            telegramBotToken: event.target.value,
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
                      <FieldLabel htmlFor="notification-telegram-chat">
                        Chat ID
                      </FieldLabel>
                      <Input
                        id="notification-telegram-chat"
                        value={channelForm.telegramChatId}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            telegramChatId: event.target.value,
                          })
                        }
                        placeholder={
                          channelDialog.channel?.targetPreview ??
                          "Telegram chat ID"
                        }
                        required={!channelDialog.channel?.targetPreview}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="notification-telegram-secret">
                        Webhook secret token
                      </FieldLabel>
                      <Input
                        id="notification-telegram-secret"
                        type="password"
                        autoComplete="new-password"
                        value={channelForm.telegramWebhookSecretToken}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            telegramWebhookSecretToken: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="notification-telegram-username">
                        Bot username
                      </FieldLabel>
                      <Input
                        id="notification-telegram-username"
                        value={channelForm.telegramBotUsername}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            telegramBotUsername: event.target.value,
                          })
                        }
                        placeholder="@gitpal_bot"
                      />
                    </Field>
                  </div>
                ) : null}

                {channelForm.provider === "slack" ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="notification-slack-token">
                        Bot token
                      </FieldLabel>
                      <Input
                        id="notification-slack-token"
                        type="password"
                        autoComplete="new-password"
                        value={channelForm.slackBotToken}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            slackBotToken: event.target.value,
                          })
                        }
                        placeholder={
                          channelDialog.channel?.credentialPreview ?? "xoxb-..."
                        }
                        required={!channelDialog.channel?.credentialPreview}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="notification-slack-channel">
                        Channel ID
                      </FieldLabel>
                      <Input
                        id="notification-slack-channel"
                        value={channelForm.slackChannelId}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            slackChannelId: event.target.value,
                          })
                        }
                        placeholder={
                          channelDialog.channel?.targetPreview ?? "C0123456789"
                        }
                        required={!channelDialog.channel?.targetPreview}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="notification-slack-secret">
                        Signing secret
                      </FieldLabel>
                      <Input
                        id="notification-slack-secret"
                        type="password"
                        autoComplete="new-password"
                        value={channelForm.slackSigningSecret}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            slackSigningSecret: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="notification-slack-username">
                        Bot username
                      </FieldLabel>
                      <Input
                        id="notification-slack-username"
                        value={channelForm.slackBotUsername}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            slackBotUsername: event.target.value,
                          })
                        }
                        placeholder="gitpal"
                      />
                    </Field>
                  </div>
                ) : null}

                {channelForm.provider === "teams" ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="notification-teams-app-id">
                        App ID
                      </FieldLabel>
                      <Input
                        id="notification-teams-app-id"
                        value={channelForm.teamsAppId}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            teamsAppId: event.target.value,
                          })
                        }
                        required={!channelDialog.channel?.credentialPreview}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="notification-teams-password">
                        App password
                      </FieldLabel>
                      <Input
                        id="notification-teams-password"
                        type="password"
                        autoComplete="new-password"
                        value={channelForm.teamsAppPassword}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            teamsAppPassword: event.target.value,
                          })
                        }
                        placeholder={
                          channelDialog.channel?.credentialPreview ??
                          "Teams app password"
                        }
                        required={!channelDialog.channel?.credentialPreview}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="notification-teams-tenant">
                        Tenant ID
                      </FieldLabel>
                      <Input
                        id="notification-teams-tenant"
                        value={channelForm.teamsAppTenantId}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            teamsAppTenantId: event.target.value,
                          })
                        }
                        required={!channelDialog.channel?.targetPreview}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="notification-teams-type">
                        App type
                      </FieldLabel>
                      <Select
                        items={[
                          { label: "Multi tenant", value: "MultiTenant" },
                          { label: "Single tenant", value: "SingleTenant" },
                        ]}
                        value={channelForm.teamsAppType}
                        onValueChange={(value) =>
                          setChannelForm({
                            ...channelForm,
                            teamsAppType:
                              value === "SingleTenant"
                                ? "SingleTenant"
                                : "MultiTenant",
                          })
                        }
                      >
                        <SelectTrigger
                          id="notification-teams-type"
                          className="w-full"
                        >
                          <SelectValue placeholder="Select app type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MultiTenant">
                            Multi tenant
                          </SelectItem>
                          <SelectItem value="SingleTenant">
                            Single tenant
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="notification-teams-conversation">
                        Conversation ID
                      </FieldLabel>
                      <Input
                        id="notification-teams-conversation"
                        value={channelForm.teamsConversationId}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            teamsConversationId: event.target.value,
                          })
                        }
                        placeholder={
                          channelDialog.channel?.targetPreview ?? "19:..."
                        }
                        required={!channelDialog.channel?.targetPreview}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="notification-teams-service-url">
                        Service URL
                      </FieldLabel>
                      <Input
                        id="notification-teams-service-url"
                        type="url"
                        value={channelForm.teamsServiceUrl}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            teamsServiceUrl: event.target.value,
                          })
                        }
                        placeholder="https://smba.trafficmanager.net/..."
                        required={!channelDialog.channel?.targetPreview}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="notification-teams-username">
                        Bot username
                      </FieldLabel>
                      <Input
                        id="notification-teams-username"
                        value={channelForm.teamsBotUsername}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            teamsBotUsername: event.target.value,
                          })
                        }
                        placeholder="GitPal"
                      />
                    </Field>
                  </div>
                ) : null}

                {channelForm.provider === "linear" ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="notification-linear-api-key">
                        API key
                      </FieldLabel>
                      <Input
                        id="notification-linear-api-key"
                        type="password"
                        autoComplete="new-password"
                        value={channelForm.linearApiKey}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            linearApiKey: event.target.value,
                          })
                        }
                        placeholder={
                          channelDialog.channel?.credentialPreview ??
                          "lin_api_..."
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="notification-linear-token">
                        Access token
                      </FieldLabel>
                      <Input
                        id="notification-linear-token"
                        type="password"
                        autoComplete="new-password"
                        value={channelForm.linearAccessToken}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            linearAccessToken: event.target.value,
                          })
                        }
                        placeholder={
                          channelDialog.channel?.credentialPreview ??
                          "OAuth access token"
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="notification-linear-issue">
                        Issue ID
                      </FieldLabel>
                      <Input
                        id="notification-linear-issue"
                        value={channelForm.linearIssueId}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            linearIssueId: event.target.value,
                          })
                        }
                        placeholder={
                          channelDialog.channel?.targetPreview ?? "ENG-123"
                        }
                        required={!channelDialog.channel?.targetPreview}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="notification-linear-webhook">
                        Webhook secret
                      </FieldLabel>
                      <Input
                        id="notification-linear-webhook"
                        type="password"
                        autoComplete="new-password"
                        value={channelForm.linearWebhookSecret}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            linearWebhookSecret: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="notification-linear-username">
                        Bot username
                      </FieldLabel>
                      <Input
                        id="notification-linear-username"
                        value={channelForm.linearBotUsername}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            linearBotUsername: event.target.value,
                          })
                        }
                        placeholder="gitpal"
                      />
                    </Field>
                  </div>
                ) : null}

                {channelForm.provider === "resend" ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="notification-resend-api-key">
                        API key
                      </FieldLabel>
                      <Input
                        id="notification-resend-api-key"
                        type="password"
                        autoComplete="new-password"
                        value={channelForm.resendApiKey}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            resendApiKey: event.target.value,
                          })
                        }
                        placeholder={
                          channelDialog.channel?.credentialPreview ?? "re_..."
                        }
                        required={!channelDialog.channel?.credentialPreview}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="notification-resend-to">
                        Recipient email
                      </FieldLabel>
                      <Input
                        id="notification-resend-to"
                        type="email"
                        value={channelForm.resendToEmail}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            resendToEmail: event.target.value,
                          })
                        }
                        placeholder={
                          channelDialog.channel?.targetPreview ??
                          "alerts@example.com"
                        }
                        required={!channelDialog.channel?.targetPreview}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="notification-resend-from">
                        From address
                      </FieldLabel>
                      <Input
                        id="notification-resend-from"
                        type="email"
                        value={channelForm.resendFromAddress}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            resendFromAddress: event.target.value,
                          })
                        }
                        placeholder="GitPal <notifications@example.com>"
                        required={!channelDialog.channel?.targetPreview}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="notification-resend-from-name">
                        From name
                      </FieldLabel>
                      <Input
                        id="notification-resend-from-name"
                        value={channelForm.resendFromName}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            resendFromName: event.target.value,
                          })
                        }
                        placeholder="GitPal"
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="notification-resend-webhook">
                        Webhook secret
                      </FieldLabel>
                      <Input
                        id="notification-resend-webhook"
                        type="password"
                        autoComplete="new-password"
                        value={channelForm.resendWebhookSecret}
                        onChange={(event) =>
                          setChannelForm({
                            ...channelForm,
                            resendWebhookSecret: event.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>
                ) : null}

                <FieldSet>
                  <FieldLegend>Notification filters</FieldLegend>
                  <Field>
                    <FieldTitle>Categories</FieldTitle>
                    <FieldDescription>
                      The channel receives notifications from selected product
                      areas.
                    </FieldDescription>
                    <MultiSelectField
                      value={channelForm.categories}
                      onChange={(value) =>
                        setChannelForm({
                          ...channelForm,
                          categories: value.filter(isCategoryFilter),
                        })
                      }
                      options={[...categoryOptions]}
                      placeholder="Select categories"
                      searchPlaceholder="Search categories..."
                    />
                  </Field>
                  <Field>
                    <FieldTitle>Severities</FieldTitle>
                    <MultiSelectField
                      value={channelForm.severities}
                      onChange={(value) =>
                        setChannelForm({
                          ...channelForm,
                          severities: value.filter(isSeverityFilter),
                        })
                      }
                      options={[...severityOptions]}
                      placeholder="Select severities"
                      searchPlaceholder="Search severities..."
                    />
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
