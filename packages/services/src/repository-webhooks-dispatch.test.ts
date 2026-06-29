import { describe, expect, test } from "bun:test";
import type { WorkspaceSettings } from "@gitpal/utils";

process.env.DATABASE_URL ??=
	"postgres://postgres:postgres@localhost:5432/gitpal";
process.env.BETTER_AUTH_SECRET ??= "0123456789abcdef0123456789abcdef";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.CORS_ORIGIN ??= "http://localhost:3000";
process.env.NEXT_PUBLIC_SERVER_URL ??= "http://localhost:3000";

const dispatchModulePromise = import("./repository-webhooks-dispatch");

function createSettings() {
	return {
		ai: {
			reviewer: { enabled: true },
			labeler: { enabled: true },
		},
		preMergeChecks: { enabled: false },
		reviews: {
			behavior: {
				autoAssignReviewers: false,
				autoReview: {
					onMention: true,
					onOpen: false,
					onPush: false,
					onReadyForReview: false,
					baseBranches: [],
					skipDrafts: false,
					labels: [],
					skipLabels: [],
				},
			},
		},
		webhooks: {
			mentions: {
				enabled: true,
				aliases: ["/gitpal"],
				commands: ["review"],
			},
			preMerge: {
				enabled: false,
				aliases: ["/gitpal"],
				commands: ["merge"],
			},
			pullRequests: { enabled: false, actions: [] },
			mergeRequests: { enabled: false, actions: [] },
		},
	} as unknown as WorkspaceSettings;
}

function createPullRequest() {
	return {
		targetBranch: "main",
		draft: false,
	} as any;
}

function createCommentContext() {
	return {
		pullRequestNumber: 1,
		labels: [],
		commentBody: "/gitpal review",
		commentAuthorType: "User",
		commentAuthorLogin: "alice",
		reviewState: null,
		reviewSubmittedAt: null,
		headSha: null,
		baseSha: null,
		isPullRequestCommentEvent: true,
	} as any;
}

describe("repository webhook dispatch policy", () => {
	test("routes mention commands to manual mention reviews", async () => {
		const { resolveReviewDispatch } = await dispatchModulePromise;

		const dispatch = resolveReviewDispatch({
			providerType: "github",
			envelope: { event: "issue_comment", action: "created" } as any,
			pullRequest: createPullRequest(),
			settings: createSettings(),
			context: createCommentContext(),
		});

		expect(dispatch).toEqual({
			kind: "mention",
			trigger: "mention-command",
			manual: true,
		});
	});

	test("blocks bot-authored review comments", async () => {
		const { resolveReviewDispatch } = await dispatchModulePromise;

		const dispatch = resolveReviewDispatch({
			providerType: "github",
			envelope: { event: "issue_comment", action: "created" } as any,
			pullRequest: createPullRequest(),
			settings: createSettings(),
			context: {
				...createCommentContext(),
				commentBody: "<!-- gitpal-bot -->\n/gitpal review",
				commentAuthorType: "Bot",
				commentAuthorLogin: "gitpal[bot]",
			},
		});

		expect(dispatch).toBeNull();
	});

	test("routes github ready_for_review label dispatches", async () => {
		const { resolveLabelDispatch } = await dispatchModulePromise;

		const dispatch = resolveLabelDispatch({
			providerType: "github",
			envelope: { event: "pull_request", action: "ready_for_review" } as any,
			settings: createSettings(),
			context: {
				kind: "pull_request",
				number: 42,
				title: "Add new feature",
				body: null,
				labels: [],
				isDraft: false,
			},
		});

		expect(dispatch).toEqual({
			kind: "pull_request",
			trigger: "ready_for_review",
			manual: false,
		});
	});
});
