import { eventType, RetryAfterError, staticSchema } from "inngest";
import { z } from "zod";
import { buildEventId } from "../../idempotency";
import { inngest } from "../client";

const PULL_REQUEST_SYNC_CONCURRENCY = 3;

export const pullRequestSyncJobSchema = z.object({
	repositoryId: z.string().min(1).optional(),
	requestId: z.string().min(1).optional(),
	reason: z
		.enum(["scheduled", "on-demand", "repository-enabled", "webhook-gap"])
		.optional(),
});

export type PullRequestSyncJobData = z.infer<typeof pullRequestSyncJobSchema>;

export const prSyncDispatchEvent = eventType("pull-request/sync.dispatch", {
	schema: staticSchema<PullRequestSyncJobData>(),
});

export type PullRequestReconcileProcessor = (input: {
	repositoryId: string;
}) => Promise<unknown>;

export type PullRequestDispatchProcessor = () => Promise<unknown>;
export type PullRequestReconcileFailureProcessor = (input: {
	repositoryId: string;
	errorMessage: string;
}) => Promise<unknown>;

export function createPullRequestSyncFunction({
	dispatchPullRequestReconcile,
	reconcilePullRequestsForRepository,
	markPullRequestReconcileFailed,
}: {
	dispatchPullRequestReconcile: PullRequestDispatchProcessor;
	reconcilePullRequestsForRepository: PullRequestReconcileProcessor;
	markPullRequestReconcileFailed: PullRequestReconcileFailureProcessor;
}) {
	return inngest.createFunction(
		{
			id: "pull-request-sync",
			triggers: [
				{ cron: "*/15 * * * *" }, // Replaces scheduled sweep
				prSyncDispatchEvent,
			],
			retries: 3,
			concurrency: PULL_REQUEST_SYNC_CONCURRENCY,
			timeouts: { start: "15m", finish: "1h" },
			onFailure: async ({ event, error, step }) => {
				const repositoryId = event.data.event.data.repositoryId;
				if (!repositoryId) return;
				await step.run("mark-reconcile-failed", () =>
					markPullRequestReconcileFailed({
						repositoryId,
						errorMessage: error.message,
					}),
				);
			},
		},
		async ({ event, step }) => {
			const data = pullRequestSyncJobSchema.parse(event.data ?? {});
			const repositoryId = data.repositoryId;

			if (repositoryId) {
				await step.run("reconcile-repository", async () => {
					try {
						await reconcilePullRequestsForRepository({ repositoryId });
					} catch (error) {
						const retryAfterSeconds = Number(
							(error as { retryAfterSeconds?: unknown })?.retryAfterSeconds,
						);
						if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
							throw new RetryAfterError(
								error instanceof Error
									? error.message
									: "Provider rate limited.",
								`${Math.ceil(retryAfterSeconds)}s`,
							);
						}
						throw error;
					}
				});
			} else {
				await step.run("dispatch-all", async () => {
					// This function iterates the DB and calls enqueuePullRequestSyncJob
					// automatically distributing the individual repository jobs into Inngest.
					await dispatchPullRequestReconcile();
				});
			}
		},
	);
}

export async function enqueuePullRequestSyncJob(input: PullRequestSyncJobData) {
	return inngest.send({
		name: "pull-request/sync.dispatch",
		data: input,
		id: buildEventId([
			"pull-request-sync",
			input.repositoryId ?? "all",
			input.reason ?? "scheduled",
			input.requestId ?? null,
		]),
	});
}
