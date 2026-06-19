"use client";

import {
	type ConnectorAuthMethod,
	type ConnectorKnowledgeBaseSettings,
	type ConnectorProviderDefinition,
	type ConnectorStatus,
	type ConnectorType,
	connectorTypeLabels,
} from "@gitpal/mcp";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@gitpal/ui/components/alert";
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
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@gitpal/ui/components/field";
import { Input } from "@gitpal/ui/components/input";
import { RadioGroup, RadioGroupItem } from "@gitpal/ui/components/radio-group";
import { Skeleton } from "@gitpal/ui/components/skeleton";
import { Switch } from "@gitpal/ui/components/switch";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@gitpal/ui/components/tabs";
import { Textarea } from "@gitpal/ui/components/textarea";
import { cn } from "@gitpal/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
	AlertTriangleIcon,
	BoxIcon,
	Building2Icon,
	KeyRoundIcon,
	PlugZapIcon,
	PlusCircleIcon,
	ShieldCheckIcon,
	Trash2Icon,
	WorkflowIcon,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { queryClient, trpc } from "@/utils/trpc";
import { useActiveWorkspace } from "./active-workspace-provider";

const connectorTypes = ["mcp", "issue_tracking", "ci_cd"] as const;

const authMethodOptions: Array<{
	value: ConnectorAuthMethod;
	label: string;
	description: string;
}> = [
	{
		value: "oauth",
		label: "OAuth",
		description: "Redirect and store encrypted tokens.",
	},
	{
		value: "api_key",
		label: "API key",
		description: "Store a scoped secret server-side.",
	},
	{
		value: "none",
		label: "None",
		description: "Use the public endpoint only.",
	},
];

type IntegrationConnection = {
	id: string;
	organizationId: string;
	providerId: string;
	providerType: ConnectorType;
	label: string;
	serverUrl: string | null;
	usageGuidance: string | null;
	authMethod: ConnectorAuthMethod;
	headerPreview: Record<string, string>;
	credentialPreview: string | null;
	status: ConnectorStatus;
	enabled: boolean;
	rateLimit: {
		windowSeconds: number;
		maxRequests: number;
	};
	knowledgeBase: ConnectorKnowledgeBaseSettings | null;
	lastValidatedAt: string | null;
	lastUsedAt: string | null;
};

type DialogState = {
	provider: ConnectorProviderDefinition;
	connection: IntegrationConnection | null;
};

type ConnectorFormState = {
	label: string;
	serverUrl: string;
	usageGuidance: string;
	authMethod: ConnectorAuthMethod;
	apiKey: string;
	additionalHeaders: string;
	enabled: boolean;
	knowledgeBase: {
		optOut: boolean;
		automaticRepositoryLinking: boolean;
		linkedRepositoriesText: string;
	} | null;
};

function isConnectorAuthMethod(value: unknown): value is ConnectorAuthMethod {
	return value === "none" || value === "oauth" || value === "api_key";
}

function getStatusLabel(status: ConnectorStatus, enabled: boolean) {
	if (!enabled) {
		return "Disabled";
	}

	switch (status) {
		case "pending_oauth":
			return "Pending OAuth";
		case "connected":
			return "Connected";
		case "error":
			return "Needs attention";
		case "disabled":
			return "Disabled";
		default:
			return "Configured";
	}
}

function getStatusVariant(status: ConnectorStatus, enabled: boolean) {
	if (!enabled) {
		return "outline" as const;
	}

	return status === "error" ? ("destructive" as const) : ("secondary" as const);
}

function buildInitialForm(
	provider: ConnectorProviderDefinition,
	connection: IntegrationConnection | null,
): ConnectorFormState {
	const knowledgeBase =
		connection?.knowledgeBase ?? provider.knowledgeBase ?? null;

	return {
		label: connection?.label ?? provider.name,
		serverUrl: connection?.serverUrl ?? provider.defaultServerUrl ?? "",
		usageGuidance: connection?.usageGuidance ?? "",
		authMethod: connection?.authMethod ?? provider.defaultAuthMethod,
		apiKey: "",
		additionalHeaders: "",
		enabled: connection?.enabled ?? true,
		knowledgeBase: knowledgeBase
			? {
					optOut: knowledgeBase.optOut,
					automaticRepositoryLinking: knowledgeBase.automaticRepositoryLinking,
					linkedRepositoriesText: knowledgeBase.linkedRepositories.join("\n"),
				}
			: null,
	};
}

function formatHeaderPreview(headers: Record<string, string>) {
	const entries = Object.entries(headers);

	if (entries.length === 0) {
		return "";
	}

	return entries.map(([key, value]) => `${key}: ${value}`).join(", ");
}

function IntegrationSkeleton() {
	return (
		<div className="grid gap-3 md:grid-cols-2">
			{Array.from({ length: 4 }).map((_, index) => (
				<Skeleton key={index} className="h-44 w-full" />
			))}
		</div>
	);
}

function ProviderLogo({ provider }: { provider: ConnectorProviderDefinition }) {
	return provider.logoUrl ? (
		// biome-ignore lint/performance/noImgElement: Provider logos are catalog-supplied third-party URLs and bypass Next image domain config intentionally.
		<img
			src={provider.logoUrl}
			alt=""
			className="size-6"
			loading="lazy"
			decoding="async"
		/>
	) : (
		<BoxIcon className="size-5" />
	);
}

function parseLinkedRepositories(value: string) {
	return [
		...new Set(
			value
				.split(/[\n,]/)
				.map((item) => item.trim())
				.filter(Boolean),
		),
	];
}

export function IntegrationsPage() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const { activeWorkspace, activeWorkspaceId } = useActiveWorkspace();
	const [selectedType, setSelectedType] = React.useState<ConnectorType>("mcp");
	const [dialogState, setDialogState] = React.useState<DialogState | null>(
		null,
	);
	const [form, setForm] = React.useState<ConnectorFormState | null>(null);
	const listInput = React.useMemo(
		() =>
			activeWorkspaceId
				? { organizationId: activeWorkspaceId, type: selectedType }
				: undefined,
		[activeWorkspaceId, selectedType],
	);
	const catalogQuery = useQuery(trpc.integrations.catalog.queryOptions());
	const connectionsQuery = useQuery({
		...trpc.integrations.list.queryOptions(listInput),
		enabled: Boolean(activeWorkspaceId),
	});

	const invalidateIntegrations = React.useCallback(async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.integrations.list.queryKey(listInput),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.integrations.tools.queryKey({
					organizationId: activeWorkspaceId ?? undefined,
				}),
			}),
		]);
	}, [activeWorkspaceId, listInput]);

	const saveMutation = useMutation(
		trpc.integrations.save.mutationOptions({
			onSuccess: async () => {
				await invalidateIntegrations();
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);
	const startOAuthMutation = useMutation(
		trpc.integrations.startOAuth.mutationOptions({
			onSuccess: (data) => {
				window.location.assign(data.authorizationUrl);
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);
	const toggleMutation = useMutation(
		trpc.integrations.toggle.mutationOptions({
			onSuccess: async () => {
				await invalidateIntegrations();
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);
	const deleteMutation = useMutation(
		trpc.integrations.delete.mutationOptions({
			onSuccess: async () => {
				await invalidateIntegrations();
				setDialogState(null);
				toast.success("Integration removed.");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	React.useEffect(() => {
		if (!dialogState) {
			setForm(null);
			return;
		}

		setForm(buildInitialForm(dialogState.provider, dialogState.connection));
	}, [dialogState]);

	React.useEffect(() => {
		const oauthStatus = searchParams.get("integration_oauth");
		if (!oauthStatus) {
			return;
		}

		if (oauthStatus === "connected") {
			toast.success("OAuth integration connected.");
			void invalidateIntegrations();
		} else if (oauthStatus === "cancelled") {
			toast.info("OAuth connection was cancelled.");
		} else {
			toast.error("OAuth integration could not be connected.");
		}

		const nextParams = new URLSearchParams(searchParams.toString());
		nextParams.delete("integration_oauth");
		nextParams.delete("connectionId");
		const nextQuery = nextParams.toString();
		router.replace(
			(nextQuery ? `${pathname}?${nextQuery}` : pathname) as never,
			{
				scroll: false,
			},
		);
	}, [invalidateIntegrations, pathname, router, searchParams]);

	const providers = (catalogQuery.data ?? []).filter(
		(provider) => provider.type === selectedType,
	);
	const connections = connectionsQuery.data ?? [];
	const connectedCount = connections.filter(
		(connection) => connection.enabled && connection.status === "connected",
	).length;
	const pendingCount = connections.filter(
		(connection) => connection.status === "pending_oauth",
	).length;

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (!activeWorkspaceId || !dialogState || !form) {
			return;
		}

		const savedConnection = await saveMutation.mutateAsync({
			organizationId: activeWorkspaceId,
			connectionId: dialogState.connection?.id,
			providerId: dialogState.provider.id,
			label: form.label,
			serverUrl: form.serverUrl,
			usageGuidance: form.usageGuidance,
			authMethod: form.authMethod,
			apiKey: form.apiKey,
			additionalHeaders: form.additionalHeaders,
			knowledgeBase: form.knowledgeBase
				? {
						optOut: form.knowledgeBase.optOut,
						automaticRepositoryLinking:
							form.knowledgeBase.automaticRepositoryLinking,
						linkedRepositories: parseLinkedRepositories(
							form.knowledgeBase.linkedRepositoriesText,
						),
					}
				: undefined,
			enabled: form.enabled,
		});

		if (form.authMethod === "oauth") {
			await startOAuthMutation.mutateAsync({
				organizationId: activeWorkspaceId,
				providerId: dialogState.provider.id,
				returnTo: window.location.href,
			});
			return;
		}

		setDialogState({
			provider: dialogState.provider,
			connection: savedConnection,
		});
		toast.success("Integration saved.");
	}

	if (!activeWorkspace || !activeWorkspaceId) {
		return (
			<main className="flex flex-col gap-6">
				<Card>
					<CardHeader>
						<CardTitle>Integrations</CardTitle>
						<CardDescription>
							Select a synced workspace before connecting external services.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Empty className="min-h-96">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<Building2Icon />
								</EmptyMedia>
								<EmptyTitle>No active workspace</EmptyTitle>
								<EmptyDescription>
									Workspace-scoped integrations need a provider workspace.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					</CardContent>
				</Card>
			</main>
		);
	}

	return (
		<main className="flex flex-col gap-6">
			<div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
				<div className="flex flex-col gap-1">
					<h1 className="font-heading font-medium text-2xl tracking-tight md:text-3xl">
						Integrations{" "}
						<span className="text-muted-foreground text-sm italic">
							{activeWorkspace.name}
						</span>
					</h1>
					<p className="max-w-3xl text-muted-foreground text-sm">
						Connect MCP servers, issue trackers, and CI/CD systems for review
						workflows.
					</p>
				</div>
				<div className="grid grid-cols-3 gap-2 text-center md:w-80">
					<div className="rounded-lg border bg-card p-3">
						<div className="font-medium text-lg tabular-nums">
							{connections.length}
						</div>
						<div className="text-muted-foreground text-xs">Configured</div>
					</div>
					<div className="rounded-lg border bg-card p-3">
						<div className="font-medium text-lg tabular-nums">
							{connectedCount}
						</div>
						<div className="text-muted-foreground text-xs">Active</div>
					</div>
					<div className="rounded-lg border bg-card p-3">
						<div className="font-medium text-lg tabular-nums">
							{pendingCount}
						</div>
						<div className="text-muted-foreground text-xs">Pending</div>
					</div>
				</div>
			</div>

			<Tabs
				value={selectedType}
				onValueChange={(value) => {
					if (value && connectorTypes.includes(value as ConnectorType)) {
						setSelectedType(value as ConnectorType);
					}
				}}
			>
				<TabsList>
					{connectorTypes.map((type) => (
						<TabsTrigger key={type} value={type}>
							{connectorTypeLabels[type]}
						</TabsTrigger>
					))}
				</TabsList>

				{connectorTypes.map((type) => (
					<TabsContent key={type} value={type} className="flex flex-col gap-4">
						{catalogQuery.isLoading || connectionsQuery.isLoading ? (
							<IntegrationSkeleton />
						) : providers.length > 0 ? (
							<div className="grid gap-3 md:grid-cols-2">
								{providers.map((provider) => {
									const providerConnections = connections.filter(
										(connection) => connection.providerId === provider.id,
									);
									const primaryConnection = providerConnections[0] ?? null;
									const headerPreview = primaryConnection
										? formatHeaderPreview(primaryConnection.headerPreview)
										: "";

									return (
										<Card key={provider.id} size="sm">
											<CardHeader>
												<div className="flex min-w-0 items-start gap-3">
													<div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/60">
														<ProviderLogo provider={provider} />
													</div>
													<div className="flex min-w-0 flex-col gap-1">
														<CardTitle className="truncate">
															{provider.name}
														</CardTitle>
														<CardDescription className="truncate">
															{provider.host}
														</CardDescription>
													</div>
												</div>
												<CardAction>
													<Button
														type="button"
														size="sm"
														variant={primaryConnection ? "outline" : "default"}
														onClick={() =>
															setDialogState({
																provider,
																connection: primaryConnection,
															})
														}
													>
														<PlusCircleIcon data-icon="inline-start" />
														{primaryConnection ? "Manage" : "Add"}
													</Button>
												</CardAction>
											</CardHeader>
											<CardContent className="flex flex-col gap-4">
												<p className="text-muted-foreground text-sm">
													{provider.description}
												</p>
												<div className="flex flex-wrap gap-2">
													{primaryConnection ? (
														<Badge
															variant={getStatusVariant(
																primaryConnection.status,
																primaryConnection.enabled,
															)}
														>
															{getStatusLabel(
																primaryConnection.status,
																primaryConnection.enabled,
															)}
														</Badge>
													) : (
														<Badge variant="outline">Available</Badge>
													)}
													<Badge variant="outline">
														{provider.defaultRateLimit.maxRequests}/
														{provider.defaultRateLimit.windowSeconds}s
													</Badge>
													{provider.requiresApiKeyForProduction ? (
														<Badge variant="outline">
															<KeyRoundIcon />
															Scoped key
														</Badge>
													) : null}
												</div>
												{primaryConnection ? (
													<div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
														<div className="min-w-0">
															<div className="truncate font-medium text-sm">
																{primaryConnection.label}
															</div>
															<div className="truncate text-muted-foreground text-xs">
																{headerPreview ||
																	primaryConnection.credentialPreview ||
																	primaryConnection.authMethod}
															</div>
														</div>
														<Switch
															checked={primaryConnection.enabled}
															disabled={toggleMutation.isPending}
															onCheckedChange={(enabled) =>
																toggleMutation.mutate({
																	organizationId: activeWorkspaceId,
																	connectionId: primaryConnection.id,
																	enabled,
																})
															}
															aria-label={`Toggle ${primaryConnection.label}`}
														/>
													</div>
												) : null}
												{primaryConnection?.knowledgeBase ? (
													<div className="flex flex-wrap gap-2">
														<Badge
															variant={
																primaryConnection.knowledgeBase.optOut
																	? "outline"
																	: "secondary"
															}
														>
															{primaryConnection.knowledgeBase.optOut
																? "AI access off"
																: "AI access on"}
														</Badge>
														<Badge variant="outline">
															{primaryConnection.knowledgeBase
																.automaticRepositoryLinking
																? "Auto repository links"
																: "Manual repository links"}
														</Badge>
														<Badge variant="outline">
															{
																primaryConnection.knowledgeBase
																	.linkedRepositories.length
															}{" "}
															linked repos
														</Badge>
													</div>
												) : null}
											</CardContent>
										</Card>
									);
								})}
							</div>
						) : (
							<Empty className="min-h-72">
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<PlugZapIcon />
									</EmptyMedia>
									<EmptyTitle>No providers</EmptyTitle>
									<EmptyDescription>
										This integration category has no providers yet.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						)}
					</TabsContent>
				))}
			</Tabs>

			<Dialog
				open={Boolean(dialogState)}
				onOpenChange={(open) => {
					if (!open) {
						setDialogState(null);
					}
				}}
			>
				<DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
					{dialogState && form ? (
						<form className="flex flex-col gap-6" onSubmit={handleSubmit}>
							<DialogHeader>
								<DialogTitle>
									{dialogState.connection ? "Manage" : "Add"}{" "}
									{dialogState.provider.name}
								</DialogTitle>
								<DialogDescription>
									{dialogState.provider.host}
								</DialogDescription>
							</DialogHeader>

							<FieldGroup>
								<div className="grid gap-4 md:grid-cols-2">
									<Field>
										<FieldLabel htmlFor="connector-label">Label</FieldLabel>
										<Input
											id="connector-label"
											value={form.label}
											onChange={(event) =>
												setForm({ ...form, label: event.target.value })
											}
											required
										/>
									</Field>
									<Field>
										<FieldLabel htmlFor="connector-url">Server URL</FieldLabel>
										<Input
											id="connector-url"
											value={form.serverUrl}
											onChange={(event) =>
												setForm({ ...form, serverUrl: event.target.value })
											}
											required
										/>
									</Field>
								</div>

								<Field>
									<FieldLabel htmlFor="connector-guidance">
										Usage guidance
									</FieldLabel>
									<Textarea
										id="connector-guidance"
										value={form.usageGuidance}
										onChange={(event) =>
											setForm({
												...form,
												usageGuidance: event.target.value,
											})
										}
										maxLength={10_000}
										placeholder="Workspace-specific context for agents."
										className="min-h-24"
									/>
									<FieldDescription>
										{form.usageGuidance.length}/10000
									</FieldDescription>
								</Field>

								<Field>
									<FieldLabel>Authentication</FieldLabel>
									<RadioGroup
										value={form.authMethod}
										onValueChange={(value) => {
											if (isConnectorAuthMethod(value)) {
												setForm({ ...form, authMethod: value });
											}
										}}
										className="grid gap-2 md:grid-cols-3"
									>
										{authMethodOptions
											.filter((option) =>
												dialogState.provider.authMethods.includes(option.value),
											)
											.map((option) => {
												const radioId = `connector-auth-${option.value}`;

												return (
													<label
														key={option.value}
														htmlFor={radioId}
														className={cn(
															"flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/20 p-3 transition-colors hover:bg-muted/40",
															form.authMethod === option.value &&
																"border-primary/50 bg-primary/5",
														)}
													>
														<RadioGroupItem
															id={radioId}
															value={option.value}
															className="mt-0.5"
														/>
														<span className="min-w-0">
															<span className="block font-medium text-sm">
																{option.label}
															</span>
															<span className="block text-muted-foreground text-xs">
																{option.description}
															</span>
														</span>
													</label>
												);
											})}
									</RadioGroup>
								</Field>

								{dialogState.provider.requiresApiKeyForProduction &&
								form.authMethod === "none" ? (
									<Alert>
										<AlertTriangleIcon />
										<AlertTitle>Rate limits likely</AlertTitle>
										<AlertDescription>
											Add a scoped key before production traffic.
										</AlertDescription>
									</Alert>
								) : null}

								{form.authMethod === "api_key" ? (
									<Field>
										<FieldLabel htmlFor="connector-api-key">API key</FieldLabel>
										<Input
											id="connector-api-key"
											type="password"
											value={form.apiKey}
											onChange={(event) =>
												setForm({ ...form, apiKey: event.target.value })
											}
											placeholder={
												dialogState.connection?.credentialPreview ??
												"Scoped service key"
											}
											required={!dialogState.connection?.credentialPreview}
										/>
									</Field>
								) : null}

								{form.knowledgeBase ? (
									<FieldSet className="rounded-lg border bg-muted/20 p-4">
										<FieldLegend>Knowledge base</FieldLegend>
										<FieldDescription>
											GitPal AI can use retained Linear context during review
											workflows for this workspace.
										</FieldDescription>

										<Field orientation="horizontal">
											<Switch
												checked={form.knowledgeBase.optOut}
												onCheckedChange={(optOut) =>
													setForm({
														...form,
														knowledgeBase: form.knowledgeBase
															? {
																	...form.knowledgeBase,
																	optOut,
																	automaticRepositoryLinking: optOut
																		? false
																		: form.knowledgeBase
																				.automaticRepositoryLinking,
																}
															: null,
													})
												}
												aria-label="Opt out of knowledge base"
											/>
											<div className="flex flex-col gap-1">
												<FieldLabel>Opt out</FieldLabel>
												<FieldDescription>
													Disable AI access to retained Linear context and
													linked repository knowledge.
												</FieldDescription>
											</div>
										</Field>

										<Field orientation="horizontal">
											<Switch
												checked={form.knowledgeBase.automaticRepositoryLinking}
												disabled={form.knowledgeBase.optOut}
												onCheckedChange={(automaticRepositoryLinking) =>
													setForm({
														...form,
														knowledgeBase: form.knowledgeBase
															? {
																	...form.knowledgeBase,
																	automaticRepositoryLinking,
																}
															: null,
													})
												}
												aria-label="Automatic repository linking"
											/>
											<div className="flex flex-col gap-1">
												<FieldLabel>Automatic repository linking</FieldLabel>
												<FieldDescription>
													Let GitPal connect related repositories when reviewing
													Linear-linked work.
												</FieldDescription>
											</div>
										</Field>

										<Field>
											<FieldLabel htmlFor="connector-linked-repositories">
												Linked repositories
											</FieldLabel>
											<Textarea
												id="connector-linked-repositories"
												value={form.knowledgeBase.linkedRepositoriesText}
												onChange={(event) =>
													setForm({
														...form,
														knowledgeBase: form.knowledgeBase
															? {
																	...form.knowledgeBase,
																	linkedRepositoriesText: event.target.value,
																}
															: null,
													})
												}
												disabled={form.knowledgeBase.optOut}
												placeholder="owner/repository"
												className="min-h-28 font-mono text-xs"
											/>
										</Field>
									</FieldSet>
								) : null}

								<Field>
									<FieldLabel htmlFor="connector-headers">
										Additional headers
									</FieldLabel>
									<Textarea
										id="connector-headers"
										value={form.additionalHeaders}
										onChange={(event) =>
											setForm({
												...form,
												additionalHeaders: event.target.value,
											})
										}
										placeholder='{"x-api-key":"your-key","X-API-Version":"v2"}'
										className="min-h-24 font-mono text-xs"
									/>
								</Field>

								<Field orientation="horizontal">
									<Switch
										checked={form.enabled}
										onCheckedChange={(enabled) => setForm({ ...form, enabled })}
										aria-label="Enable integration"
									/>
									<div>
										<FieldLabel>Enabled</FieldLabel>
										<FieldDescription>
											Available to workspace review workflows.
										</FieldDescription>
									</div>
								</Field>
							</FieldGroup>

							<DialogFooter className="gap-2 sm:justify-between">
								{dialogState.connection ? (
									<Button
										type="button"
										variant="destructive"
										disabled={deleteMutation.isPending}
										onClick={() =>
											deleteMutation.mutate({
												organizationId: activeWorkspaceId,
												connectionId: dialogState.connection?.id ?? "",
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
										onClick={() => setDialogState(null)}
									>
										Cancel
									</Button>
									<Button
										type="submit"
										disabled={
											saveMutation.isPending ||
											startOAuthMutation.isPending ||
											deleteMutation.isPending
										}
									>
										{form.authMethod === "oauth" ? (
											<ShieldCheckIcon data-icon="inline-start" />
										) : (
											<WorkflowIcon data-icon="inline-start" />
										)}
										{form.authMethod === "oauth"
											? "Connect with OAuth"
											: "Save integration"}
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
