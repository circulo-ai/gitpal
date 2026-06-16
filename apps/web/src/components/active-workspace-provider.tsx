"use client";

import * as React from "react";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";
import { useQuery } from "@tanstack/react-query";

const ACTIVE_WORKSPACE_COOKIE = "gitpal_active_workspace";
const ACTIVE_WORKSPACE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type WorkspaceSummary = {
	id: string;
	name: string;
	slug: string;
	logo: string | null;
	scope: "personal" | "organization" | "group";
	providerId: string;
	providerName: string;
	providerType: string;
	ownerPath: string;
	ownerName: string;
	ownerAvatarUrl: string | null;
	ownerHtmlUrl: string | null;
	settingsUrl: string | null;
	repositoryCount: number;
	role: string;
};

type ActiveWorkspaceContextValue = {
	workspaces: WorkspaceSummary[];
	activeWorkspace: WorkspaceSummary | null;
	activeWorkspaceId: string | null;
	isLoading: boolean;
	isSwitching: boolean;
	refreshWorkspaces: () => Promise<unknown>;
	switchWorkspace: (organizationId: string) => Promise<{
		error: string | null;
	}>;
};

const ActiveWorkspaceContext =
	React.createContext<ActiveWorkspaceContextValue | null>(null);

function readActiveWorkspaceId() {
	if (typeof document === "undefined") {
		return null;
	}

	const encodedCookie = document.cookie
		.split("; ")
		.find((entry) => entry.startsWith(`${ACTIVE_WORKSPACE_COOKIE}=`))
		?.split("=")[1];

	return encodedCookie ? decodeURIComponent(encodedCookie) : null;
}

function writeActiveWorkspaceId(organizationId: string | null) {
	if (typeof document === "undefined") {
		return;
	}

	if (!organizationId) {
		document.cookie = `${ACTIVE_WORKSPACE_COOKIE}=; path=/; max-age=0; samesite=lax`;
		return;
	}

	document.cookie = `${ACTIVE_WORKSPACE_COOKIE}=${encodeURIComponent(organizationId)}; path=/; max-age=${ACTIVE_WORKSPACE_COOKIE_MAX_AGE}; samesite=lax`;
}

function getPreferredWorkspaceId({
	workspaces,
	selectedWorkspaceId,
	authActiveWorkspaceId,
}: {
	workspaces: WorkspaceSummary[];
	selectedWorkspaceId: string | null;
	authActiveWorkspaceId: string | null;
}) {
	const availableWorkspaceIds = new Set(workspaces.map((workspace) => workspace.id));
	const candidates = [
		selectedWorkspaceId,
		authActiveWorkspaceId,
		readActiveWorkspaceId(),
		workspaces[0]?.id ?? null,
	].filter((candidate): candidate is string => Boolean(candidate));

	return (
		candidates.find((candidate) => availableWorkspaceIds.has(candidate)) ?? null
	);
}

export function ActiveWorkspaceProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const sessionQuery = authClient.useSession();
	const activeOrganizationQuery = authClient.useActiveOrganization();
	const workspacesQuery = useQuery(trpc.repositories.workspaces.queryOptions());
	const [selectedWorkspaceId, setSelectedWorkspaceId] = React.useState<
		string | null
	>(() => readActiveWorkspaceId());
	const [isSwitching, setIsSwitching] = React.useState(false);
	const workspaces = workspacesQuery.data ?? [];
	const authActiveWorkspaceId = activeOrganizationQuery.data?.id ?? null;

	React.useEffect(() => {
		if (workspaces.length === 0) {
			setSelectedWorkspaceId(null);
			writeActiveWorkspaceId(null);
			return;
		}

		const preferredWorkspaceId = getPreferredWorkspaceId({
			workspaces,
			selectedWorkspaceId,
			authActiveWorkspaceId,
		});

		if (preferredWorkspaceId && preferredWorkspaceId !== selectedWorkspaceId) {
			setSelectedWorkspaceId(preferredWorkspaceId);
		}

		writeActiveWorkspaceId(preferredWorkspaceId);
	}, [authActiveWorkspaceId, selectedWorkspaceId, workspaces]);

	const activeWorkspace =
		workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;

	const switchWorkspace = React.useCallback(
		async (organizationId: string) => {
			const targetWorkspace = workspaces.find(
				(workspace) => workspace.id === organizationId,
			);

			if (!targetWorkspace) {
				return {
					error: "The selected workspace is no longer available.",
				};
			}

			const previousWorkspaceId = selectedWorkspaceId;
			setIsSwitching(true);
			setSelectedWorkspaceId(organizationId);
			writeActiveWorkspaceId(organizationId);

			let error: string | null = null;

			try {
				const result = await authClient.organization.setActive({
					organizationId,
				});

				if (result.error && sessionQuery.data) {
					error = result.error.message ?? "Unable to switch workspaces right now.";
					setSelectedWorkspaceId(previousWorkspaceId ?? null);
					writeActiveWorkspaceId(previousWorkspaceId ?? null);
				}

				await Promise.allSettled([
					activeOrganizationQuery.refetch?.(),
					sessionQuery.refetch?.(),
				]);
			} catch (caughtError) {
				if (sessionQuery.data) {
					error =
						caughtError instanceof Error
							? caughtError.message
							: "Unable to switch workspaces right now.";
					setSelectedWorkspaceId(previousWorkspaceId ?? null);
					writeActiveWorkspaceId(previousWorkspaceId ?? null);
				}
			} finally {
				setIsSwitching(false);
			}

			return { error };
		},
		[
			activeOrganizationQuery,
			selectedWorkspaceId,
			sessionQuery,
			workspaces,
		],
	);

	const value = React.useMemo<ActiveWorkspaceContextValue>(
		() => ({
			workspaces,
			activeWorkspace,
			activeWorkspaceId: activeWorkspace?.id ?? null,
			isLoading: workspacesQuery.isLoading,
			isSwitching,
			refreshWorkspaces: () => workspacesQuery.refetch(),
			switchWorkspace,
		}),
		[
			activeWorkspace,
			isSwitching,
			switchWorkspace,
			workspaces,
			workspacesQuery,
		],
	);

	return (
		<ActiveWorkspaceContext.Provider value={value}>
			{children}
		</ActiveWorkspaceContext.Provider>
	);
}

export function useActiveWorkspace() {
	const context = React.useContext(ActiveWorkspaceContext);

	if (!context) {
		throw new Error(
			"useActiveWorkspace must be used within an ActiveWorkspaceProvider.",
		);
	}

	return context;
}
