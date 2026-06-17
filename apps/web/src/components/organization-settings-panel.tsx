"use client";

import { Badge } from "@gitpal/ui/components/badge";
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
import { useMutation, useQuery } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import { queryClient, trpc } from "@/utils/trpc";

import { useActiveWorkspace } from "./active-workspace-provider";
import { SettingsChangeDock } from "./settings-change-dock";
import { WorkspaceSettingsForm } from "./workspace-settings-form";
import { formatWorkspaceSlug } from "./workspace-slug";

export function OrganizationSettingsPanel() {
	const { activeWorkspace, activeWorkspaceId } = useActiveWorkspace();
	const organizationSettingsQuery = useQuery({
		...trpc.repositories.getOrganizationSettings.queryOptions({
			organizationId: activeWorkspaceId ?? undefined,
		}),
		enabled: Boolean(activeWorkspaceId),
	});
	const [settings, setSettings] = React.useState<WorkspaceSettings | null>(
		null,
	);
	const [savedSettings, setSavedSettings] =
		React.useState<WorkspaceSettings | null>(null);

	React.useEffect(() => {
		if (organizationSettingsQuery.data?.settings) {
			setSettings(organizationSettingsQuery.data.settings);
			setSavedSettings(organizationSettingsQuery.data.settings);
		}
	}, [organizationSettingsQuery.data]);

	const saveMutation = useMutation(
		trpc.repositories.updateOrganizationSettings.mutationOptions({
			onSuccess: async (data) => {
				setSettings(data.settings);
				setSavedSettings(data.settings);
				await queryClient.invalidateQueries({
					queryKey: trpc.repositories.getOrganizationSettings.queryKey({
						organizationId: activeWorkspaceId ?? undefined,
					}),
				});
				if (data.webhookSync.queued) {
					toast.success("Workspace defaults updated. Webhook refresh queued.");
					return;
				}

				toast.error(
					data.webhookSync.error
						? `Workspace defaults updated, but webhook refresh could not be queued: ${data.webhookSync.error}`
						: "Workspace defaults updated, but webhook refresh could not be queued.",
				);
			},
		}),
	);

	if (!activeWorkspace) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Workspace defaults</CardTitle>
					<CardDescription>
						Sync and select a workspace before editing shared defaults.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Empty className="min-h-64">
						<EmptyHeader>
							<EmptyTitle>No active workspace</EmptyTitle>
							<EmptyDescription>
								Use the workspace switcher after syncing repository access.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				</CardContent>
			</Card>
		);
	}

	if (!settings) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>{activeWorkspace.name}</CardTitle>
					<CardDescription>Loading workspace defaults...</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="h-96 rounded-2xl border border-border/60 bg-muted/10" />
				</CardContent>
			</Card>
		);
	}

	const isDirty =
		Boolean(settings && savedSettings) &&
		JSON.stringify(settings) !== JSON.stringify(savedSettings);

	return (
		<div className="relative pb-24">
			<Card className="overflow-hidden">
				<CardHeader className="gap-3">
					<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
						<div className="space-y-1">
							<CardTitle>{activeWorkspace.name}</CardTitle>
							<CardDescription>
								Workspace defaults for repositories that inherit shared review
								behavior.
							</CardDescription>
						</div>
						<Badge variant="outline" className="w-fit">
							{formatWorkspaceSlug(activeWorkspace.slug)}
						</Badge>
					</div>
				</CardHeader>
				<CardContent>
					<WorkspaceSettingsForm
						value={settings}
						onChange={setSettings}
						previewSettings={settings}
						previewWorkspaceName={activeWorkspace.name}
					/>
				</CardContent>
			</Card>
			<SettingsChangeDock
				open={isDirty}
				title="Workspace defaults changed"
				description="These edits apply to repositories that inherit workspace-level settings."
				saveLabel={saveMutation.isPending ? "Saving..." : "Save defaults"}
				disabled={saveMutation.isPending || !settings}
				onDiscard={() => {
					if (savedSettings) {
						setSettings(structuredClone(savedSettings));
					}
				}}
				onSave={() => {
					if (!settings) {
						return;
					}

					saveMutation.mutate({
						organizationId: activeWorkspaceId ?? undefined,
						settings,
					});
				}}
			/>
		</div>
	);
}
