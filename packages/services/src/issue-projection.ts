import { randomUUID } from "node:crypto";
import type { GitIssue } from "@gitpal/git";
import { repositories } from "@gitpal/repositories";

function toDate(value: string) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? new Date() : date;
}

function toDateOrNull(value: string | null) {
	return value ? toDate(value) : null;
}

export async function projectIssueSnapshot({
	repositoryId,
	issue,
}: {
	repositoryId: string;
	issue: GitIssue;
}) {
	const values = {
		providerIssueId: issue.id,
		number: issue.number,
		title: issue.title,
		body: issue.body,
		state: issue.state,
		htmlUrl: issue.htmlUrl,
		authorLogin: issue.author?.login ?? null,
		authorName: issue.author?.name ?? null,
		authorAvatarUrl: issue.author?.avatarUrl ?? null,
		labels: issue.labels,
		createdAt: toDate(issue.createdAt),
		updatedAt: toDate(issue.updatedAt),
		closedAt: toDateOrNull(issue.closedAt),
	};
	const row = await repositories.issue.upsertFromProvider({
		id: `issue_${randomUUID()}`,
		repositoryId,
		...values,
	});

	if (!row) throw new Error("Issue snapshot could not be stored.");
	return row;
}

export async function findIssueSnapshot(repositoryId: string, number: number) {
	return repositories.issue.findByNumber(repositoryId, number);
}
