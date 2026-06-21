"use client";

import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

const ACTIVE_WORKSPACE_STORAGE_KEY = "gitpal_active_workspace";

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
	if (typeof window === "undefined") {
		return null;
	}

	try {
		return window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
	} catch {
		return null;
	}
}

function writeActiveWorkspaceId(organizationId: string | null) {
	if (typeof window === "undefined") {
		return;
	}

	try {
		if (!organizationId) {
			window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
			return;
		}

		window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, organizationId);
	} catch {
		// Best-effort preference persistence only.
	}
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
	const availableWorkspaceIds = new Set(
		workspaces.map((workspace) => workspace.id),
	);
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
		// Only reconcile once the workspaces query has actually resolved. The
		// previous version ran on every render — including while the query was
		// still loading (workspaces === []) or had transiently errored — and took
		// the `workspaces.length === 0` branch, which cleared the persisted cookie
		// via writeActiveWorkspaceId(null). That wiped the active workspace on
		// every page load before defaulting back to workspaces[0]. Bailing until
		// isSuccess keeps the persisted selection intact across reloads.
		if (!workspacesQuery.isSuccess) {
			return;
		}

		if (workspaces.length === 0) {
			// Genuinely no workspaces for this user — clear any stale selection.
			setSelectedWorkspaceId((current) => (current === null ? current : null));
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

		// Never persist a null/undefined preference — that would clear the cookie.
		if (preferredWorkspaceId) {
			writeActiveWorkspaceId(preferredWorkspaceId);
		}
	}, [
		authActiveWorkspaceId,
		selectedWorkspaceId,
		workspaces,
		workspacesQuery.isSuccess,
	]);

	const activeWorkspace =
		workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ??
		null;

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
					error =
						result.error.message ?? "Unable to switch workspaces right now.";
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
		[activeOrganizationQuery, selectedWorkspaceId, sessionQuery, workspaces],
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
