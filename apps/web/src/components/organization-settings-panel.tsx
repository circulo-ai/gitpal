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

import { WorkspaceSettingsForm } from "./workspace-settings-form";

function settingsLabel(name: string) {
	return name.trim().toLowerCase();
}

export function OrganizationSettingsPanel() {
	const activeOrganizationQuery = authClient.useActiveOrganization();
	const activeOrganization = activeOrganizationQuery.data;
	const organizationSettingsQuery = useQuery({
		...trpc.repositories.getOrganizationSettings.queryOptions({
			organizationId: activeOrganization?.id,
		}),
		enabled: Boolean(activeOrganization),
	});
	const [settings, setSettings] = React.useState<WorkspaceSettings | null>(null);

	React.useEffect(() => {
		if (organizationSettingsQuery.data?.settings) {
			setSettings(organizationSettingsQuery.data.settings);
		}
	}, [organizationSettingsQuery.data]);

	const saveMutation = useMutation(
		trpc.repositories.updateOrganizationSettings.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.repositories.getOrganizationSettings.queryKey({
						organizationId: activeOrganization?.id,
					}),
				});
				toast.success("Organization defaults updated.");
			},
		}),
	);

	if (!activeOrganization) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Organization defaults</CardTitle>
					<CardDescription>
						Create or select an organization to edit shared defaults.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Empty className="min-h-64">
						<EmptyHeader>
							<EmptyTitle>No active organization</EmptyTitle>
							<EmptyDescription>
								Use the sidebar organization switcher or create a new
								organization before adjusting defaults.
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
					<CardTitle>{activeOrganization.name}</CardTitle>
					<CardDescription>Loading organization defaults...</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="h-96 rounded-2xl border border-border/60 bg-muted/10" />
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="overflow-hidden">
			<CardHeader className="gap-3">
				<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
					<div className="space-y-1">
						<CardTitle>{activeOrganization.name}</CardTitle>
						<CardDescription>
							Organization defaults for all repositories that inherit settings.
						</CardDescription>
					</div>
					<Badge variant="outline" className="w-fit">
						{settingsLabel(activeOrganization.slug)}
					</Badge>
				</div>
				<div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
					<div className="space-y-1">
						<div className="font-medium text-sm">Save organization defaults</div>
						<p className="text-muted-foreground text-sm">
							Changes apply to repositories that use inherited settings.
						</p>
					</div>
					<Button
						type="button"
						disabled={saveMutation.isPending || !settings}
						onClick={() => {
							if (!settings) {
								return;
							}

							saveMutation.mutate({ settings });
						}}
					>
						{saveMutation.isPending ? "Saving..." : "Save defaults"}
					</Button>
				</div>
			</CardHeader>
			<CardContent>
				<WorkspaceSettingsForm value={settings} onChange={setSettings} />
			</CardContent>
		</Card>
	);
}
