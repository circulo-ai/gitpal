import { describe, expect, test } from "bun:test";
import {
	findWebhookAfterDuplicate,
	getUnverifiedWebhookDecision,
	isGitHubDuplicateWebhookError,
} from "./webhook-reconciliation";

describe("GitHub webhook reconciliation", () => {
	test("recognizes both message and structured Octokit duplicate errors", () => {
		expect(
			isGitHubDuplicateWebhookError(
				new Error("Validation Failed: Hook already exists on this repository"),
			),
		).toBe(true);
		expect(
			isGitHubDuplicateWebhookError({
				status: 422,
				response: {
					data: {
						errors: [
							{
								resource: "Hook",
								code: "custom",
								message: "Hook already exists on this repository",
							},
						],
					},
				},
			}),
		).toBe(true);
		expect(
			isGitHubDuplicateWebhookError({ status: 422, message: "Invalid URL" }),
		).toBe(false);
	});

	test("retries the provider list until the concurrently-created hook is visible", async () => {
		let calls = 0;
		const delays: number[] = [];
		const result = await findWebhookAfterDuplicate({
			listWebhooks: async () => {
				calls += 1;
				return calls < 3 ? [] : [{ id: "hook-1", active: true }];
			},
			isMatch: (webhook) => webhook.active,
			sleep: async (delayMs) => {
				delays.push(delayMs);
			},
		});

		expect(result?.webhook.id).toBe("hook-1");
		expect(calls).toBe(3);
		expect(delays).toEqual([100, 200]);
	});

	test("allows unsigned payloads only in development without a configured secret", () => {
		expect(
			getUnverifiedWebhookDecision({ hasSecret: true, isProduction: false }),
		).toBe("invalid_signature");
		expect(
			getUnverifiedWebhookDecision({ hasSecret: false, isProduction: true }),
		).toBe("secret_not_configured");
		expect(
			getUnverifiedWebhookDecision({ hasSecret: false, isProduction: false }),
		).toBe("allow_development");
	});
});
