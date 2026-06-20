import { WorkItemDetailPage } from "@/components/work-item-detail-page";

export default async function PullRequestDetailPage({
	params,
}: {
	params: Promise<{ repositoryId: string; number: string }>;
}) {
	const { repositoryId, number } = await params;
	return (
		<WorkItemDetailPage
			kind="pull_request"
			repositoryId={repositoryId}
			number={Number(number)}
		/>
	);
}
