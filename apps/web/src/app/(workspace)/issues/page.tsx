import { WorkItemsPage } from "@/components/work-items-page";

export default async function IssuesPage({
	searchParams,
}: {
	searchParams: Promise<{ repositoryId?: string }>;
}) {
	const { repositoryId } = await searchParams;
	return (
		<WorkItemsPage kind="issue" repositoryId={repositoryId || undefined} />
	);
}
