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
import type { WorkspaceSettings } from "@gitpal/utils";
import { resolveEffectiveWorkspaceSettings } from "@gitpal/utils";
import { Alert01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import { queryClient, trpc } from "@/utils/trpc";
import { useActiveWorkspace } from "./active-workspace-provider";
import { SettingsChangeDock } from "./settings-change-dock";
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

		return resolveEffectiveWorkspaceSettings({
			organizationSettings: repositorySettingsQuery.data.organizationSettings,
			repositorySettings: settings,
			useOrganizationSettings,
		});
	}, [repositorySettingsQuery.data, settings, useOrganizationSettings]);

	if (!activeWorkspace) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Repository settings</CardTitle>
					<CardDescription>
						Select a workspace before editing repository overrides.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Empty className="min-h-64">
						<EmptyHeader>
							<EmptyTitle>No active workspace</EmptyTitle>
							<EmptyDescription>
								Repository overrides are scoped to the selected workspace.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				</CardContent>
			</Card>
		);
	}

	if (!repositorySettingsQuery.data || !settings) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Repository settings</CardTitle>
				<CardDescription>Loading repository settings…</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="h-96 rounded-2xl border border-border/60 bg-muted/10" />
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-4 pb-24">
			<Card className="overflow-hidden">
				<CardHeader className="gap-3">
					<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
						<div className="space-y-1">
							<CardTitle>
								{repositorySettingsQuery.data.repository.fullName}
							</CardTitle>
							<CardDescription>
								Repository-specific overrides for this project.
							</CardDescription>
						</div>
						<Badge variant={useOrganizationSettings ? "secondary" : "outline"}>
							{useOrganizationSettings
								? "Using workspace settings"
								: "Repository overrides enabled"}
						</Badge>
					</div>
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

					<div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 md:flex-row md:items-center md:justify-between">
						<div className="space-y-1">
							<div className="font-medium text-sm">
								Repository-specific controls
							</div>
							<p className="text-muted-foreground text-sm">
								Overrides are stored per repository inside this workspace.
							</p>
						</div>
						<Badge variant="outline">
							{useOrganizationSettings ? "Inherited" : "Custom"}
						</Badge>
					</div>
				</CardHeader>
			</Card>

			<Card className={useOrganizationSettings ? "opacity-80" : undefined}>
				<CardContent className="pt-6">
					<WorkspaceSettingsForm
						value={settings}
						onChange={setSettings}
						disabled={useOrganizationSettings}
						previewSettings={
							previewSettings ?? repositorySettingsQuery.data.effectiveSettings
						}
						previewRepositoryFullName={
							repositorySettingsQuery.data.repository.fullName
						}
						previewRepositoryDescription={
							repositorySettingsQuery.data.repository.description
						}
						previewWorkspaceName={activeWorkspace.name}
						toolSettingsLocked={toolSettingsLocked}
					/>
				</CardContent>
			</Card>
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
