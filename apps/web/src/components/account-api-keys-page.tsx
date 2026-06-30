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
import type { LlmProviderId } from "@gitpal/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
	CheckIcon,
	KeyRoundIcon,
	ShieldCheckIcon,
	Trash2Icon,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { queryClient, trpc } from "@/utils/trpc";

import { buildCuratedModelGroups, ModelIdPicker } from "./model-id-picker";
import { MultiSelectField } from "./multi-select-field";
import { SettingsChangeDock } from "./settings-change-dock";
import { PageHeader } from "./workspace-page";

function formatDate(value: string | null) {
	if (!value) {
		return "Never";
	}

	return formatDistanceToNow(new Date(value), {
		addSuffix: true,
	});
}

const expirationOptions = [
	{ label: "30 days", value: "30" },
	{ label: "90 days", value: "90" },
	{ label: "180 days", value: "180" },
	{ label: "365 days", value: "365" },
] as const;

const routerOptions = [
	{ label: "Vercel AI Gateway", value: "ai-gateway" },
	{ label: "OpenRouter", value: "openrouter" },
	{ label: "Ollama", value: "ollama" },
	{ label: "Direct only", value: "direct" },
] as const;

const fallbackRouterOptions = [
	{ label: "No fallback", value: "none" },
	...routerOptions,
] as const;

const CURATED_MODEL_GROUPS = buildCuratedModelGroups();

export function AccountApiKeysPage() {
	const appKeysQuery = useQuery(trpc.apiKeys.app.list.queryOptions());
	const byokProvidersQuery = useQuery(
		trpc.apiKeys.byok.providers.queryOptions(),
	);
	const byokKeysQuery = useQuery(trpc.apiKeys.byok.list.queryOptions());
	const routingQuery = useQuery(trpc.apiKeys.byok.getRouting.queryOptions());
	const [appKeyName, setAppKeyName] = React.useState("");
	const [appKeyExpiration, setAppKeyExpiration] = React.useState("90");
	const [latestCreatedKey, setLatestCreatedKey] = React.useState<string | null>(
		null,
	);
	const [editingKeyId, setEditingKeyId] = React.useState<string | null>(null);
	const [providerId, setProviderId] =
		React.useState<LlmProviderId>("anthropic");
	const [providerKeyName, setProviderKeyName] = React.useState("");
	const [providerApiKey, setProviderApiKey] = React.useState("");
	const [providerPriority, setProviderPriority] = React.useState("1");
	const [providerEnabled, setProviderEnabled] = React.useState(true);
	const [providerForceDirect, setProviderForceDirect] = React.useState(false);
	const [providerAllowedModels, setProviderAllowedModels] = React.useState<
		string[]
	>([]);
	const [routePreviewModel, setRoutePreviewModel] = React.useState(
		"anthropic/claude-sonnet-4.6",
	);
	const previewRouteQuery = useQuery({
		...trpc.apiKeys.byok.previewRoute.queryOptions({
			modelId: routePreviewModel,
		}),
		enabled: false,
	});
	const [routingSettings, setRoutingSettings] = React.useState<{
		defaultRouter: "ai-gateway" | "openrouter" | "ollama" | "direct";
		fallbackRouter: "ai-gateway" | "openrouter" | "ollama" | "direct" | null;
		preferUserKeys: boolean;
	} | null>(null);
	const [savedRoutingSettings, setSavedRoutingSettings] = React.useState<{
		defaultRouter: "ai-gateway" | "openrouter" | "ollama" | "direct";
		fallbackRouter: "ai-gateway" | "openrouter" | "ollama" | "direct" | null;
		preferUserKeys: boolean;
	} | null>(null);

	React.useEffect(() => {
		if (!routingQuery.data) {
			return;
		}

		setRoutingSettings(routingQuery.data);
		setSavedRoutingSettings(routingQuery.data);
	}, [routingQuery.data]);

	const createAppKeyMutation = useMutation(
		trpc.apiKeys.app.create.mutationOptions({
			onSuccess: async (data) => {
				setLatestCreatedKey(data.key);
				setAppKeyName("");
				await queryClient.invalidateQueries({
					queryKey: trpc.apiKeys.app.list.queryKey(),
				});
				toast.success("GitPal API key created.");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const updateAppKeyMutation = useMutation(
		trpc.apiKeys.app.update.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.apiKeys.app.list.queryKey(),
				});
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const deleteAppKeyMutation = useMutation(
		trpc.apiKeys.app.delete.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.apiKeys.app.list.queryKey(),
				});
				toast.success("GitPal API key deleted.");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const saveByokKeyMutation = useMutation(
		trpc.apiKeys.byok.save.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.apiKeys.byok.list.queryKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.apiKeys.byok.previewRoute.queryKey({
							modelId: routePreviewModel,
						}),
					}),
				]);
				setEditingKeyId(null);
				setProviderApiKey("");
				setProviderKeyName("");
				setProviderAllowedModels([]);
				setProviderPriority("1");
				setProviderEnabled(true);
				setProviderForceDirect(false);
				toast.success("Provider key saved.");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const deleteByokKeyMutation = useMutation(
		trpc.apiKeys.byok.delete.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.apiKeys.byok.list.queryKey(),
				});
				toast.success("Provider key deleted.");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const updateRoutingMutation = useMutation(
		trpc.apiKeys.byok.updateRouting.mutationOptions({
			onSuccess: async (data) => {
				setRoutingSettings(data);
				setSavedRoutingSettings(data);
				await queryClient.invalidateQueries({
					queryKey: trpc.apiKeys.byok.getRouting.queryKey(),
				});
				toast.success("Routing preferences updated.");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const appKeys = appKeysQuery.data ?? [];
	const providerCatalog = byokProvidersQuery.data ?? [];
	const byokKeys = byokKeysQuery.data ?? [];
	const routingDirty =
		Boolean(routingSettings && savedRoutingSettings) &&
		JSON.stringify(routingSettings) !== JSON.stringify(savedRoutingSettings);
	const selectedProvider =
		providerCatalog.find((provider) => provider.id === providerId) ??
		providerCatalog[0] ??
		null;
	const providerSelectItems = providerCatalog.map((provider) => ({
		label: provider.label,
		value: provider.id,
	}));
	const providerModelOptions = (selectedProvider?.suggestedModels ?? []).map(
		(modelId) => ({
			value: modelId,
			label: modelId,
			keywords: [selectedProvider?.label ?? "", ...modelId.split(/[/-]/)],
		}),
	);
	const hasPreviewResult =
		previewRouteQuery.isFetched ||
		previewRouteQuery.isFetching ||
		previewRouteQuery.isError;

	return (
		<main className="flex flex-col gap-6 pb-28">
			<PageHeader
				eyebrow="API Keys"
				title="Access keys and BYOK routing"
				description="Create GitPal API keys for app access, then manage bring-your-own-provider keys that can route model calls directly and bypass wallet spend."
				badges={<Badge variant="outline">Secure storage enabled</Badge>}
			/>

			<Tabs defaultValue="gitpal">
				<TabsList
					variant="line"
					className="w-full max-w-full overflow-x-auto pb-1"
				>
					<TabsTrigger value="gitpal">GitPal API Keys</TabsTrigger>
					<TabsTrigger value="byok">BYOK</TabsTrigger>
				</TabsList>

				<TabsContent value="gitpal" className="space-y-6">
					<div className="grid gap-6 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
						<Card>
							<CardHeader>
								<CardTitle>Create API key</CardTitle>
								<CardDescription>
									Use these keys to authenticate directly with GitPal.
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="space-y-2">
									<div className="font-medium text-sm">Name</div>
									<Input
										value={appKeyName}
										onChange={(event) => setAppKeyName(event.target.value)}
										placeholder="Production automation"
									/>
								</div>
								<div className="space-y-2">
									<div className="font-medium text-sm">Expiration</div>
									<Select
										items={expirationOptions}
										value={appKeyExpiration}
										onValueChange={(value) =>
											setAppKeyExpiration(value ?? "90")
										}
									>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Select expiration" />
										</SelectTrigger>
										<SelectContent>
											{expirationOptions.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<Button
									type="button"
									disabled={
										createAppKeyMutation.isPending || !appKeyName.trim()
									}
									onClick={() =>
										createAppKeyMutation.mutate({
											name: appKeyName.trim(),
											expiresInDays: Number(appKeyExpiration),
										})
									}
								>
									{createAppKeyMutation.isPending
										? "Creating..."
										: "Create key"}
								</Button>
								{latestCreatedKey ? (
									<div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
										<div className="font-medium text-sm">Copy this key now</div>
										<p className="mt-1 text-muted-foreground text-sm">
											For security, the full secret is only shown once.
										</p>
										<code className="mt-3 block whitespace-normal break-all rounded-xl bg-background px-3 py-2 text-sm">
											{latestCreatedKey}
										</code>
									</div>
								) : null}
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Issued keys</CardTitle>
								<CardDescription>
									Disable or revoke keys when they are no longer needed.
								</CardDescription>
							</CardHeader>
							<CardContent>
								{appKeys.length ? (
									<div className="space-y-3">
										{appKeys.map((key) => (
											<div
												key={key.id}
												className="rounded-2xl border border-border/60 bg-card/70 p-4"
											>
												<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
													<div className="min-w-0 space-y-3">
														<div>
															<div className="wrap-break-word font-medium">
																{key.name ?? "Untitled"}
															</div>
															<div className="mt-1 text-muted-foreground text-xs">
																Created {formatDate(key.createdAt)}
															</div>
														</div>
														<div className="flex flex-wrap items-center gap-2 text-sm">
															<code className="inline-flex max-w-full whitespace-normal break-all rounded-lg bg-muted px-2 py-1 text-xs">
																{[key.prefix, key.start]
																	.filter(Boolean)
																	.join("") || "Protected"}
															</code>
															<Badge
																variant={key.enabled ? "secondary" : "outline"}
															>
																{key.enabled ? "Enabled" : "Disabled"}
															</Badge>
															<Badge variant="outline">
																Last used {formatDate(key.lastRequest)}
															</Badge>
															{key.expiresAt ? (
																<Badge variant="outline">
																	Expires {formatDate(key.expiresAt)}
																</Badge>
															) : null}
														</div>
													</div>
													<div className="flex shrink-0 items-center justify-end gap-3">
														<Switch
															checked={key.enabled}
															disabled={updateAppKeyMutation.isPending}
															onCheckedChange={(enabled) =>
																updateAppKeyMutation.mutate({
																	keyId: key.id,
																	enabled,
																})
															}
														/>
														<Button
															type="button"
															variant="ghost"
															size="icon-sm"
															aria-label={`Delete ${key.name ?? "API key"}`}
															disabled={deleteAppKeyMutation.isPending}
															onClick={() =>
																deleteAppKeyMutation.mutate({
																	keyId: key.id,
																})
															}
														>
															<Trash2Icon />
														</Button>
													</div>
												</div>
											</div>
										))}
									</div>
								) : (
									<Empty className="min-h-72">
										<EmptyHeader>
											<EmptyMedia variant="icon">
												<KeyRoundIcon />
											</EmptyMedia>
											<EmptyTitle>No API keys yet</EmptyTitle>
											<EmptyDescription>
												Create a GitPal API key for scripts, automations, or
												external integrations.
											</EmptyDescription>
										</EmptyHeader>
									</Empty>
								)}
							</CardContent>
						</Card>
					</div>
				</TabsContent>

				<TabsContent value="byok" className="space-y-6">
					<div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
						<Card>
							<CardHeader>
								<CardTitle>Routing policy</CardTitle>
								<CardDescription>
									Prefer your own provider keys first, then fall back to a
									router when needed.
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="space-y-2">
									<div className="font-medium text-sm">Default router</div>
									<Select
										items={routerOptions}
										value={routingSettings?.defaultRouter}
										onValueChange={(value) => {
											if (!routingSettings) {
												return;
											}

											setRoutingSettings({
												...routingSettings,
												defaultRouter:
													(value as
														| "ai-gateway"
														| "openrouter"
														| "ollama"
														| "direct") ?? "ai-gateway",
											});
										}}
									>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Select router" />
										</SelectTrigger>
										<SelectContent>
											{routerOptions.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-2">
									<div className="font-medium text-sm">Fallback router</div>
									<Select
										items={fallbackRouterOptions}
										value={routingSettings?.fallbackRouter ?? "none"}
										onValueChange={(value) => {
											if (!routingSettings) {
												return;
											}

											setRoutingSettings({
												...routingSettings,
												fallbackRouter:
													value === "none"
														? null
														: (value as
																| "ai-gateway"
																| "openrouter"
																| "ollama"
																| "direct"),
											});
										}}
									>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Select fallback" />
										</SelectTrigger>
										<SelectContent>
											{fallbackRouterOptions.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
									<div>
										<div className="font-medium text-sm">
											Prefer your own keys
										</div>
										<p className="text-muted-foreground text-sm">
											When a provider key exists, GitPal will route there first
											so the call is free for you.
										</p>
									</div>
									<Switch
										checked={routingSettings?.preferUserKeys ?? true}
										onCheckedChange={(checked) => {
											if (!routingSettings) {
												return;
											}

											setRoutingSettings({
												...routingSettings,
												preferUserKeys: checked,
											});
										}}
									/>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Route preview</CardTitle>
								<CardDescription>
									See how the current model ID would be routed right now.
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="flex flex-col gap-3 md:flex-row md:items-end">
									<div className="min-w-0 flex-1">
										<ModelIdPicker
											label="Preview model"
											value={routePreviewModel}
											onChange={setRoutePreviewModel}
											groups={CURATED_MODEL_GROUPS}
											helperText="Choose a curated model or paste any custom model ID to preview the effective route."
											customPlaceholder="anthropic/claude-sonnet-4.6"
										/>
									</div>
									<Button
										type="button"
										variant="outline"
										onClick={() => previewRouteQuery.refetch()}
										disabled={
											previewRouteQuery.isFetching || !routePreviewModel.trim()
										}
									>
										{previewRouteQuery.isFetching
											? "Checking..."
											: "Check route"}
									</Button>
								</div>
								{previewRouteQuery.isFetching ? (
									<div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
										<Skeleton className="h-5 w-2/3" />
										<Skeleton className="h-4 w-1/2" />
									</div>
								) : previewRouteQuery.isError ? (
									<div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm">
										{previewRouteQuery.error.message}
									</div>
								) : previewRouteQuery.data ? (
									<div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
										<div className="flex items-center gap-2">
											<CheckIcon className="size-4 text-emerald-600" />
											<div className="font-medium">
												{previewRouteQuery.data.label}
											</div>
										</div>
										<div className="mt-2 flex flex-wrap gap-2">
											<Badge variant="secondary">
												{previewRouteQuery.data.billedBy === "byok"
													? "Free to you"
													: "Wallet billed"}
											</Badge>
											{previewRouteQuery.data.routerId ? (
												<Badge variant="outline">
													{previewRouteQuery.data.routerId}
												</Badge>
											) : null}
											{previewRouteQuery.data.keyName ? (
												<Badge variant="outline">
													{previewRouteQuery.data.keyName}
												</Badge>
											) : null}
										</div>
									</div>
								) : hasPreviewResult ? (
									<div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
										<div className="font-medium">No route is available</div>
										<p className="mt-1 text-muted-foreground">
											This model does not match an enabled provider key or
											configured fallback router.
										</p>
									</div>
								) : (
									<div className="rounded-2xl border border-border/60 border-dashed p-6 text-muted-foreground text-sm">
										Enter a model ID and check the effective route.
									</div>
								)}
							</CardContent>
						</Card>
					</div>

					<div className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle>
									{editingKeyId ? "Edit provider key" : "Add provider key"}
								</CardTitle>
								<CardDescription>
									Store encrypted provider secrets and define how they should
									match models.
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="space-y-2">
									<div className="font-medium text-sm">Provider</div>
									<Select
										items={providerSelectItems}
										value={providerId}
										onValueChange={(value) => {
											const nextProviderId =
												(value as LlmProviderId) ?? providerId;
											setProviderId(nextProviderId);
											if (!editingKeyId) {
												const nextProvider = providerCatalog.find(
													(provider) => provider.id === nextProviderId,
												);
												setProviderKeyName(
													nextProvider ? `${nextProvider.label} key` : "",
												);
												setProviderAllowedModels([]);
											}
										}}
									>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Select provider" />
										</SelectTrigger>
										<SelectContent>
											{providerCatalog.map((provider) => (
												<SelectItem key={provider.id} value={provider.id}>
													{provider.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="grid gap-4 md:grid-cols-2">
									<div className="space-y-2">
										<div className="font-medium text-sm">Name</div>
										<Input
											value={providerKeyName}
											onChange={(event) =>
												setProviderKeyName(event.target.value)
											}
											placeholder={`${selectedProvider?.label ?? "Provider"} key`}
										/>
									</div>
									<div className="space-y-2">
										<div className="font-medium text-sm">Priority</div>
										<Input
											value={providerPriority}
											onChange={(event) =>
												setProviderPriority(event.target.value)
											}
											type="number"
											min="1"
											max="100"
											inputMode="numeric"
											placeholder="1"
										/>
									</div>
								</div>
								<div className="space-y-2">
									<div className="font-medium text-sm">
										API key{" "}
										{editingKeyId ? "(leave blank to keep existing)" : ""}
									</div>
									<Input
										value={providerApiKey}
										onChange={(event) => setProviderApiKey(event.target.value)}
										type="password"
										autoComplete="new-password"
										placeholder={selectedProvider?.keyPlaceholder ?? "sk-..."}
									/>
								</div>
								<div className="space-y-2">
									<div className="font-medium text-sm">Allowed models</div>
									<MultiSelectField
										value={providerAllowedModels}
										onChange={setProviderAllowedModels}
										options={providerModelOptions}
										placeholder="No model restriction"
										searchPlaceholder="Search provider models..."
										description="Leave this empty to allow every model for this provider. Selecting models constrains routing to those exact IDs."
									/>
								</div>
								<div className="grid gap-3 md:grid-cols-2">
									<div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
										<div>
											<div className="font-medium text-sm">Enabled</div>
											<p className="text-muted-foreground text-xs">
												Allow this key to be selected during routing.
											</p>
										</div>
										<Switch
											checked={providerEnabled}
											onCheckedChange={setProviderEnabled}
										/>
									</div>
									<div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
										<div>
											<div className="font-medium text-sm">Force direct</div>
											<p className="text-muted-foreground text-xs">
												Do not prefer router-based fallbacks for matching
												models.
											</p>
										</div>
										<Switch
											checked={providerForceDirect}
											onCheckedChange={setProviderForceDirect}
										/>
									</div>
								</div>
								<div className="flex flex-wrap gap-2">
									<Button
										type="button"
										disabled={
											saveByokKeyMutation.isPending ||
											!providerKeyName.trim() ||
											(!editingKeyId && !providerApiKey.trim())
										}
										onClick={() =>
											saveByokKeyMutation.mutate({
												...(editingKeyId ? { id: editingKeyId } : {}),
												providerId,
												name: providerKeyName.trim(),
												...(providerApiKey.trim()
													? { apiKey: providerApiKey.trim() }
													: {}),
												enabled: providerEnabled,
												priority: Number(providerPriority) || 1,
												forceDirect: providerForceDirect,
												allowedModels: providerAllowedModels,
											})
										}
									>
										{saveByokKeyMutation.isPending
											? "Saving..."
											: editingKeyId
												? "Update key"
												: "Save key"}
									</Button>
									{editingKeyId ? (
										<Button
											type="button"
											variant="outline"
											onClick={() => {
												setEditingKeyId(null);
												setProviderApiKey("");
												setProviderKeyName("");
												setProviderAllowedModels([]);
												setProviderPriority("1");
												setProviderEnabled(true);
												setProviderForceDirect(false);
											}}
										>
											Cancel
										</Button>
									) : null}
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Stored provider keys</CardTitle>
								<CardDescription>
									Enabled direct keys bypass wallet billing when they match the
									requested model.
								</CardDescription>
							</CardHeader>
							<CardContent>
								{byokKeys.length ? (
									<div className="space-y-3">
										{byokKeys.map((key) => (
											<div
												key={key.id}
												className="rounded-2xl border border-border/60 bg-card/70 p-4"
											>
												<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
													<div className="min-w-0">
														<div className="flex flex-wrap items-center gap-2">
															<div className="font-medium">{key.name}</div>
															<Badge variant="secondary">
																{key.providerLabel}
															</Badge>
															<Badge variant="outline">
																Priority {key.priority}
															</Badge>
														</div>
														<div className="mt-1 flex flex-wrap items-center gap-3 text-muted-foreground text-sm">
															<span>{key.keyPreview}</span>
															<span>
																{key.allowedModels.length
																	? `${key.allowedModels.length} scoped models`
																	: "All provider models"}
															</span>
															<span>
																{key.enabled ? "Enabled" : "Disabled"}
															</span>
														</div>
													</div>
													<div className="flex flex-wrap items-center gap-2">
														<Switch
															checked={key.enabled}
															disabled={saveByokKeyMutation.isPending}
															onCheckedChange={(enabled) =>
																saveByokKeyMutation.mutate({
																	id: key.id,
																	providerId: key.providerId as LlmProviderId,
																	name: key.name,
																	enabled,
																	priority: key.priority,
																	forceDirect: key.forceDirect,
																	allowedModels: key.allowedModels,
																})
															}
														/>
														<Button
															type="button"
															variant="outline"
															onClick={() => {
																setEditingKeyId(key.id);
																setProviderId(key.providerId as LlmProviderId);
																setProviderKeyName(key.name);
																setProviderApiKey("");
																setProviderPriority(String(key.priority));
																setProviderEnabled(key.enabled);
																setProviderForceDirect(key.forceDirect);
																setProviderAllowedModels(key.allowedModels);
															}}
														>
															Edit
														</Button>
														<Button
															type="button"
															variant="ghost"
															size="icon-sm"
															aria-label={`Delete ${key.name}`}
															disabled={deleteByokKeyMutation.isPending}
															onClick={() =>
																deleteByokKeyMutation.mutate({
																	keyId: key.id,
																})
															}
														>
															<Trash2Icon />
														</Button>
													</div>
												</div>
											</div>
										))}
									</div>
								) : (
									<Empty className="min-h-72">
										<EmptyHeader>
											<EmptyMedia variant="icon">
												<ShieldCheckIcon />
											</EmptyMedia>
											<EmptyTitle>No provider keys stored</EmptyTitle>
											<EmptyDescription>
												Add a provider key to route compatible models directly
												and avoid wallet spend for those calls.
											</EmptyDescription>
										</EmptyHeader>
									</Empty>
								)}
							</CardContent>
						</Card>
					</div>
				</TabsContent>
			</Tabs>

			<SettingsChangeDock
				open={routingDirty}
				title="Routing preferences changed"
				description="These settings decide whether GitPal should prefer your own provider keys or a shared router."
				saveLabel={
					updateRoutingMutation.isPending ? "Saving..." : "Save routing"
				}
				disabled={updateRoutingMutation.isPending || !routingSettings}
				onDiscard={() => {
					if (savedRoutingSettings) {
						setRoutingSettings(structuredClone(savedRoutingSettings));
					}
				}}
				onSave={() => {
					if (!routingSettings) {
						return;
					}

					updateRoutingMutation.mutate(routingSettings);
				}}
			/>
		</main>
	);
}
