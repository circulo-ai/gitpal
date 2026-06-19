import { env } from "@gitpal/env/server";
import { eventType, NonRetriableError, staticSchema } from "inngest";
import { z } from "zod";
import { buildEventId } from "../../idempotency";
import { inngest } from "../client";

export const repositorySyncJobSchema = z.object({
	userId: z.string().min(1),
	organizationId: z.string().min(1).optional().nullable(),
	repositoryId: z.string().min(1).optional().nullable(),
	providerId: z.string().min(1).optional().nullable(),
	reason: z
		.enum([
			"auto",
			"manual",
			"repository-added",
			"repository-enabled",
			"webhook-gap",
		])
		.default("auto"),
	force: z.boolean().default(false),
	requestId: z.string().min(1).optional(),
});

export type RepositorySyncJobData = z.infer<typeof repositorySyncJobSchema>;

export const repositorySyncRequestedEvent = eventType("repo/sync.requested", {
	schema: staticSchema<RepositorySyncJobData>(),
});

export type RepositorySyncProcessor = (
	input: RepositorySyncJobData,
) => Promise<unknown>;

function parseRepositorySyncEvent(data: unknown) {
	const result = repositorySyncJobSchema.safeParse(data);
	if (result.success) {
		return result.data;
	}

	throw new NonRetriableError("Invalid repo/sync.requested payload.", {
		cause: result.error,
	});
}

const repositorySyncConcurrency: [
	{ scope: "account"; key: string; limit: number },
	{ key: string; limit: number },
] = [
	{
		scope: "account",
		key: `"repo-sync"`,
		limit: env.GITPAL_REPO_SYNC_ACCOUNT_CONCURRENCY,
	},
	{
		key: "event.data.userId",
		limit: env.GITPAL_REPO_SYNC_USER_CONCURRENCY,
	},
];

export function createRepositorySyncFunction(
	processRepositorySyncJob: RepositorySyncProcessor,
) {
	return inngest.createFunction(
		{
			id: "repo-sync",
			triggers: [repositorySyncRequestedEvent],
			retries: 3 as const,
			concurrency: repositorySyncConcurrency,
			throttle: {
				limit: env.GITPAL_REPO_SYNC_THROTTLE_LIMIT,
				period:
					`${env.GITPAL_REPO_SYNC_THROTTLE_PERIOD_SECONDS}s` as `${number}s`,
				key: "event.data.userId",
			},
			rateLimit: {
				limit: env.GITPAL_REPO_SYNC_RATE_LIMIT,
				period:
					`${env.GITPAL_REPO_SYNC_RATE_LIMIT_PERIOD_SECONDS}s` as `${number}s`,
				key: "event.data.userId",
			},
		},
		async ({ event, step }) => {
			const data = parseRepositorySyncEvent(event.data);

			return step.run("sync-repositories", async () => {
				return processRepositorySyncJob(data);
			});
		},
	);
}

export async function enqueueRepositorySyncJob(input: RepositorySyncJobData) {
	const data = repositorySyncJobSchema.parse(input);

	return inngest.send({
		name: "repo/sync.requested",
		data,
		id:
			data.requestId ??
			buildEventId([
				"repo-sync",
				data.userId,
				data.organizationId ?? "all",
				data.repositoryId ?? "all",
				data.providerId ?? "all",
				data.reason,
				data.force,
			]),
	});
}
