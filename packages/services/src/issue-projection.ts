import { randomUUID } from "node:crypto";
import { db } from "@gitpal/db";
import * as dashboardSchema from "@gitpal/db/schema/dashboard";
import type { GitIssue } from "@gitpal/git";
import { and, eq } from "drizzle-orm";

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
	const [row] = await db
		.insert(dashboardSchema.issue)
		.values({ id: `issue_${randomUUID()}`, repositoryId, ...values })
		.onConflictDoUpdate({
			target: [
				dashboardSchema.issue.repositoryId,
				dashboardSchema.issue.number,
			],
			set: values,
		})
		.returning();

	if (!row) throw new Error("Issue snapshot could not be stored.");
	return row;
}

export async function findIssueSnapshot(repositoryId: string, number: number) {
	const [row] = await db
		.select()
		.from(dashboardSchema.issue)
		.where(
			and(
				eq(dashboardSchema.issue.repositoryId, repositoryId),
				eq(dashboardSchema.issue.number, number),
			),
		)
		.limit(1);
	return row ?? null;
}
