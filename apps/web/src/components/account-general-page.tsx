"use client";

import { Badge } from "@gitpal/ui/components/badge";
import { useQuery } from "@tanstack/react-query";

import { trpc } from "@/utils/trpc";

import { useActiveWorkspace } from "./active-workspace-provider";
import { OrganizationSettingsPanel } from "./organization-settings-panel";
import { PageHeader, PageStatCard, PageStatGrid } from "./workspace-page";

export function AccountGeneralPage() {
	const { activeWorkspace, workspaces } = useActiveWorkspace();
	const providersQuery = useQuery(trpc.repositories.providers.queryOptions());
	const providers = providersQuery.data ?? [];

	return (
		<main className="flex flex-col gap-6">
			<PageHeader
				eyebrow="Account"
				title="Workspace defaults and access"
				description="Review the currently active workspace, confirm provider coverage, and manage the shared defaults that shape how GitPal behaves across the app."
				badges={
					<Badge variant="outline">
						{activeWorkspace
							? `Active: ${activeWorkspace.name}`
							: "No active workspace"}
					</Badge>
				}
			/>

			<PageStatGrid className="xl:grid-cols-3">
				<PageStatCard
					label="Workspaces"
					value={workspaces.length}
					meta="Personal and shared provider scopes available to you."
				/>
				<PageStatCard
					label="Connected providers"
					value={providers.length}
					meta="Git platforms currently linked to your account."
				/>
				<PageStatCard
					label="Active repositories"
					value={activeWorkspace?.repositoryCount ?? 0}
					meta="Repositories visible inside the selected workspace."
				/>
			</PageStatGrid>
			<OrganizationSettingsPanel />
		</main>
	);
}
