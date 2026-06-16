import { queryClient, trpc } from "@/utils/trpc";

type SwitchWorkspace = (organizationId: string) => Promise<{
	error: string | null;
}>;

export async function invalidateRepositoryData(organizationId: string | null) {
	await Promise.all([
		queryClient.invalidateQueries({
			queryKey: trpc.repositories.workspaces.queryKey(),
		}),
		queryClient.invalidateQueries({
			queryKey: trpc.repositories.providers.queryKey(),
		}),
		queryClient.invalidateQueries({
			queryKey: trpc.repositories.list.queryKey({
				organizationId: organizationId ?? undefined,
			}),
		}),
	]);
}

export async function syncRepositoryDataAfterRefresh({
	activeWorkspaceId,
	switchWorkspace,
	workspaceIds,
}: {
	activeWorkspaceId: string | null;
	switchWorkspace: SwitchWorkspace;
	workspaceIds: string[];
}) {
	await invalidateRepositoryData(activeWorkspaceId);

	if (!activeWorkspaceId && workspaceIds[0]) {
		await switchWorkspace(workspaceIds[0]);
	}
}
