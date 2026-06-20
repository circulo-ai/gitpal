import { notFound } from "next/navigation";
import { WorkItemDetailPage } from "@/components/work-item-detail-page";

export default async function IssueDetailPage({
	params,
}: {
	params: Promise<{ repositoryId: string; number: string }>;
}) {
	const { repositoryId, number } = await params;
	const issueNumber = Number(number);
	if (!Number.isInteger(issueNumber) || issueNumber < 1) notFound();
	return (
		<WorkItemDetailPage
			kind="issue"
			repositoryId={repositoryId}
			number={issueNumber}
		/>
	);
}
