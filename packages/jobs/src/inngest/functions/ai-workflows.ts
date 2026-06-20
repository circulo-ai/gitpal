import { randomUUID } from "node:crypto";
import { env } from "@gitpal/env/server";
import { eventType, NonRetriableError, staticSchema } from "inngest";
import { z } from "zod";
import { buildEventId } from "../../idempotency";
import { inngest } from "../client";
import { readIntegerConfig, secondsConfig } from "../config";

const aiRunJobBaseSchema = z.object({
	source: z.enum(["webhook", "manual"]).default("webhook"),
	receiptId: z.string().min(1).optional(),
	repositoryId: z.string().min(1),
	providerType: z.enum(["github", "gitlab"]),
	targetNumber: z.number().int().positive().optional(),
	targetKind: z.enum(["issue", "pull_request"]).optional(),
	requestedByUserId: z.string().min(1).optional(),
	retryOfRunId: z.string().min(1).optional(),
	runId: z.string().min(1).optional(),
	idempotencyKey: z.string().min(1).optional(),
});

export const repositoryReviewRunJobSchema = aiRunJobBaseSchema.superRefine(
	(data, context) => {
		if (data.source === "webhook" && !data.receiptId) {
			context.addIssue({ code: "custom", message: "receiptId is required." });
		}
		if (data.source === "manual" && !data.targetNumber) {
			context.addIssue({
				code: "custom",
				message: "targetNumber is required.",
			});
		}
	},
);

export type RepositoryReviewRunJobData = z.infer<
	typeof repositoryReviewRunJobSchema
>;

export const repositoryLabelerRunJobSchema = aiRunJobBaseSchema.superRefine(
	(data, context) => {
		if (data.source === "webhook" && !data.receiptId) {
			context.addIssue({ code: "custom", message: "receiptId is required." });
		}
		if (data.source === "manual" && !data.targetNumber) {
			context.addIssue({
				code: "custom",
				message: "targetNumber is required.",
			});
		}
	},
);

export type RepositoryLabelerRunJobData = z.infer<
	typeof repositoryLabelerRunJobSchema
>;

export const repositoryReviewRunRequestedEvent = eventType(
	"ai/review.requested",
	{
		schema: staticSchema<RepositoryReviewRunJobData>(),
	},
);

export const repositoryLabelerRunRequestedEvent = eventType(
	"ai/labeler.requested",
	{
		schema: staticSchema<RepositoryLabelerRunJobData>(),
	},
);

export type RepositoryReviewRunProcessor = (
	input: RepositoryReviewRunJobData,
) => Promise<unknown>;

export type RepositoryLabelerRunProcessor = (
	input: RepositoryLabelerRunJobData,
) => Promise<unknown>;

export type RepositoryRunFailureProcessor = (input: {
	runId: string;
	errorMessage: string;
}) => Promise<unknown>;

function parseJob<T>(schema: z.ZodSchema<T>, data: unknown, eventName: string) {
	const result = schema.safeParse(data);
	if (result.success) {
		return result.data;
	}

	throw new NonRetriableError(`Invalid ${eventName} payload.`, {
		cause: result.error,
	});
}

const aiWorkflowConcurrency: [
	{ scope: "account"; key: string; limit: number },
	{ key: string; limit: number },
] = [
	{
		scope: "account",
		key: `"ai-workflows"`,
		limit: readIntegerConfig(
			env.GITPAL_AI_WORKFLOW_ACCOUNT_CONCURRENCY,
			"GITPAL_AI_WORKFLOW_ACCOUNT_CONCURRENCY",
		),
	},
	{
		key: "event.data.repositoryId",
		limit: readIntegerConfig(
			env.GITPAL_AI_WORKFLOW_REPOSITORY_CONCURRENCY,
			"GITPAL_AI_WORKFLOW_REPOSITORY_CONCURRENCY",
		),
	},
];

const aiWorkflowFlowControl = {
	retries: 3 as const,
	concurrency: aiWorkflowConcurrency,
	throttle: {
		limit: readIntegerConfig(
			env.GITPAL_AI_WORKFLOW_THROTTLE_LIMIT,
			"GITPAL_AI_WORKFLOW_THROTTLE_LIMIT",
		),
		period: secondsConfig(
			env.GITPAL_AI_WORKFLOW_THROTTLE_PERIOD_SECONDS,
			"GITPAL_AI_WORKFLOW_THROTTLE_PERIOD_SECONDS",
		),
		key: `"ai-provider"`,
	},
	timeouts: {
		start: "30m" as const,
		finish: "2h" as const,
	},
};

export function createRepositoryReviewRunFunction(
	processRepositoryReviewRunJob: RepositoryReviewRunProcessor,
	processRepositoryRunFailure: RepositoryRunFailureProcessor,
) {
	return inngest.createFunction(
		{
			id: "repository-review-workflow",
			triggers: [repositoryReviewRunRequestedEvent],
			...aiWorkflowFlowControl,
			onFailure: async ({ event, error, step }) => {
				const runId = event.data.event.data.runId;
				if (!runId) return;
				await step.run("finalize-failed-manual-run", () =>
					processRepositoryRunFailure({
						runId,
						errorMessage: error.message,
					}),
				);
			},
		},
		async ({ event, step }) => {
			const data = parseJob(
				repositoryReviewRunJobSchema,
				event.data,
				"ai/review.requested",
			);

			return step.run("process-review-run", async () => {
				return processRepositoryReviewRunJob(data);
			});
		},
	);
}

export function createRepositoryLabelerRunFunction(
	processRepositoryLabelerRunJob: RepositoryLabelerRunProcessor,
	processRepositoryRunFailure: RepositoryRunFailureProcessor,
) {
	return inngest.createFunction(
		{
			id: "repository-labeler-workflow",
			triggers: [repositoryLabelerRunRequestedEvent],
			...aiWorkflowFlowControl,
			onFailure: async ({ event, error, step }) => {
				const runId = event.data.event.data.runId;
				if (!runId) return;
				await step.run("finalize-failed-manual-run", () =>
					processRepositoryRunFailure({
						runId,
						errorMessage: error.message,
					}),
				);
			},
		},
		async ({ event, step }) => {
			const data = parseJob(
				repositoryLabelerRunJobSchema,
				event.data,
				"ai/labeler.requested",
			);

			return step.run("process-labeler-run", async () => {
				return processRepositoryLabelerRunJob(data);
			});
		},
	);
}

export async function enqueueRepositoryReviewRunJob(
	input: RepositoryReviewRunJobData,
) {
	const data = repositoryReviewRunJobSchema.parse(input);

	return inngest.send({
		name: "ai/review.requested",
		data,
		id: buildEventId([
			"ai-review-run",
			data.receiptId ?? data.idempotencyKey ?? randomUUID(),
			data.repositoryId,
			data.targetKind,
		]),
	});
}

export async function enqueueRepositoryLabelerRunJob(
	input: RepositoryLabelerRunJobData,
) {
	const data = repositoryLabelerRunJobSchema.parse(input);

	return inngest.send({
		name: "ai/labeler.requested",
		data,
		id: buildEventId([
			"ai-labeler-run",
			data.receiptId ?? data.idempotencyKey ?? randomUUID(),
			data.repositoryId,
			data.targetKind,
		]),
	});
}
