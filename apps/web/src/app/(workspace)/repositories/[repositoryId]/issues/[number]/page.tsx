import { WorkItemDetailPage } from "@/components/work-item-detail-page";

export default async function IssueDetailPage({
	params,
}: {
	params: Promise<{ repositoryId: string; number: string }>;
}) {
	const { repositoryId, number } = await params;
	return (
		<WorkItemDetailPage
			kind="issue"
			repositoryId={repositoryId}
			number={Number(number)}
		/>
	);
}
