import { describe, expect, test } from "bun:test";
import type { GitPullRequestFile } from "@gitpal/git";
import { resolveDiffAnchor } from "./review-anchors";

const files: GitPullRequestFile[] = [
	{
		providerId: "github",
		repositoryPath: "gitpal/gitpal",
		pullRequestNumber: 1,
		path: "src/auth.ts",
		previousPath: null,
		status: "modified",
		additions: 2,
		deletions: 1,
		patch: "@@ -98,3 +98,4 @@\n context\n-old\n+new\n+next\n context",
		htmlUrl: null,
	},
];

describe("review diff anchors", () => {
	test("keeps an exact line inside the diff", () => {
		expect(resolveDiffAnchor(files, "src/auth.ts", 100)).toEqual({
			line: 100,
			status: "exact",
			originalLine: 100,
		});
	});

	test("moves an out-of-range line to the nearest changed line", () => {
		expect(resolveDiffAnchor(files, "src/auth.ts", 900)).toEqual({
			line: 100,
			status: "adjusted",
			originalLine: 900,
		});
	});
});
