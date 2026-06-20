import { describe, expect, test } from "bun:test";
import type { GitPullRequestReview } from "@gitpal/git";
import { summarizeHumanReviews } from "./pull-request-reviews";

function review(
	id: string,
	state: GitPullRequestReview["state"],
	submittedAt: string | null,
	authorId = "user-1",
): GitPullRequestReview {
	return {
		providerId: "github",
		repositoryPath: "acme/repo",
		pullRequestNumber: 1,
		id,
		state,
		body: null,
		author: {
			id: authorId,
			login: authorId,
			name: null,
			email: null,
			avatarUrl: null,
			htmlUrl: null,
			kind: "user",
		},
		submittedAt,
		htmlUrl: null,
	};
}

describe("summarizeHumanReviews", () => {
	test("backfills earliest and latest timestamps independent of input order", () => {
		const summary = summarizeHumanReviews([
			review("later", "commented", "2026-02-02T00:00:00.000Z", "user-2"),
			review("earlier", "approved", "2026-02-01T00:00:00.000Z"),
		]);

		expect(summary.firstHumanReviewAt?.toISOString()).toBe(
			"2026-02-01T00:00:00.000Z",
		);
		expect(summary.lastHumanReviewAt?.toISOString()).toBe(
			"2026-02-02T00:00:00.000Z",
		);
		expect(summary.approvalState).toBe("approved");
	});

	test("uses the latest decisive review and clears superseded approvals", () => {
		const summary = summarizeHumanReviews([
			review("approved", "approved", "2026-02-01T00:00:00.000Z"),
			review("changes", "changes_requested", "2026-02-02T00:00:00.000Z"),
		]);

		expect(summary.approvalState).toBe("changes_requested");
		expect(summary.approvedAt).toBeNull();
	});

	test("captures GitLab current approval state even without a timestamp", () => {
		const summary = summarizeHumanReviews([
			review("current", "approved", null),
		]);

		expect(summary.approvalState).toBe("approved");
		expect(summary.approvedAt).toBeNull();
	});
});
