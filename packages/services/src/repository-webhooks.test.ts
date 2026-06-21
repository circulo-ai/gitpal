import { describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??=
	"postgres://postgres:postgres@localhost:5432/gitpal";
process.env.BETTER_AUTH_SECRET ??= "0123456789abcdef0123456789abcdef";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.CORS_ORIGIN ??= "http://localhost:3000";
process.env.NEXT_PUBLIC_SERVER_URL ??= "http://localhost:3000";

const repositoryWebhooksModulePromise = import("./repository-webhooks");

describe("repository webhook access errors", () => {
	test("detects GitHub webhook permission errors", async () => {
		const { isGitHubRepositoryWebhookAccessError } =
			await repositoryWebhooksModulePromise;

		expect(
			isGitHubRepositoryWebhookAccessError(
				new Error(
					"Resource not accessible by integration - https://docs.github.com/rest/repos/webhooks#list-repository-webhooks",
				),
			),
		).toBe(true);
	});

	test("detects wrapped GitHub webhook permission errors", async () => {
		const { isGitHubRepositoryWebhookAccessError } =
			await repositoryWebhooksModulePromise;

		expect(
			isGitHubRepositoryWebhookAccessError({
				response: {
					data: {
						message:
							"Resource not accessible by integration - https://docs.github.com/rest/repos/webhooks#list-repository-webhooks",
					},
				},
			}),
		).toBe(true);
	});

	test("ignores unrelated errors", async () => {
		const { isGitHubRepositoryWebhookAccessError } =
			await repositoryWebhooksModulePromise;

		expect(isGitHubRepositoryWebhookAccessError(new Error("boom"))).toBe(false);
	});
});
