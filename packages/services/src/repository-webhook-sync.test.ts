import { describe, expect, test } from "bun:test";
import { getRepositoryWebhookSyncFailureNotificationKey } from "./repository-webhook-sync-notifications";

describe("repository webhook sync notifications", () => {
	test("uses one stable failure key for a repository across retry attempts", () => {
		expect(
			getRepositoryWebhookSyncFailureNotificationKey({
				userId: "user_1",
				organizationId: "org_1",
				repositoryId: "repo_1",
			}),
		).toBe("repository-webhook-sync:user_1:org_1:repo_1:notification");
	});
});
