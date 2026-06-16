"use client";

import * as React from "react";
import { Badge } from "@gitpal/ui/components/badge";
import { Button } from "@gitpal/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@gitpal/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@gitpal/ui/components/empty";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { queryClient, trpc } from "@/utils/trpc";
import type { WorkspaceSettings } from "@gitpal/utils";

import { SettingsChangeDock } from "./settings-change-dock";
import { WorkspaceSettingsForm } from "./workspace-settings-form";

type RepositorySettingsPanelProps = {
	repositoryId: string;
};

export function RepositorySettingsPanel({
	repositoryId,
}: RepositorySettingsPanelProps) {
	const activeOrganizationQuery = authClient.useActiveOrganization();
	const activeOrganization = activeOrganizationQuery.data;
	const repositorySettingsQuery = useQuery({
		...trpc.repositories.getRepositorySettings.queryOptions({
			organizationId: activeOrganization?.id,
			repositoryId,
		}),
		enabled: Boolean(activeOrganization && repositoryId),
	});
	const [settings, setSettings] = React.useState<WorkspaceSettings | null>(null);
	const [savedSettings, setSavedSettings] = React.useState<WorkspaceSettings | null>(
		null,
	);
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
		setUseOrganizationSettings(repositorySettingsQuery.data.useOrganizationSettings);
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
						organizationId: activeOrganization?.id,
						repositoryId,
					}),
				});
				toast.success("Repository overrides updated.");
			},
		}),
	);

	if (!activeOrganization) {
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
					<CardDescription>Loading repository settings...</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="h-96 rounded-2xl border border-border/60 bg-muted/10" />
				</CardContent>
			</Card>
		);
	}

	const isDirty =
		Boolean(settings && savedSettings) &&
		(JSON.stringify(settings) !== JSON.stringify(savedSettings) ||
			useOrganizationSettings !== savedUseOrganizationSettings);

	return (
		<div className="space-y-4 pb-24">
			<Card className="overflow-hidden">
				<CardHeader className="gap-3">
					<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
						<div className="space-y-1">
							<CardTitle>{repositorySettingsQuery.data.repository.fullName}</CardTitle>
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
					<div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-amber-500/10 px-4 py-3 text-amber-100">
						<div className="space-y-1">
							<div className="font-medium text-sm">
								{useOrganizationSettings
									? "Workspace settings are active"
									: "Repository settings are active"}
							</div>
							<p className="text-sm text-amber-100/80">
								{useOrganizationSettings
									? "Switch to repository overrides to customize this repository."
									: "Repository-specific changes will apply here instead of the workspace defaults."}
							</p>
						</div>
						<Button
							type="button"
							variant={useOrganizationSettings ? "outline" : "secondary"}
							onClick={() => setUseOrganizationSettings((value) => !value)}
						>
							{useOrganizationSettings ? "Customize" : "Use organization"}
						</Button>
					</div>
					<div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
						<div className="space-y-1">
							<div className="font-medium text-sm">Repository-specific controls</div>
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
					/>
				</CardContent>
			</Card>
			<SettingsChangeDock
				open={isDirty}
				title="Repository overrides changed"
				description="Save the current repository configuration or discard it to keep the last saved state."
				saveLabel={saveMutation.isPending ? "Saving..." : "Apply changes"}
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
						repositoryId,
						useOrganizationSettings,
						settings,
					});
				}}
			/>
		</div>
	);
}
