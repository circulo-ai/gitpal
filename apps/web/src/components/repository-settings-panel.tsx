"use client";

import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "@gitpal/ui/components/alert";
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
	EmptyTitle,
} from "@gitpal/ui/components/empty";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@gitpal/ui/components/select";
import type { WorkspaceSettings } from "@gitpal/utils";
import {
	applyRepositoryPolicyPreset,
	getRepositoryPolicyPreset,
	mergeWorkspaceSettings,
	type RepositoryPolicyPresetId,
	repositoryPolicyPresets,
	resolveEffectiveWorkspaceSettings,
} from "@gitpal/utils";
import { Alert01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import { queryClient, trpc } from "@/utils/trpc";
import { useActiveWorkspace } from "./active-workspace-provider";
import { SettingsChangeDock } from "./settings-change-dock";
import {
	PageHeader,
	PageSectionCard,
	PageStatCard,
	PageStatGrid,
} from "./workspace-page";
import { WorkspaceSettingsForm } from "./workspace-settings-form";

type RepositorySettingsPanelProps = {
	repositoryId: string;
};

export function RepositorySettingsPanel({
	repositoryId,
}: RepositorySettingsPanelProps) {
	const { activeWorkspace, activeWorkspaceId } = useActiveWorkspace();
	const repositorySettingsQuery = useQuery({
		...trpc.repositories.getRepositorySettings.queryOptions({
			organizationId: activeWorkspaceId ?? undefined,
			repositoryId,
		}),
		enabled: Boolean(activeWorkspaceId && repositoryId),
	});
	const [settings, setSettings] = React.useState<WorkspaceSettings | null>(
		null,
	);
	const [savedSettings, setSavedSettings] =
		React.useState<WorkspaceSettings | null>(null);
	const [useOrganizationSettings, setUseOrganizationSettings] =
		React.useState(true);
	const [savedUseOrganizationSettings, setSavedUseOrganizationSettings] =
		React.useState(true);
	const [presetId, setPresetId] =
		React.useState<RepositoryPolicyPresetId>("balanced");

	React.useEffect(() => {
		if (!repositorySettingsQuery.data) {
			return;
		}

		setSettings(repositorySettingsQuery.data.repositorySettings);
		setSavedSettings(repositorySettingsQuery.data.repositorySettings);
		setUseOrganizationSettings(
			repositorySettingsQuery.data.useOrganizationSettings,
		);
		setSavedUseOrganizationSettings(
			repositorySettingsQuery.data.useOrganizationSettings,
		);
	}, [repositorySettingsQuery.data]);

	const saveMutation = useMutation(
		trpc.repositories.updateRepositorySettings.mutationOptions({
			onSuccess: async (data) => {
				setSettings(data.settings);
				setSavedSettings(data.settings);
				setUseOrganizationSettings(data.useOrganizationSettings);
				setSavedUseOrganizationSettings(data.useOrganizationSettings);
				await queryClient.invalidateQueries({
					queryKey: trpc.repositories.getRepositorySettings.queryKey({
						organizationId: activeWorkspaceId ?? undefined,
						repositoryId,
					}),
				});
				if (data.webhookSync.queued) {
					toast.success(
						"Repository overrides updated. Webhook refresh queued.",
					);
					return;
				}

				toast.error(
					data.webhookSync.error
						? `Repository overrides updated, but webhook refresh could not be queued: ${data.webhookSync.error}`
						: "Repository overrides updated, but webhook refresh could not be queued.",
				);
			},
		}),
	);

	const isDirty =
		Boolean(settings && savedSettings) &&
		(JSON.stringify(settings) !== JSON.stringify(savedSettings) ||
			useOrganizationSettings !== savedUseOrganizationSettings);
	const toolSettingsLocked =
		!useOrganizationSettings &&
		repositorySettingsQuery.data &&
		!repositorySettingsQuery.data.organizationSettings.ai.tools
			.allowRepositoryOverrides;
	const previewSettings = React.useMemo(() => {
		if (!repositorySettingsQuery.data || !settings) {
			return null;
		}

		const baseSettings = resolveEffectiveWorkspaceSettings({
			organizationSettings: repositorySettingsQuery.data.organizationSettings,
			repositorySettings: settings,
			useOrganizationSettings,
		});
		const withCentralConfig = repositorySettingsQuery.data
			.repositoryCentralConfigSettings
			? mergeWorkspaceSettings(
					baseSettings,
					repositorySettingsQuery.data.repositoryCentralConfigSettings,
				)
			: baseSettings;

		return repositorySettingsQuery.data.repositoryConfigSettings
			? mergeWorkspaceSettings(
					withCentralConfig,
					repositorySettingsQuery.data.repositoryConfigSettings,
				)
			: withCentralConfig;
	}, [repositorySettingsQuery.data, settings, useOrganizationSettings]);
	const selectedPreset = getRepositoryPolicyPreset(presetId);

	if (!activeWorkspace) {
		return (
			<div className="flex flex-col gap-6">
				<PageHeader
					eyebrow="Repository settings"
					title="Choose a workspace first"
					description="Repository overrides live inside a workspace, so GitPal needs an active workspace before this page can load the saved settings."
				/>
				<PageSectionCard contentClassName="pt-0">
					<Empty className="min-h-64">
						<EmptyHeader>
							<EmptyTitle>No active workspace</EmptyTitle>
							<EmptyDescription>
								Repository overrides are scoped to the selected workspace.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				</PageSectionCard>
			</div>
		);
	}

	if (!repositorySettingsQuery.data || !settings) {
		return (
			<div className="flex flex-col gap-6">
				<PageHeader
					eyebrow="Repository settings"
					title="Loading repository settings"
					description="GitPal is resolving the saved workspace defaults, repository overrides, and any config files that affect this repository."
				/>
				<PageSectionCard contentClassName="pt-0">
					<div className="h-96 rounded-2xl border border-border/60 bg-muted/10" />
				</PageSectionCard>
			</div>
		);
	}

	const repository = repositorySettingsQuery.data.repository;
	const hasCentralConfig = Boolean(
		repositorySettingsQuery.data.repositoryCentralConfigFileName,
	);
	const hasRepositoryConfig = Boolean(
		repositorySettingsQuery.data.repositoryConfigFileName,
	);

	return (
		<div className="space-y-6 pb-24">
			<PageHeader
				eyebrow="Repository settings"
				title={repository.fullName}
				description="Set repository-specific review behavior without losing sight of which values come from the workspace, saved overrides, or checked-in config files."
				badges={
					<>
						<Badge variant={useOrganizationSettings ? "secondary" : "outline"}>
							{useOrganizationSettings
								? "Using workspace settings"
								: "Repository overrides enabled"}
						</Badge>
						{hasCentralConfig ? (
							<Badge variant="outline">Central config detected</Badge>
						) : null}
						{hasRepositoryConfig ? (
							<Badge variant="outline">Repository config detected</Badge>
						) : null}
					</>
				}
			/>

			<PageStatGrid className="xl:grid-cols-3">
				<PageStatCard
					label="Current source"
					value={useOrganizationSettings ? "Inherited" : "Repository"}
					meta={
						useOrganizationSettings
							? "This repository currently follows workspace defaults."
							: "Saved overrides are active before checked-in config files are merged."
					}
				/>
				<PageStatCard
					label="Central config"
					value={hasCentralConfig ? "Present" : "None"}
					meta={
						repositorySettingsQuery.data.repositoryCentralConfigFileName
							? repositorySettingsQuery.data.repositoryCentralConfigFileName
							: "No shared repository config file was found."
					}
				/>
				<PageStatCard
					label="Repository config"
					value={hasRepositoryConfig ? "Present" : "None"}
					meta={
						repositorySettingsQuery.data.repositoryConfigFileName
							? `${repositorySettingsQuery.data.repositoryConfigFileName} overrides saved values from the repository root.`
							: "No repo-level config file is overriding the saved settings."
					}
				/>
			</PageStatGrid>

			<PageSectionCard
				title="Settings source"
				description="Choose whether this repository inherits workspace defaults or keeps its own saved policy."
				contentClassName="flex flex-col gap-4"
			>
				<Alert className="rounded-2xl border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50">
						<HugeiconsIcon icon={Alert01Icon} />
						<AlertTitle>
							{useOrganizationSettings
								? "Workspace settings are active"
								: "Repository settings are active"}
						</AlertTitle>
						<AlertDescription>
							{useOrganizationSettings
								? "Switch to repository overrides to customize this repository."
								: "Repository-specific changes will apply here instead of the workspace defaults."}
						</AlertDescription>
						<AlertAction>
							<Button
								type="button"
								variant={useOrganizationSettings ? "outline" : "secondary"}
								onClick={() => setUseOrganizationSettings((value) => !value)}
							>
								{useOrganizationSettings
									? "Customize"
									: "Use workspace settings"}
							</Button>
						</AlertAction>
					</Alert>

				<div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-4 md:flex-row md:items-center md:justify-between">
					<div className="space-y-1">
						<div className="font-medium text-sm">
							Repository-specific controls
						</div>
						<p className="text-muted-foreground text-sm">
							Overrides are stored per repository inside this workspace.
						</p>
						{repositorySettingsQuery.data.repositoryCentralConfigFileName ? (
							<p className="text-muted-foreground text-xs">
								Central config file{" "}
								{repositorySettingsQuery.data.repositoryCentralConfigFileName}{" "}
								applies before this repository's saved overrides.
							</p>
						) : null}
						{repositorySettingsQuery.data.repositoryConfigFileName ? (
							<p className="text-muted-foreground text-xs">
								{repositorySettingsQuery.data.repositoryConfigFileName} from the
								repository root overrides the saved workspace values.
							</p>
						) : null}
					</div>
					<Badge variant="outline">
						{useOrganizationSettings ? "Inherited" : "Custom"}
					</Badge>
				</div>
			</PageSectionCard>

			<PageSectionCard
				title="Repository policy preset"
				description="Apply an opinionated starting point, then fine-tune the settings below for this repository."
				contentClassName="flex flex-col gap-4"
			>
				<div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/80 px-4 py-4 md:flex-row md:items-center md:justify-between">
					<div className="space-y-1">
						<div className="font-medium text-sm">{selectedPreset.label}</div>
						<p className="text-muted-foreground text-sm">
							{selectedPreset.description}
						</p>
					</div>
					<div className="flex flex-col gap-2 sm:min-w-96 sm:flex-row sm:items-center">
						<Select
							items={repositoryPolicyPresets.map((preset) => ({
								label: preset.label,
								value: preset.id,
							}))}
							value={presetId}
							onValueChange={(value) => {
								if (value) {
									setPresetId(value as RepositoryPolicyPresetId);
								}
							}}
						>
							<SelectTrigger className="w-full sm:w-56">
								<SelectValue placeholder="Preset" />
							</SelectTrigger>
							<SelectContent align="end">
								<SelectGroup>
									{repositoryPolicyPresets.map((preset) => (
										<SelectItem key={preset.id} value={preset.id}>
											{preset.label}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								if (!settings) {
									return;
								}

								const base =
									previewSettings ??
									repositorySettingsQuery.data?.effectiveSettings ??
									settings;
								setUseOrganizationSettings(false);
								setSettings(applyRepositoryPolicyPreset(base, presetId));
							}}
						>
							Apply preset
						</Button>
					</div>
				</div>
			</PageSectionCard>

			<PageSectionCard
				title="Effective repository policy"
				description="Adjust the repository behavior here. Disabled controls mean this repository is currently inheriting workspace settings."
				className={useOrganizationSettings ? "opacity-85" : undefined}
				contentClassName="pt-0"
			>
				<WorkspaceSettingsForm
					value={settings}
					onChange={setSettings}
					disabled={useOrganizationSettings}
					previewSettings={
						previewSettings ?? repositorySettingsQuery.data.effectiveSettings
					}
					previewRepositoryFullName={repository.fullName}
					previewRepositoryDescription={repository.description}
					previewWorkspaceName={activeWorkspace.name}
					toolSettingsLocked={toolSettingsLocked}
				/>
			</PageSectionCard>
			<SettingsChangeDock
				open={isDirty}
				title="Repository overrides changed"
				description="Save the current repository configuration or discard it to keep the last saved state."
				saveLabel={saveMutation.isPending ? "Saving…" : "Apply changes"}
				disabled={saveMutation.isPending || !settings}
				onDiscard={() => {
					if (savedSettings) {
						setSettings(structuredClone(savedSettings));
					}
					setUseOrganizationSettings(savedUseOrganizationSettings);
				}}
				onSave={() => {
					if (!settings) {
						return;
					}

					saveMutation.mutate({
						organizationId: activeWorkspaceId ?? undefined,
						repositoryId,
						useOrganizationSettings,
						settings,
					});
				}}
			/>
		</div>
	);
}
