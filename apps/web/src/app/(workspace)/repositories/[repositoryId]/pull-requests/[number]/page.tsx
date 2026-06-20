import { notFound } from "next/navigation";
import { WorkItemDetailPage } from "@/components/work-item-detail-page";

export default async function PullRequestDetailPage({
	params,
}: {
	params: Promise<{ repositoryId: string; number: string }>;
}) {
	const { repositoryId, number } = await params;
	const pullRequestNumber = Number(number);
	if (!Number.isInteger(pullRequestNumber) || pullRequestNumber < 1) notFound();
	return (
		<WorkItemDetailPage
			kind="pull_request"
			repositoryId={repositoryId}
			number={pullRequestNumber}
		/>
	);
}
