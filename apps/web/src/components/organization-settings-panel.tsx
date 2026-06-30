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
import {
	PageHeader,
	PageSectionCard,
	PageStatCard,
	PageStatGrid,
} from "./workspace-page";
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
			<div className="flex flex-col gap-6">
				<PageHeader
					eyebrow="Workspace defaults"
					title="Choose a workspace first"
					description="Shared review defaults live at the workspace level, so GitPal needs an active workspace before this page can load."
				/>
				<PageSectionCard contentClassName="pt-0">
					<Empty className="min-h-64">
						<EmptyHeader>
							<EmptyTitle>No active workspace</EmptyTitle>
							<EmptyDescription>
								Use the workspace switcher after syncing repository access.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				</PageSectionCard>
			</div>
		);
	}

	if (!settings) {
		return (
			<div className="flex flex-col gap-6">
				<PageHeader
					eyebrow="Workspace defaults"
					title={`Loading ${activeWorkspace.name}`}
					description="GitPal is loading the shared review policy that repositories inherit from this workspace."
				/>
				<PageSectionCard contentClassName="pt-0">
					<div className="h-96 rounded-2xl border border-border/60 bg-muted/10" />
				</PageSectionCard>
			</div>
		);
	}

	const isDirty =
		Boolean(settings && savedSettings) &&
		JSON.stringify(settings) !== JSON.stringify(savedSettings);

	return (
		<div className="relative space-y-6 pb-24">
			<PageHeader
				eyebrow="Workspace defaults"
				title={activeWorkspace.name}
				description="Define the baseline review policy for repositories in this workspace, then let individual repositories opt into overrides only when they truly need them."
				badges={
					<Badge variant="outline" className="w-fit">
						{formatWorkspaceSlug(activeWorkspace.slug)}
					</Badge>
				}
			/>

			<PageStatGrid className="xl:grid-cols-3">
				<PageStatCard
					label="Scope"
					value="Workspace-wide"
					meta="Inherited by repositories that do not enable repository-specific overrides."
				/>
				<PageStatCard
					label="Workspace slug"
					value={formatWorkspaceSlug(activeWorkspace.slug)}
					meta="Stable identifier used across workspace-scoped routes and settings."
				/>
				<PageStatCard
					label="Override model"
					value="Repository opt-in"
					meta="Teams can keep one default policy and only customize the exceptions."
				/>
			</PageStatGrid>

			<PageSectionCard
				title="Shared review policy"
				description="These defaults shape repository behavior across the workspace unless a repository explicitly saves its own overrides."
				contentClassName="pt-0"
			>
				<WorkspaceSettingsForm
					value={settings}
					onChange={setSettings}
					previewSettings={settings}
					previewWorkspaceName={activeWorkspace.name}
				/>
			</PageSectionCard>
			<SettingsChangeDock
				open={isDirty}
				title="Workspace defaults changed"
				description="These edits apply to repositories that inherit workspace-level settings."
				saveLabel={saveMutation.isPending ? "Saving…" : "Save defaults"}
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
