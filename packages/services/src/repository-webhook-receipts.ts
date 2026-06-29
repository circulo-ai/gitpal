import type * as dashboardSchema from "@gitpal/db/schema/dashboard";
import type { GitPullRequest, GitWebhookEnvelope } from "@gitpal/git";
import {
	enqueueRepositoryLabelerRunJob,
	enqueueRepositoryReviewRunJob,
} from "@gitpal/jobs/inngest/functions/ai-workflows";
import {
	type ProviderWebhookJobData,
	providerWebhookJobSchema,
} from "@gitpal/jobs/inngest/functions/provider-webhooks";
import { createLogger } from "@gitpal/logger";
import { getAutomationActorForRepository } from "./git-provider-access";
import { projectIssueSnapshot } from "./issue-projection";
import {
	projectPullRequestSnapshot,
	recordHumanReviewSignal,
	recordPullRequestMetricEvents,
} from "./pr-projection";
import {
	createWebhookEnvelopeFromReceipt,
	findRepositoriesForWebhook,
	getRepositoryById,
	getWebhookReceipt,
	updateRepositoryWebhookHeartbeat,
	updateWebhookReceipt,
} from "./repository-webhook-ingress";
import {
	extractLabelContext,
	extractPullRequestContext,
	type ProviderType,
	type ProviderWebhookTarget,
	type PullRequestEventContext,
	resolveWebhookReceiptStatus,
	resolveWebhookTarget,
	toDateOrNull,
} from "./repository-webhooks-shared";

const log = createLogger("repository-webhook-receipts");

type RepositoryRow = typeof dashboardSchema.repository.$inferSelect;

const PULL_REQUEST_LIFECYCLE_EVENTS = new Set([
	// GitHub
	"pull_request",
	"pull_request_review",
	"pull_request_review_comment",
	// GitLab
	"merge_request",
	"note",
]);

/**
 * Real-time analytics projection (Layer 1). Runs on every relevant webhook,
 * independently of whether an AI review or labeler actually fires, so lifecycle
 * data (state, mergedAt, closedAt, ...) and human-review timing stay fresh.
 */
async function projectPullRequestLifecycle({
	repository,
	envelope,
	context,
}: {
	repository: RepositoryRow;
	envelope: GitWebhookEnvelope;
	context: PullRequestEventContext;
}) {
	if (!context.pullRequestNumber) {
		return;
	}
	if (!PULL_REQUEST_LIFECYCLE_EVENTS.has(envelope.event)) {
		return;
	}
	const automationActor = await getAutomationActorForRepository({
		repositoryId: repository.id,
		providerId: repository.providerId,
	});
	if (!automationActor) {
		return;
	}
	let pullRequest: GitPullRequest;
	try {
		pullRequest = await automationActor.adapter.getPullRequest({
			repositoryPath: repository.repositoryPath,
			pullRequestNumber: context.pullRequestNumber,
		});
	} catch (error) {
		log.warn(
			{
				err: error,
				repositoryId: repository.id,
				pullRequestNumber: context.pullRequestNumber,
			},
			"Pull request lifecycle projection skipped — getPullRequest failed.",
		);
		return;
	}
	const pullRequestRow = await projectPullRequestSnapshot({
		repositoryId: repository.id,
		pullRequest,
	});
	await recordPullRequestMetricEvents({
		userId: automationActor.userId,
		repository,
		pullRequest: pullRequestRow,
		source: {
			type: "webhook",
			event: envelope.event,
			action: envelope.action,
		},
	});

	// Human review timing + approval state. Captured in real time only: provider
	// APIs do not expose historical per-review timestamps, so the reconcile worker
	// cannot backfill these. GitHub fires a dedicated `pull_request_review` event
	// whose state is the review decision. (GitLab approvals are not yet mapped
	// here — its merge_request `state` is the MR lifecycle, not a review.)
	if (envelope.event !== "pull_request_review") {
		return;
	}
	const authorType = context.commentAuthorType?.toLowerCase();
	const authorLogin = context.commentAuthorLogin?.toLowerCase() ?? "";
	if (authorType === "bot" || authorLogin.endsWith("[bot]")) {
		return;
	}
	const reviewedAt = toDateOrNull(context.reviewSubmittedAt) ?? new Date();
	const reviewedPullRequestRow = await recordHumanReviewSignal({
		repositoryId: repository.id,
		pullRequestNumber: context.pullRequestNumber,
		reviewedAt,
		isApproval: context.reviewState?.toLowerCase() === "approved",
		approvalState: context.reviewState,
	});
	if (reviewedPullRequestRow) {
		await recordPullRequestMetricEvents({
			userId: automationActor.userId,
			repository,
			pullRequest: reviewedPullRequestRow,
			source: {
				type: "webhook",
				event: envelope.event,
				action: envelope.action,
			},
		});
	}
}

async function processWebhookReceipt({
	receiptId,
	repositories,
	envelope,
	target,
}: {
	receiptId: string;
	repositories: RepositoryRow[];
	envelope: GitWebhookEnvelope;
	target: ProviderWebhookTarget;
}) {
	await updateWebhookReceipt({ receiptId, status: "processing" });
	const context = extractPullRequestContext(target.providerType, envelope);
	let processed = 0;
	let failed = 0;
	for (const repository of repositories) {
		// Keep analytics fresh first — must never be blocked by review/label flow.
		try {
			await projectPullRequestLifecycle({ repository, envelope, context });
		} catch (error) {
			log.warn(
				{ err: error, repositoryId: repository.id },
				"Pull request lifecycle projection failed.",
			);
		}

		let queuedAiWork = false;
		const labelContext = extractLabelContext(target.providerType, envelope);
		if (labelContext?.kind === "issue" && labelContext.number) {
			try {
				const actor = await getAutomationActorForRepository({
					repositoryId: repository.id,
					providerId: repository.providerId,
				});
				if (actor) {
					const issue = await actor.adapter.getIssue({
						repositoryPath: repository.repositoryPath,
						issueNumber: labelContext.number,
					});
					await projectIssueSnapshot({ repositoryId: repository.id, issue });
				}
			} catch (error) {
				log.warn(
					{
						err: error,
						repositoryId: repository.id,
						issueNumber: labelContext.number,
					},
					"Issue lifecycle projection failed.",
				);
			}
		}
		if (labelContext?.number) {
			try {
				await enqueueRepositoryLabelerRunJob({
					source: "webhook",
					receiptId,
					repositoryId: repository.id,
					providerType: target.providerType,
				});
				queuedAiWork = true;
			} catch (error) {
				failed += 1;
				log.warn(
					{ err: error, receiptId, repositoryId: repository.id },
					"Repository labeler workflow could not be queued.",
				);
			}
		}

		if (context.pullRequestNumber) {
			try {
				await enqueueRepositoryReviewRunJob({
					source: "webhook",
					receiptId,
					repositoryId: repository.id,
					providerType: target.providerType,
				});
				queuedAiWork = true;
			} catch (error) {
				failed += 1;
				log.warn(
					{ err: error, receiptId, repositoryId: repository.id },
					"Repository review workflow could not be queued.",
				);
			}
		}

		if (queuedAiWork) {
			processed += 1;
		}
	}
	await updateWebhookReceipt({
		receiptId,
		status: resolveWebhookReceiptStatus({ processed, failed }),
	});
}

export async function loadDurableAiWebhookContext({
	receiptId,
	repositoryId,
	providerType,
}: {
	receiptId: string;
	repositoryId: string;
	providerType: ProviderType;
}) {
	const [receipt, repository] = await Promise.all([
		getWebhookReceipt(receiptId),
		getRepositoryById(repositoryId),
	]);

	if (!receipt) {
		log.warn({ receiptId }, "AI workflow skipped - webhook receipt missing.");
		return null;
	}

	if (!repository) {
		log.warn({ repositoryId }, "AI workflow skipped - repository missing.");
		return null;
	}

	if (repository.providerType !== providerType) {
		log.warn(
			{
				receiptId,
				repositoryId,
				expected: providerType,
				actual: repository.providerType,
			},
			"AI workflow skipped - provider type mismatch.",
		);
		return null;
	}

	const target = await resolveWebhookTarget(receipt.providerId);
	if (!target || target.providerType !== providerType) {
		log.warn(
			{ receiptId, repositoryId, providerId: receipt.providerId },
			"AI workflow skipped - provider target missing or mismatched.",
		);
		return null;
	}

	return {
		receipt,
		repository,
		target,
		envelope: createWebhookEnvelopeFromReceipt(receipt),
	};
}

export async function processProviderWebhookReceiptJob(
	input: ProviderWebhookJobData,
) {
	const data = providerWebhookJobSchema.parse(input);
	const receipt = await getWebhookReceipt(data.receiptId);
	if (!receipt) {
		log.warn(
			{ receiptId: data.receiptId, providerId: data.providerId },
			"Provider webhook receipt was not found.",
		);
		return;
	}
	if (receipt.providerId !== data.providerId) {
		await updateWebhookReceipt({ receiptId: receipt.id, status: "failed" });
		throw new Error("Provider webhook receipt provider mismatch.");
	}
	const target = await resolveWebhookTarget(receipt.providerId);
	if (!target) {
		await updateWebhookReceipt({ receiptId: receipt.id, status: "failed" });
		throw new Error("Provider webhook target could not be resolved.");
	}
	const repositories = receipt.repositoryPath
		? await findRepositoriesForWebhook({
				providerId: receipt.providerId,
				repositoryPath: receipt.repositoryPath,
			})
		: [];
	if (repositories.length === 0) {
		await updateWebhookReceipt({ receiptId: receipt.id, status: "ignored" });
		return;
	}
	await updateRepositoryWebhookHeartbeat(
		repositories.map((repository) => repository.id),
	);
	await processWebhookReceipt({
		receiptId: receipt.id,
		repositories,
		envelope: createWebhookEnvelopeFromReceipt(receipt),
		target,
	});
}
