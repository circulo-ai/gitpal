import { WorkItemsPage } from "@/components/work-items-page";

export default async function PullRequestsPage({
	searchParams,
}: {
	searchParams: Promise<{ repositoryId?: string }>;
}) {
	const { repositoryId } = await searchParams;
	return (
		<WorkItemsPage
			kind="pull_request"
			repositoryId={repositoryId || undefined}
		/>
	);
}
