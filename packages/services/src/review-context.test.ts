import { describe, expect, test } from "bun:test";
import type {
	GitPullRequestFile,
	GitRepositorySearchResult,
} from "@gitpal/git";
import {
	inferReviewTemplate,
	rankRepositoryContext,
	rankReviewFiles,
} from "./review-context";

const file = (path: string, additions = 5): GitPullRequestFile => ({
	providerId: "github",
	repositoryPath: "gitpal/gitpal",
	pullRequestNumber: 1,
	path,
	previousPath: null,
	status: "modified",
	additions,
	deletions: 1,
	patch: null,
	htmlUrl: null,
});

describe("review context ranking", () => {
	test("prioritizes relevant source files and demotes generated output", () => {
		const ranked = rankReviewFiles(
			[
				file("dist/auth.min.js", 400),
				file("src/auth/session.ts"),
				file("README.md"),
			],
			"Fix auth session refresh",
		);
		expect(ranked[0]?.path).toBe("src/auth/session.ts");
		expect(ranked.at(-1)?.path).toBe("dist/auth.min.js");
	});

	test("selects specialized templates", () => {
		expect(
			inferReviewTemplate({
				title: "Bump oauth dependency",
				body: null,
				files: [file("bun.lock")],
			}),
		).toBe("dependency-update");
	});

	test("ranks lexical matches before unrelated recent work", () => {
		const item = (
			title: string,
			updatedAt: string,
		): GitRepositorySearchResult => ({
			providerId: "github",
			repositoryPath: "gitpal/gitpal",
			kind: "issue",
			id: title,
			number: 1,
			title,
			body: null,
			state: "open",
			htmlUrl: "https://example.com/1",
			author: null,
			createdAt: updatedAt,
			updatedAt,
		});
		const ranked = rankRepositoryContext(
			[
				item("Unrelated docs", new Date().toISOString()),
				item("OAuth refresh failure", "2024-01-01T00:00:00Z"),
			],
			"Fix OAuth refresh",
		);
		expect(ranked[0]?.title).toBe("OAuth refresh failure");
	});
});
