import { expect, test } from "bun:test";

process.env.SKIP_ENV_VALIDATION = "1";
process.env.NODE_ENV = "test";
process.env.GITPAL_AI_WORKFLOW_ACCOUNT_CONCURRENCY = "4";
process.env.GITPAL_AI_WORKFLOW_REPOSITORY_CONCURRENCY = "1";
process.env.GITPAL_AI_WORKFLOW_THROTTLE_LIMIT = "30";
process.env.GITPAL_AI_WORKFLOW_THROTTLE_PERIOD_SECONDS = "60";
process.env.GITPAL_REPO_SYNC_ACCOUNT_CONCURRENCY = "4";
process.env.GITPAL_REPO_SYNC_USER_CONCURRENCY = "1";
process.env.GITPAL_REPO_SYNC_THROTTLE_LIMIT = "20";
process.env.GITPAL_REPO_SYNC_THROTTLE_PERIOD_SECONDS = "60";
process.env.GITPAL_REPO_SYNC_RATE_LIMIT = "120";
process.env.GITPAL_REPO_SYNC_RATE_LIMIT_PERIOD_SECONDS = "3600";
process.env.GITPAL_PROVIDER_WEBHOOK_WORKER_CONCURRENCY = "5";
process.env.GITPAL_PROVIDER_WEBHOOK_QUEUE_RATE_LIMIT_MAX = "10";
process.env.GITPAL_PROVIDER_WEBHOOK_QUEUE_RATE_LIMIT_DURATION_MS = "1000";

type FunctionManifest = {
	throttle?: { limit: unknown };
	rateLimit?: { limit: unknown };
	concurrency?: number | Array<{ limit: unknown }>;
};

function manifestFor(value: unknown) {
	return (
		value as {
			getConfig(input: { baseUrl: URL; appPrefix: string }): FunctionManifest[];
		}
	).getConfig({
		baseUrl: new URL("http://localhost/api/inngest"),
		appPrefix: "gitpal",
	})[0];
}

test("function manifests keep numeric flow-control limits when env validation is skipped", async () => {
	const [
		{ createRepositoryLabelerRunFunction },
		{ createRepositorySyncFunction },
		{ createProcessProviderWebhookFunction },
	] = await Promise.all([
		import("./ai-workflows"),
		import("./repo-sync"),
		import("./provider-webhooks"),
	]);
	const manifests = [
		manifestFor(
			createRepositoryLabelerRunFunction(
				async () => null,
				async () => null,
			),
		),
		manifestFor(createRepositorySyncFunction(async () => null)),
		manifestFor(
			createProcessProviderWebhookFunction(
				async () => null,
				async () => null,
			),
		),
	];

	for (const manifest of manifests) {
		if (manifest?.throttle) {
			expect(typeof manifest.throttle.limit).toBe("number");
		}
		if (manifest?.rateLimit) {
			expect(typeof manifest.rateLimit.limit).toBe("number");
		}
		if (Array.isArray(manifest?.concurrency)) {
			for (const concurrency of manifest.concurrency) {
				expect(typeof concurrency.limit).toBe("number");
			}
		}
	}
});

test("manual AI event payloads preserve their target kind", async () => {
	const { repositoryLabelerRunJobSchema } = await import("./ai-workflows");
	const parsed = repositoryLabelerRunJobSchema.parse({
		source: "manual",
		repositoryId: "repo_1",
		providerType: "gitlab",
		targetKind: "issue",
		targetNumber: 42,
	});

	expect(parsed.targetKind).toBe("issue");
});
