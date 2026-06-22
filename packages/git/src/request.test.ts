import { afterEach, describe, expect, test } from "bun:test";
import {
	GitProviderRateLimitError,
	toGitProviderRateLimitError,
} from "./errors";
import { requestJsonPages } from "./request";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("provider rate limits", () => {
	test("uses a provider reset timestamp when retry-after is absent", () => {
		const error = toGitProviderRateLimitError(
			{
				status: 403,
				response: {
					headers: {
						"x-ratelimit-remaining": "0",
						"x-ratelimit-reset": "1030",
					},
				},
			},
			"github-cloud",
			1_000_000,
		);

		expect(error).toBeInstanceOf(GitProviderRateLimitError);
		expect(error?.retryAfterSeconds).toBe(30);
	});

	test("uses a conservative provider-specific fallback", () => {
		const error = toGitProviderRateLimitError(
			{ status: 429, response: { headers: {} } },
			"gitlab-enterprise",
		);

		expect(error?.retryAfterSeconds).toBe(30);
	});
});

describe("requestJsonPages", () => {
	test("collects every page and preserves existing query parameters", async () => {
		const requestedUrls: string[] = [];
		globalThis.fetch = (async (input: string | URL | Request) => {
			const url = String(input);
			requestedUrls.push(url);
			const page = new URL(url).searchParams.get("page");
			return Response.json(page === "1" ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }]);
		}) as unknown as typeof fetch;

		const items = await requestJsonPages<{ id: number }>(
			"https://gitlab.example/api/v4/projects?membership=true",
			{},
			"gitlab",
			{ pageSize: 2 },
		);

		expect(items).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
		expect(requestedUrls).toEqual([
			"https://gitlab.example/api/v4/projects?membership=true&per_page=2&page=1",
			"https://gitlab.example/api/v4/projects?membership=true&per_page=2&page=2",
		]);
	});

	test("fails closed at the configured page safety limit", async () => {
		globalThis.fetch = (async () =>
			Response.json([{ id: 1 }])) as unknown as typeof fetch;

		expect(
			requestJsonPages("https://gitlab.example/api/v4/projects", {}, "gitlab", {
				pageSize: 1,
				maxPages: 2,
			}),
		).rejects.toThrow("exceeded the 2-page safety limit");
	});
});
