import type * as dashboardSchema from "@gitpal/db/schema/dashboard";
import type { GitRepositoryLabel, GitWebhookEnvelope } from "@gitpal/git";
import {
	type RepositoryLabelerRunJobData,
	type RepositoryReviewRunJobData,
	repositoryLabelerRunJobSchema,
	repositoryReviewRunJobSchema,
} from "@gitpal/jobs/inngest/functions/ai-workflows";
import { createLogger } from "@gitpal/logger";
import { repositories } from "@gitpal/repositories";
import { getAutomationActorForRepository } from "./git-provider-access";
import { projectIssueSnapshot } from "./issue-projection";
import { runRepositoryLabeler } from "./labeler";
import { sendUserNotification } from "./notifications";
import { recordObservabilityEvent } from "./observability";
import { projectPullRequestSnapshot } from "./pr-projection";
import { getRepositoryById } from "./repository-webhook-ingress";
import { loadDurableAiWebhookContext } from "./repository-webhook-receipts";
import {
	buildLabelerSummaryMarkdown,
	createPreMergeCheckRecords,
	createReviewCommentRecords,
	createReviewRun,
	finalizeReviewRun,
	finalizeUnstartedManualRun,
	listSuggestedReviewersForRepository,
	maybePublishSummaryComment,
	requestProviderNativeReviewers,
	toGitRepository,
} from "./repository-webhooks";
import {
	type LabelDispatch,
	type ReviewDispatch,
	resolveLabelDispatch,
	resolveReviewDispatch,
} from "./repository-webhooks-dispatch";
import {
	extractLabelContext,
	extractPullRequestContext,
	type LabelEventContext,
	type ProviderType,
	type PullRequestEventContext,
} from "./repository-webhooks-shared";
import { runRepositoryReview } from "./review-agent";
import { failActiveReviewRun } from "./review-runs";
import {
	finishRunStep,
	recordCompletedRunStep,
	startRunStep,
} from "./run-trace";
import { getRepositoryWorkspaceSettings } from "./workspace-settings";

const log = createLogger("repository-webhook-workflows");

type RepositoryRow = typeof dashboardSchema.repository.$inferSelect;
type PullRequestRow = typeof dashboardSchema.pullRequest.$inferSelect;
type IssueRow = typeof dashboardSchema.issue.$inferSelect;
type WebhookProcessingResult = "processed" | "failed" | "ignored";

async function runWebhookReview({
	repository,
	envelope,
	providerType,
	context,
	forcedDispatch = null,
	requestedByUserId = null,
	retryOfRunId = null,
	precreatedRunId = null,
}: {
	repository: RepositoryRow;
	envelope: GitWebhookEnvelope;
	providerType: ProviderType;
	context: PullRequestEventContext;
	forcedDispatch?: ReviewDispatch | null;
	requestedByUserId?: string | null;
	retryOfRunId?: string | null;
	precreatedRunId?: string | null;
}): Promise<WebhookProcessingResult> {
	const automationActor = await getAutomationActorForRepository({
		repositoryId: repository.id,
		providerId: repository.providerId,
	});
	if (!automationActor || !context.pullRequestNumber) {
		return "ignored" as const;
	}
	// NOTE: Bot-comment loop prevention is handled upstream in resolveReviewDispatch
	// via two complementary guards:
	//   1. GitHub App bots are filtered by user.type === "Bot" / login ending in "[bot]"
	//      (in the isCommentEvent block above).
	//   2. PAT-based bots (same login as automation actor) cannot re-trigger a review
	//      because matchesCommandTrigger now only matches the FIRST LINE of a comment,
	//      so bot review bodies (## Summary …) never look like /gitpal commands.
	// A naive identity-equality check was tried here but incorrectly blocked
	// legitimate /gitpal commands typed by the user when they use the same account
	// as the automation actor. DO NOT add that check back.
	const settingsResult = await getRepositoryWorkspaceSettings({
		organizationId: repository.organizationId,
		repositoryId: repository.id,
		userId: automationActor.userId,
	});
	if (!settingsResult) {
		return "ignored" as const;
	}
	const settings = settingsResult.effectiveSettings;
	const pullRequest = await automationActor.adapter.getPullRequest({
		repositoryPath: repository.repositoryPath,
		pullRequestNumber: context.pullRequestNumber,
	});
	const dispatch =
		forcedDispatch ??
		resolveReviewDispatch({
			providerType,
			envelope,
			pullRequest,
			settings,
			context,
		});
	if (!dispatch) {
		return "ignored" as const;
	}
	let nativeReviewerRequest: Awaited<
		ReturnType<typeof requestProviderNativeReviewers>
	> | null = null;
	if (
		dispatch.kind === "review" &&
		settings.reviews.behavior.autoAssignReviewers
	) {
		try {
			nativeReviewerRequest = await requestProviderNativeReviewers({
				repository,
				automationActor,
				pullRequest,
				providerType,
			});
		} catch (error) {
			log.warn(
				{
					err: error,
					repositoryId: repository.id,
					repositoryPath: repository.repositoryPath,
					providerId: repository.providerId,
				},
				"Native reviewer assignment failed.",
			);
		}
	}
	if (dispatch.kind !== "pre-merge" && !settings.ai.reviewer.enabled) {
		return dispatch.kind === "review" && nativeReviewerRequest?.applied
			? "processed"
			: "ignored";
	}
	const pullRequestRow = await projectPullRequestSnapshot({
		repositoryId: repository.id,
		pullRequest,
	});
	const reviewRun = await createReviewRun({
		repository,
		pullRequest: pullRequestRow,
		envelope,
		reviewKind: dispatch.kind,
		trigger: dispatch.trigger,
		modelId: settings.ai.reviewer.modelId,
		thinkingEnabled: settings.ai.thinking.enabled,
		requestedByUserId,
		retryOfRunId,
		precreatedRunId,
	});
	await recordCompletedRunStep({
		reviewRunId: reviewRun.id,
		stepKey: "request-received",
		position: 1,
		title: forcedDispatch ? "Manual review requested" : "Received webhook",
		summary: `${dispatch.trigger} trigger accepted`,
		details: { providerEvent: envelope.event, providerAction: envelope.action },
	});
	await recordCompletedRunStep({
		reviewRunId: reviewRun.id,
		stepKey: "context-synced",
		position: 2,
		title: "Synced pull request context",
		summary: `${pullRequest.sourceBranch} to ${pullRequest.targetBranch}`,
		details: {
			pullRequestNumber: pullRequest.number,
			draft: pullRequest.draft,
		},
	});
	await recordCompletedRunStep({
		reviewRunId: reviewRun.id,
		stepKey: "settings-loaded",
		position: 3,
		title: "Loaded review settings",
		summary: `Using ${settings.ai.reviewer.modelId}`,
	});
	const reviewStartedAt = reviewRun.startedAt?.getTime() ?? Date.now();
	await recordObservabilityEvent({
		userId: automationActor.userId,
		organizationId: repository.organizationId,
		repositoryId: repository.id,
		pullRequestId: pullRequestRow.id,
		reviewRunId: reviewRun.id,
		traceId: reviewRun.id,
		kind: "review",
		action: dispatch.kind,
		status: "running",
		severity: "warning",
		title: `${dispatch.kind} review started`,
		body: `${repository.fullName}#${pullRequest.number}`,
		sourceType: "review-run",
		sourceId: reviewRun.id,
		dedupeKey: `review-run:${reviewRun.id}:started`,
		metadata: {
			trigger: dispatch.trigger,
			providerEvent: envelope.event,
			providerAction: envelope.action,
			modelId: settings.ai.reviewer.modelId,
		},
	});
	try {
		await startRunStep({
			reviewRunId: reviewRun.id,
			stepKey: "context-inspected",
			position: 4,
			title: "Inspected changed files and discussion",
		});
		const [files, comments] = await Promise.all([
			automationActor.adapter.listPullRequestFiles({
				repositoryPath: repository.repositoryPath,
				pullRequestNumber: pullRequest.number,
			}),
			automationActor.adapter.listPullRequestComments({
				repositoryPath: repository.repositoryPath,
				pullRequestNumber: pullRequest.number,
			}),
		]);
		await finishRunStep({
			reviewRunId: reviewRun.id,
			stepKey: "context-inspected",
			summary: `${files.length} files and ${comments.length} comments loaded`,
			details: { fileCount: files.length, commentCount: comments.length },
		});
		const suggestedReviewers = await listSuggestedReviewersForRepository(
			repository.id,
		);
		await startRunStep({
			reviewRunId: reviewRun.id,
			stepKey: "ai-review",
			position: 5,
			title: "Ran AI review",
			summary: `Calling ${settings.ai.reviewer.modelId}`,
		});
		const reviewResult = await runRepositoryReview({
			userId: automationActor.userId,
			adapter: automationActor.adapter,
			repository: toGitRepository(repository),
			pullRequest,
			files,
			comments,
			settings,
			kind: dispatch.kind,
			suggestedReviewers,
			organizationId: repository.organizationId,
			repositoryDbId: repository.id,
			pullRequestDbId: pullRequestRow.id,
			reviewRunId: reviewRun.id,
		});
		await finishRunStep({
			reviewRunId: reviewRun.id,
			stepKey: "ai-review",
			summary: `${reviewResult.output.findings.length} findings generated`,
			details: {
				findingCount: reviewResult.output.findings.length,
				stepCount: reviewResult.steps.length,
			},
		});
		await startRunStep({
			reviewRunId: reviewRun.id,
			stepKey: "results-published",
			position: 6,
			title: "Published review results",
		});
		await maybePublishSummaryComment({
			adapter: automationActor.adapter,
			repository,
			pullRequest,
			settings,
			dispatch,
			commentMarkdown: reviewResult.commentMarkdown,
		});
		await createReviewCommentRecords({
			reviewRunId: reviewRun.id,
			repository,
			pullRequest: pullRequestRow,
			settings,
			adapter: automationActor.adapter,
			headSha: context.headSha,
			baseSha: context.baseSha,
			output: reviewResult.output,
			files,
		});
		await createPreMergeCheckRecords({
			reviewRunId: reviewRun.id,
			repository,
			pullRequest: pullRequestRow,
			output: reviewResult.output,
		});
		await finishRunStep({
			reviewRunId: reviewRun.id,
			stepKey: "results-published",
			summary: `${reviewResult.output.findings.length} findings and ${reviewResult.output.preMergeChecks.length} checks stored`,
		});
		await finalizeReviewRun({
			reviewRunId: reviewRun.id,
			status: "completed",
			summary: reviewResult.output.summary,
			finalCommentBody: reviewResult.commentMarkdown,
			promptVersion: reviewResult.promptVersion,
			reviewTemplate: reviewResult.reviewTemplate,
			confidence: reviewResult.output.confidence,
			result: {
				output: reviewResult.output,
				commentMarkdown: reviewResult.commentMarkdown,
				poem: reviewResult.poem,
				suggestedReviewers,
				nativeReviewerRequest,
				text: reviewResult.text,
				stepCount: reviewResult.steps.length,
				promptVersion: reviewResult.promptVersion,
				reviewTemplate: reviewResult.reviewTemplate,
				confidence: reviewResult.output.confidence,
			},
		});
		await recordCompletedRunStep({
			reviewRunId: reviewRun.id,
			stepKey: "completed",
			position: 7,
			title: "Completed",
			summary: "Review run completed successfully",
		});
		await recordObservabilityEvent({
			userId: automationActor.userId,
			organizationId: repository.organizationId,
			repositoryId: repository.id,
			pullRequestId: pullRequestRow.id,
			reviewRunId: reviewRun.id,
			traceId: reviewRun.id,
			kind: "review",
			action: dispatch.kind,
			status: "completed",
			severity: "success",
			title: `${dispatch.kind} review completed`,
			body: reviewResult.output.summary,
			sourceType: "review-run",
			sourceId: reviewRun.id,
			dedupeKey: `review-run:${reviewRun.id}:completed`,
			durationMs: Date.now() - reviewStartedAt,
			metadata: {
				trigger: dispatch.trigger,
				providerEvent: envelope.event,
				providerAction: envelope.action,
				stepCount: reviewResult.steps.length,
				commentCount: reviewResult.output.findings.length,
			},
		});
		await sendUserNotification({
			userId: automationActor.userId,
			organizationId: repository.organizationId,
			repositoryId: repository.id,
			type: "review_completed",
			category: "review",
			severity: "success",
			title: "AI review completed",
			body: `${repository.fullName}#${pullRequest.number}: ${pullRequest.title}`,
			actionHref: `/repositories/${repository.id}/pull-requests/${pullRequest.number}`,
			sourceType: "review-run",
			sourceId: reviewRun.id,
			dedupeKey: `review-run:${reviewRun.id}:notification:completed`,
			metadata: {
				trigger: dispatch.trigger,
				reviewKind: dispatch.kind,
				findings: reviewResult.output.findings.length,
			},
		});
		return "processed" as const;
	} catch (error) {
		for (const stepKey of [
			"context-inspected",
			"ai-review",
			"results-published",
		]) {
			await finishRunStep({
				reviewRunId: reviewRun.id,
				stepKey,
				status: "failed",
				summary: error instanceof Error ? error.message : "Review failed",
				errorCode: "review_failed",
			});
		}
		const errorMessage = error instanceof Error ? error.message : String(error);
		const isCredentialError =
			errorMessage.includes("Bad credentials") ||
			errorMessage.includes("Unauthorized") ||
			errorMessage.includes("403") ||
			errorMessage.includes("401");
		if (isCredentialError) {
			log.warn(
				{
					err: error,
					repositoryId: repository.id,
					repositoryPath: repository.repositoryPath,
					providerId: repository.providerId,
				},
				"Review processing skipped due to invalid credentials.",
			);
			await finalizeReviewRun({
				reviewRunId: reviewRun.id,
				status: "ignored",
				summary: null,
				finalCommentBody: null,
				result: { reason: "credential_error" },
			});
			await recordObservabilityEvent({
				userId: automationActor.userId,
				organizationId: repository.organizationId,
				repositoryId: repository.id,
				pullRequestId: pullRequestRow.id,
				reviewRunId: reviewRun.id,
				traceId: reviewRun.id,
				kind: "review",
				action: dispatch.kind,
				status: "ignored",
				severity: "warning",
				title: `${dispatch.kind} review ignored`,
				body: "Provider credentials could not authorize the review.",
				sourceType: "review-run",
				sourceId: reviewRun.id,
				dedupeKey: `review-run:${reviewRun.id}:ignored`,
				durationMs: Date.now() - reviewStartedAt,
				metadata: {
					reason: "credential_error",
					providerEvent: envelope.event,
					providerAction: envelope.action,
				},
			});
			await sendUserNotification({
				userId: automationActor.userId,
				organizationId: repository.organizationId,
				repositoryId: repository.id,
				type: "review_credential_error",
				category: "review",
				severity: "warning",
				title: "Review skipped: provider credentials",
				body: `${repository.fullName}#${pullRequest.number} could not be reviewed because provider credentials were rejected.`,
				actionHref: "/account/api-keys",
				sourceType: "review-run",
				sourceId: reviewRun.id,
				dedupeKey: `review-run:${reviewRun.id}:notification:credential-error`,
				metadata: {
					reviewKind: dispatch.kind,
					providerId: repository.providerId,
				},
			});
			return "ignored" as const;
		}
		await finalizeReviewRun({
			reviewRunId: reviewRun.id,
			status: "failed",
			summary: null,
			finalCommentBody: null,
			result: {
				error: error instanceof Error ? error.message : "review_failed",
			},
		});
		await recordObservabilityEvent({
			userId: automationActor.userId,
			organizationId: repository.organizationId,
			repositoryId: repository.id,
			pullRequestId: pullRequestRow.id,
			reviewRunId: reviewRun.id,
			traceId: reviewRun.id,
			kind: "review",
			action: dispatch.kind,
			status: "failed",
			severity: "error",
			title: `${dispatch.kind} review failed`,
			body: error instanceof Error ? error.message : "Review failed.",
			sourceType: "review-run",
			sourceId: reviewRun.id,
			dedupeKey: `review-run:${reviewRun.id}:failed`,
			durationMs: Date.now() - reviewStartedAt,
			metadata: {
				providerEvent: envelope.event,
				providerAction: envelope.action,
			},
		});
		await sendUserNotification({
			userId: automationActor.userId,
			organizationId: repository.organizationId,
			repositoryId: repository.id,
			type: "review_failed",
			category: "review",
			severity: "error",
			title: "AI review failed",
			body:
				error instanceof Error
					? `${repository.fullName}#${pullRequest.number}: ${error.message}`
					: `${repository.fullName}#${pullRequest.number}: review failed.`,
			actionHref: `/repositories/${repository.id}/pull-requests/${pullRequest.number}`,
			sourceType: "review-run",
			sourceId: reviewRun.id,
			dedupeKey: `review-run:${reviewRun.id}:notification:failed`,
			metadata: {
				reviewKind: dispatch.kind,
				providerEvent: envelope.event,
				providerAction: envelope.action,
			},
		});
		return "failed" as const;
	}
}

async function runWebhookLabeler({
	repository,
	envelope,
	providerType,
	forcedContext = null,
	forcedDispatch = null,
	requestedByUserId = null,
	retryOfRunId = null,
	precreatedRunId = null,
}: {
	repository: RepositoryRow;
	envelope: GitWebhookEnvelope;
	providerType: ProviderType;
	forcedContext?: LabelEventContext | null;
	forcedDispatch?: LabelDispatch | null;
	requestedByUserId?: string | null;
	retryOfRunId?: string | null;
	precreatedRunId?: string | null;
}): Promise<WebhookProcessingResult> {
	const automationActor = await getAutomationActorForRepository({
		repositoryId: repository.id,
		providerId: repository.providerId,
	});
	if (!automationActor) {
		return "ignored" as const;
	}
	const settingsResult = await getRepositoryWorkspaceSettings({
		organizationId: repository.organizationId,
		repositoryId: repository.id,
		userId: automationActor.userId,
	});
	if (!settingsResult) {
		return "ignored" as const;
	}
	const settings = settingsResult.effectiveSettings;
	const labelContext =
		forcedContext ?? extractLabelContext(providerType, envelope);
	if (!labelContext?.number) {
		return "ignored" as const;
	}
	const dispatch =
		forcedDispatch ??
		resolveLabelDispatch({
			providerType,
			envelope,
			settings,
			context: labelContext,
		});
	if (!dispatch) {
		return "ignored" as const;
	}
	let repositoryLabels: GitRepositoryLabel[] = [];
	try {
		repositoryLabels = await automationActor.adapter.listRepositoryLabels({
			repositoryPath: repository.repositoryPath,
			limit: 100,
		});
	} catch (error) {
		log.warn(
			{
				err: error,
				repositoryId: repository.id,
				repositoryPath: repository.repositoryPath,
			},
			"Could not fetch repository labels for webhook labeler.",
		);
		return "ignored" as const;
	}
	if (repositoryLabels.length === 0) {
		return "ignored" as const;
	}
	let pullRequestRow: PullRequestRow | null = null;
	let issueRow: IssueRow | null = null;
	let labelFiles: Awaited<
		ReturnType<typeof automationActor.adapter.listPullRequestFiles>
	> = [];
	if (dispatch.kind === "pull_request") {
		const pullRequest = await automationActor.adapter.getPullRequest({
			repositoryPath: repository.repositoryPath,
			pullRequestNumber: labelContext.number,
		});
		pullRequestRow = await projectPullRequestSnapshot({
			repositoryId: repository.id,
			pullRequest,
		});
		labelFiles = await automationActor.adapter.listPullRequestFiles({
			repositoryPath: repository.repositoryPath,
			pullRequestNumber: labelContext.number,
		});
	} else {
		const issue = await automationActor.adapter.getIssue({
			repositoryPath: repository.repositoryPath,
			issueNumber: labelContext.number,
		});
		issueRow = await projectIssueSnapshot({
			repositoryId: repository.id,
			issue,
		});
	}
	const labelRun = await createReviewRun({
		repository,
		pullRequest: pullRequestRow,
		envelope,
		reviewKind: "labeler",
		trigger: dispatch.trigger,
		modelId: settings.ai.labeler.modelId,
		thinkingEnabled: false,
		issue: issueRow,
		requestedByUserId,
		retryOfRunId,
		precreatedRunId,
	});
	await recordCompletedRunStep({
		reviewRunId: labelRun.id,
		stepKey: "request-received",
		position: 1,
		title: forcedDispatch ? "Manual labeler run requested" : "Received webhook",
		summary: `${dispatch.trigger} trigger accepted`,
	});
	await recordCompletedRunStep({
		reviewRunId: labelRun.id,
		stepKey: "context-synced",
		position: 2,
		title: `Synced ${dispatch.kind} context`,
		summary: `${repository.fullName}#${labelContext.number}`,
	});
	await recordCompletedRunStep({
		reviewRunId: labelRun.id,
		stepKey: "labels-loaded",
		position: 3,
		title: "Loaded repository labels",
		summary: `${repositoryLabels.length} labels available`,
	});
	await recordCompletedRunStep({
		reviewRunId: labelRun.id,
		stepKey: "rules-loaded",
		position: 4,
		title: "Loaded labeling rules",
		summary: "Workspace and repository settings resolved",
	});
	const labelerStartedAt = labelRun.startedAt?.getTime() ?? Date.now();
	await recordObservabilityEvent({
		userId: automationActor.userId,
		organizationId: repository.organizationId,
		repositoryId: repository.id,
		pullRequestId: pullRequestRow?.id ?? null,
		issueId: issueRow?.id ?? null,
		reviewRunId: labelRun.id,
		traceId: labelRun.id,
		kind: "review",
		action: "labeler",
		status: "running",
		severity: "warning",
		title: "Labeler started",
		body: `${repository.fullName}#${labelContext.number}`,
		sourceType: "review-run",
		sourceId: labelRun.id,
		dedupeKey: `review-run:${labelRun.id}:started`,
		metadata: {
			trigger: dispatch.trigger,
			providerEvent: envelope.event,
			providerAction: envelope.action,
			modelId: settings.ai.labeler.modelId,
		},
	});
	try {
		await startRunStep({
			reviewRunId: labelRun.id,
			stepKey: "ai-labeler",
			position: 5,
			title: "Ran AI labeler",
			summary: `Calling ${settings.ai.labeler.modelId}`,
		});
		const labelResult = await runRepositoryLabeler({
			userId: automationActor.userId,
			organizationId: repository.organizationId,
			adapter: automationActor.adapter,
			repository: toGitRepository(repository),
			settings,
			target: {
				kind: dispatch.kind,
				number: labelContext.number,
				title: labelContext.title,
				body: labelContext.body,
				currentLabels: labelContext.labels,
				files: labelFiles,
			},
			trigger: dispatch.trigger,
			providerEvent: envelope.event,
			providerAction: envelope.action,
			repositoryLabels,
			repositoryDbId: repository.id,
			pullRequestDbId: pullRequestRow?.id ?? null,
			reviewRunId: labelRun.id,
		});
		if (!labelResult) {
			await finishRunStep({
				reviewRunId: labelRun.id,
				stepKey: "ai-labeler",
				status: "skipped",
				summary: "Labeler is disabled for this target",
			});
			await finalizeReviewRun({
				reviewRunId: labelRun.id,
				status: "ignored",
				summary: null,
				finalCommentBody: null,
				result: { reason: "labeler_disabled" },
			});
			await recordObservabilityEvent({
				userId: automationActor.userId,
				organizationId: repository.organizationId,
				repositoryId: repository.id,
				pullRequestId: pullRequestRow?.id ?? null,
				issueId: issueRow?.id ?? null,
				reviewRunId: labelRun.id,
				traceId: labelRun.id,
				kind: "review",
				action: "labeler",
				status: "ignored",
				severity: "warning",
				title: "Labeler ignored",
				body: "Labeler returned no result.",
				sourceType: "review-run",
				sourceId: labelRun.id,
				dedupeKey: `review-run:${labelRun.id}:ignored`,
				durationMs: Date.now() - labelerStartedAt,
				metadata: {
					reason: "labeler_disabled",
					trigger: dispatch.trigger,
					providerEvent: envelope.event,
					providerAction: envelope.action,
				},
			});
			return "ignored" as const;
		}
		if (issueRow && labelResult.generationId) {
			await repositories.aiGeneration.updateById(labelResult.generationId, {
				issueId: issueRow.id,
			});
		}
		await finishRunStep({
			reviewRunId: labelRun.id,
			stepKey: "ai-labeler",
			summary: `${labelResult.suggestedLabels.length} labels suggested`,
			details: {
				suggestedLabels: labelResult.suggestedLabels,
				appliedLabels: labelResult.appliedLabels,
			},
		});
		await recordCompletedRunStep({
			reviewRunId: labelRun.id,
			stepKey: "labels-applied",
			position: 6,
			title: "Applied labels",
			summary:
				labelResult.appliedLabels.length > 0
					? labelResult.appliedLabels.join(", ")
					: "No provider label changes were required",
			details: { appliedLabels: labelResult.appliedLabels },
		});
		await finalizeReviewRun({
			reviewRunId: labelRun.id,
			status: "completed",
			summary: labelResult.summary,
			finalCommentBody: buildLabelerSummaryMarkdown(labelResult),
			result: {
				summary: labelResult.summary,
				suggestedLabels: labelResult.suggestedLabels,
				appliedLabels: labelResult.appliedLabels,
				availableLabels: labelResult.availableLabels.map((label) => label.name),
				trigger: dispatch.trigger,
				providerEvent: envelope.event,
				providerAction: envelope.action,
			},
		});
		await recordCompletedRunStep({
			reviewRunId: labelRun.id,
			stepKey: "completed",
			position: 7,
			title: "Completed",
			summary: "Labeler run completed successfully",
		});
		await recordObservabilityEvent({
			userId: automationActor.userId,
			organizationId: repository.organizationId,
			repositoryId: repository.id,
			pullRequestId: pullRequestRow?.id ?? null,
			issueId: issueRow?.id ?? null,
			reviewRunId: labelRun.id,
			traceId: labelRun.id,
			kind: "review",
			action: "labeler",
			status: "completed",
			severity: "success",
			title: "Labeler completed",
			body: labelResult.summary,
			sourceType: "review-run",
			sourceId: labelRun.id,
			dedupeKey: `review-run:${labelRun.id}:completed`,
			durationMs: Date.now() - labelerStartedAt,
			metadata: {
				trigger: dispatch.trigger,
				suggestedLabels: labelResult.suggestedLabels,
				appliedLabels: labelResult.appliedLabels,
			},
		});
		await sendUserNotification({
			userId: automationActor.userId,
			organizationId: repository.organizationId,
			repositoryId: repository.id,
			type: "labeler_completed",
			category: "review",
			severity: "success",
			title: "AI labeler completed",
			body: `${repository.fullName}#${labelContext.number}: ${labelResult.summary}`,
			actionHref:
				dispatch.kind === "issue"
					? `/repositories/${repository.id}/issues/${labelContext.number}`
					: `/repositories/${repository.id}/pull-requests/${labelContext.number}`,
			sourceType: "review-run",
			sourceId: labelRun.id,
			dedupeKey: `review-run:${labelRun.id}:notification:labeler-completed`,
		});
		return "processed" as const;
	} catch (error) {
		await finishRunStep({
			reviewRunId: labelRun.id,
			stepKey: "ai-labeler",
			status: "failed",
			summary: error instanceof Error ? error.message : "Labeler failed",
			errorCode: "labeler_failed",
		});
		await finalizeReviewRun({
			reviewRunId: labelRun.id,
			status: "failed",
			summary: null,
			finalCommentBody: null,
			result: {
				error: error instanceof Error ? error.message : "labeler_failed",
			},
		});
		await recordObservabilityEvent({
			userId: automationActor.userId,
			organizationId: repository.organizationId,
			repositoryId: repository.id,
			pullRequestId: pullRequestRow?.id ?? null,
			issueId: issueRow?.id ?? null,
			reviewRunId: labelRun.id,
			traceId: labelRun.id,
			kind: "review",
			action: "labeler",
			status: "failed",
			severity: "error",
			title: "Labeler failed",
			body: error instanceof Error ? error.message : "Labeler failed.",
			sourceType: "review-run",
			sourceId: labelRun.id,
			dedupeKey: `review-run:${labelRun.id}:failed`,
			durationMs: Date.now() - labelerStartedAt,
			metadata: {
				trigger: dispatch.trigger,
				providerEvent: envelope.event,
				providerAction: envelope.action,
			},
		});
		await sendUserNotification({
			userId: automationActor.userId,
			organizationId: repository.organizationId,
			repositoryId: repository.id,
			type: "labeler_failed",
			category: "review",
			severity: "error",
			title: "Labeler failed",
			body:
				error instanceof Error
					? `${repository.fullName}#${labelContext.number}: ${error.message}`
					: `${repository.fullName}#${labelContext.number}: labeler failed.`,
			actionHref:
				dispatch.kind === "issue"
					? `/repositories/${repository.id}/issues/${labelContext.number}`
					: `/repositories/${repository.id}/pull-requests/${labelContext.number}`,
			sourceType: "review-run",
			sourceId: labelRun.id,
			dedupeKey: `review-run:${labelRun.id}:notification:labeler-failed`,
			metadata: {
				trigger: dispatch.trigger,
				providerEvent: envelope.event,
				providerAction: envelope.action,
			},
		});
		return "failed" as const;
	}
}

export async function processRepositoryReviewRunJob(
	input: RepositoryReviewRunJobData,
) {
	const data = repositoryReviewRunJobSchema.parse(input);
	if (data.source === "manual") {
		try {
			if (data.targetKind && data.targetKind !== "pull_request") {
				await finalizeUnstartedManualRun({
					reviewRunId: data.runId,
					status: "failed",
					reason: "invalid_target_kind",
				});
				return { status: "failed" };
			}
			const repository = await getRepositoryById(data.repositoryId);
			if (!repository || !data.targetNumber) {
				await finalizeUnstartedManualRun({
					reviewRunId: data.runId,
					status: "ignored",
					reason: "target_not_found",
				});
				return { status: "ignored" };
			}
			const result = await runWebhookReview({
				repository,
				envelope: {
					providerId: repository.providerId,
					event: "manual_review",
					action: "requested",
					deliveryId: data.idempotencyKey ?? null,
					repository: null,
					sender: null,
					payload: {},
					headers: {},
					rawBody: "{}",
				},
				providerType: data.providerType,
				context: {
					pullRequestNumber: data.targetNumber,
					labels: [],
					commentBody: null,
					commentAuthorType: null,
					commentAuthorLogin: null,
					reviewState: null,
					reviewSubmittedAt: null,
					headSha: null,
					baseSha: null,
					isPullRequestCommentEvent: false,
				},
				forcedDispatch: { kind: "review", trigger: "manual", manual: true },
				requestedByUserId: data.requestedByUserId ?? null,
				retryOfRunId: data.retryOfRunId ?? null,
				precreatedRunId: data.runId ?? null,
			});
			if (result === "ignored") {
				await finalizeUnstartedManualRun({
					reviewRunId: data.runId,
					status: "ignored",
					reason: "review_not_started",
				});
			}
			return result;
		} catch (error) {
			if (data.runId) {
				await failActiveReviewRun({
					runId: data.runId,
					reason: "review_preflight_failed",
					errorMessage: error instanceof Error ? error.message : String(error),
				});
			}
			return { status: "failed" };
		}
	}
	if (!data.receiptId) return { status: "ignored" };
	const context = await loadDurableAiWebhookContext({
		receiptId: data.receiptId,
		repositoryId: data.repositoryId,
		providerType: data.providerType,
	});
	if (!context) {
		return { status: "ignored" };
	}
	const pullRequestContext = extractPullRequestContext(
		context.target.providerType,
		context.envelope,
	);

	return runWebhookReview({
		repository: context.repository,
		envelope: context.envelope,
		providerType: context.target.providerType,
		context: pullRequestContext,
	});
}

export async function processRepositoryLabelerRunJob(
	input: RepositoryLabelerRunJobData,
) {
	const data = repositoryLabelerRunJobSchema.parse(input);
	if (data.source === "manual") {
		try {
			const repository = await getRepositoryById(data.repositoryId);
			if (!repository || !data.targetNumber) {
				await finalizeUnstartedManualRun({
					reviewRunId: data.runId,
					status: "ignored",
					reason: "target_not_found",
				});
				return { status: "ignored" };
			}
			const automationActor = await getAutomationActorForRepository({
				repositoryId: repository.id,
				providerId: repository.providerId,
			});
			if (!automationActor) {
				await finalizeUnstartedManualRun({
					reviewRunId: data.runId,
					status: "ignored",
					reason: "provider_credentials_unavailable",
				});
				return { status: "ignored" };
			}
			const forcedKind = data.targetKind ?? "issue";
			let forcedContext: LabelEventContext;
			if (forcedKind === "pull_request") {
				const pullRequest = await automationActor.adapter.getPullRequest({
					repositoryPath: repository.repositoryPath,
					pullRequestNumber: data.targetNumber,
				});
				forcedContext = {
					kind: "pull_request",
					number: pullRequest.number,
					title: pullRequest.title,
					body: pullRequest.body,
					labels: [],
					isDraft: pullRequest.draft,
				};
			} else {
				const issue = await automationActor.adapter.getIssue({
					repositoryPath: repository.repositoryPath,
					issueNumber: data.targetNumber,
				});
				forcedContext = {
					kind: "issue",
					number: issue.number,
					title: issue.title,
					body: issue.body,
					labels: issue.labels,
					isDraft: false,
				};
			}
			const result = await runWebhookLabeler({
				repository,
				envelope: {
					providerId: repository.providerId,
					event: "manual_labeler",
					action: "requested",
					deliveryId: data.idempotencyKey ?? null,
					repository: null,
					sender: null,
					payload: {},
					headers: {},
					rawBody: "{}",
				},
				providerType: data.providerType,
				forcedContext,
				forcedDispatch: { kind: forcedKind, trigger: "manual", manual: true },
				requestedByUserId: data.requestedByUserId ?? null,
				retryOfRunId: data.retryOfRunId ?? null,
				precreatedRunId: data.runId ?? null,
			});
			if (result === "ignored") {
				await finalizeUnstartedManualRun({
					reviewRunId: data.runId,
					status: "ignored",
					reason: "labeler_not_started",
				});
			}
			return result;
		} catch (error) {
			if (data.runId) {
				await failActiveReviewRun({
					runId: data.runId,
					reason: "labeler_preflight_failed",
					errorMessage: error instanceof Error ? error.message : String(error),
				});
			}
			return { status: "failed" };
		}
	}
	if (!data.receiptId) return { status: "ignored" };
	const context = await loadDurableAiWebhookContext({
		receiptId: data.receiptId,
		repositoryId: data.repositoryId,
		providerType: data.providerType,
	});
	if (!context) {
		return { status: "ignored" };
	}

	return runWebhookLabeler({
		repository: context.repository,
		envelope: context.envelope,
		providerType: context.target.providerType,
	});
}
