import { queryClient, trpc } from "@/utils/trpc";

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
