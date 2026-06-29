import type { GitPullRequest, GitWebhookEnvelope } from "@gitpal/git";
import { createLogger } from "@gitpal/logger";
import type { WorkspaceSettings } from "@gitpal/utils";
import {
	isCommentWebhookEvent,
	isPullRequestOpenAction,
	isPullRequestPushAction,
	type LabelEventContext,
	normalizeText,
	type ProviderType,
	type PullRequestEventContext,
} from "./repository-webhooks-shared";

const log = createLogger("repository-webhook-dispatch");

export type ReviewDispatchKind = "review" | "mention" | "pre-merge";

export type ReviewDispatch = {
	kind: ReviewDispatchKind;
	trigger: string;
	manual: boolean;
};

export type LabelDispatch = {
	kind: "issue" | "pull_request";
	trigger: string;
	manual: boolean;
};

export function resolveLabelDispatch({
	providerType,
	envelope,
	settings,
	context,
}: {
	providerType: ProviderType;
	envelope: GitWebhookEnvelope;
	settings: WorkspaceSettings;
	context: LabelEventContext;
}): LabelDispatch | null {
	if (!settings.ai.labeler.enabled || !context.number) {
		return null;
	}

	const normalizedAction = envelope.action?.toLowerCase() ?? "";
	if (context.kind === "pull_request") {
		if (
			isPullRequestOpenAction(normalizedAction) ||
			(providerType === "github" && normalizedAction === "ready_for_review")
		) {
			return {
				kind: "pull_request",
				trigger: normalizedAction || "pull_request",
				manual: false,
			};
		}
		return null;
	}

	if (isPullRequestOpenAction(normalizedAction)) {
		return {
			kind: "issue",
			trigger: normalizedAction || "issue",
			manual: false,
		};
	}

	return null;
}

function matchesCommandTrigger(
	body: string | null,
	settings:
		| WorkspaceSettings["webhooks"]["mentions"]
		| WorkspaceSettings["webhooks"]["preMerge"],
) {
	if (!body || !settings.enabled) {
		return false;
	}

	// FIX (loop + vacuous match): Only inspect the FIRST non-empty line of the
	// comment. The old code used `normalizedBody.includes(...)` which matched the
	// full body, so bot review comments that happen to repeat prior discussion
	// (which includes "/gitpal review") matched as commands and fed the
	// infinite loop. Commands must appear at the very start of the comment, not
	// buried inside a quoted conversation thread.
	//
	// Additional safety: when aliases OR commands is an empty array the old code
	// returned true vacuously ("any comment passes"). We now treat an empty array
	// as "no filter" only if BOTH are empty we bail out - an entirely
	// unconfigured trigger should not match every comment.
	if (settings.aliases.length === 0 && settings.commands.length === 0) {
		return false;
	}

	const firstLine =
		body
			.split(/\r?\n/)
			.map((l) => l.trim())
			.find((l) => l.length > 0) ?? "";
	const normalizedFirstLine = normalizeText(firstLine);
	const hasAlias =
		settings.aliases.length === 0 ||
		settings.aliases.some((alias) =>
			normalizedFirstLine.startsWith(normalizeText(alias)),
		);
	const hasCommand =
		settings.commands.length === 0 ||
		settings.commands.some((command) =>
			normalizedFirstLine.includes(normalizeText(command)),
		);
	return hasAlias && hasCommand;
}

function shouldRunAutomatedReview({
	pullRequest,
	settings,
	labels,
}: {
	pullRequest: GitPullRequest;
	settings: WorkspaceSettings;
	labels: string[];
}) {
	const autoReview = settings.reviews.behavior.autoReview;
	if (
		autoReview.baseBranches.length > 0 &&
		!autoReview.baseBranches.includes(pullRequest.targetBranch)
	) {
		return false;
	}
	if (autoReview.skipDrafts && pullRequest.draft) {
		return false;
	}
	if (
		autoReview.labels.length > 0 &&
		labels.length > 0 &&
		!autoReview.labels.some((label) => labels.includes(label))
	) {
		return false;
	}
	if (
		autoReview.skipLabels.length > 0 &&
		labels.some((label) => autoReview.skipLabels.includes(label))
	) {
		return false;
	}
	return true;
}

function getConfiguredPullRequestActions(
	providerType: ProviderType,
	settings: WorkspaceSettings,
) {
	return providerType === "github"
		? settings.webhooks.pullRequests
		: settings.webhooks.mergeRequests;
}

export function resolveReviewDispatch({
	providerType,
	envelope,
	pullRequest,
	settings,
	context,
}: {
	providerType: ProviderType;
	envelope: GitWebhookEnvelope;
	pullRequest: GitPullRequest;
	settings: WorkspaceSettings;
	context: PullRequestEventContext;
}): ReviewDispatch | null {
	if (
		!settings.ai.reviewer.enabled &&
		!settings.preMergeChecks.enabled &&
		!settings.reviews.behavior.autoAssignReviewers
	) {
		log.info("No review features enabled - skipping dispatch.");
		return null;
	}

	const isCommentEvent = isCommentWebhookEvent(envelope.event);
	if (isCommentEvent && !context.isPullRequestCommentEvent) {
		return null;
	}

	// Layer 1 - SENTINEL (strongest): every comment posted by this bot contains
	// the HTML marker <!-- gitpal-bot -->. This is immune to login changes,
	// GitHub App renames, enterprise installs, and edge-case API shape
	// differences. Check it first so none of the command-matching logic even
	// runs on a bot-generated body.
	//
	// Layer 2 - TYPE CHECK: GitHub sets user.type === "Bot" for GitHub App
	// installations. Catches bots from any app, not just this one.
	//
	// Layer 3 - LOGIN SUFFIX: GitHub App bot users have logins ending in
	// "[bot]" (e.g. "gitpal[bot]"). Backup for layer 2.
	//
	// Layer 4 - FIRST-LINE MATCHING (in matchesCommandTrigger): commands must
	// appear on the very first line of the comment, so bot review bodies that
	// contain "/gitpal" deep inside quoted discussion never match.
	//
	// These layers are independent - all four must be defeated simultaneously
	// for a bot comment to accidentally trigger a review.
	if (isCommentEvent) {
		const body = context.commentBody ?? "";
		if (body.includes("<!-- gitpal-bot -->")) {
			log.debug("Skipping comment - bot sentinel found in body.");
			return null;
		}
		const authorType = context.commentAuthorType?.toLowerCase();
		const authorLogin = context.commentAuthorLogin?.toLowerCase() ?? "";
		if (authorType === "bot" || authorLogin.endsWith("[bot]")) {
			log.debug("Skipping comment event from bot user.", {
				authorType: context.commentAuthorType,
				authorLogin: context.commentAuthorLogin,
			});
			return null;
		}
	}

	if (
		isCommentEvent &&
		settings.preMergeChecks.enabled &&
		matchesCommandTrigger(context.commentBody, settings.webhooks.preMerge)
	) {
		log.info("Dispatching pre-merge via comment command.");
		return {
			kind: "pre-merge",
			trigger: "comment-command",
			manual: true,
		};
	}

	if (
		isCommentEvent &&
		settings.reviews.behavior.autoReview.onMention &&
		matchesCommandTrigger(context.commentBody, settings.webhooks.mentions)
	) {
		log.info("Dispatching mention review via mention command.");
		return {
			kind: "mention",
			trigger: "mention-command",
			manual: true,
		};
	}

	// GitHub: approved pull_request_review triggers pre-merge check.
	// LOOP DEFENCE: also apply the sentinel + bot-type guard here because
	// pull_request_review events enter via isCommentEvent = true but the
	// "approved" branch was evaluated AFTER the isCommentEvent guard block,
	// meaning a bot that submits an approving review bypassed all bot checks.
	// We now re-apply them explicitly on this path.
	if (
		providerType === "github" &&
		envelope.event === "pull_request_review" &&
		context.reviewState === "approved" &&
		settings.preMergeChecks.enabled &&
		settings.webhooks.preMerge.enabled &&
		shouldRunAutomatedReview({
			pullRequest,
			settings,
			labels: context.labels,
		})
	) {
		const reviewBody = context.commentBody ?? "";
		if (reviewBody.includes("<!-- gitpal-bot -->")) {
			log.debug("Skipping approved pull_request_review - bot sentinel found.");
			return null;
		}
		const approverType = context.commentAuthorType?.toLowerCase();
		const approverLogin = context.commentAuthorLogin?.toLowerCase() ?? "";
		if (approverType === "bot" || approverLogin.endsWith("[bot]")) {
			log.debug("Skipping approved pull_request_review from bot user.", {
				approverType: context.commentAuthorType,
				approverLogin: context.commentAuthorLogin,
			});
			return null;
		}
		log.info("Dispatching pre-merge via review approval.");
		return {
			kind: "pre-merge",
			trigger: "review-approved",
			manual: false,
		};
	}

	if (envelope.event !== "pull_request" || !envelope.action) {
		log.info("Non-pull_request event with no dispatchable action.", {
			event: envelope.event,
			action: envelope.action,
		});
		return null;
	}

	const normalizedAction = envelope.action.toLowerCase();
	// FIX (auto-review on PR open): "opened", "reopened", and
	// "ready_for_review" actions are gated solely by their own autoReview
	// feature flags - NOT by configuredActions. Previously, configuredActions.
	// enabled being false (the common default) or the action being absent from
	// configuredActions.actions silently blocked every PR-open review, making
	// onOpen / onReadyForReview dead settings.
	//
	// Only "synchronize"-style push actions go through configuredActions,
	// because those are typically opt-in per-repo review-on-push settings.
	const isOpenAction = isPullRequestOpenAction(normalizedAction);
	const isReadyForReviewAction = normalizedAction === "ready_for_review";
	if (!isOpenAction && !isReadyForReviewAction) {
		const configuredActions = getConfiguredPullRequestActions(
			providerType,
			settings,
		);
		if (
			!configuredActions.enabled ||
			!configuredActions.actions.includes(normalizedAction)
		) {
			log.info("Action not in configured pull request actions.", {
				action: normalizedAction,
			});
			return null;
		}
	}

	if (
		!shouldRunAutomatedReview({
			pullRequest,
			settings,
			labels: context.labels,
		})
	) {
		log.info("Automated review suppressed by branch/draft/label filters.");
		return null;
	}

	if (isOpenAction) {
		log.info("Dispatching open review.", { action: normalizedAction });
		return settings.reviews.behavior.autoReview.onOpen
			? {
					kind: "review",
					trigger: normalizedAction,
					manual: false,
				}
			: null;
	}

	if (isPullRequestPushAction(normalizedAction)) {
		log.info("Dispatching push review.", { action: normalizedAction });
		return settings.reviews.behavior.autoReview.onPush
			? {
					kind: "review",
					trigger: normalizedAction,
					manual: false,
				}
			: null;
	}

	if (isReadyForReviewAction) {
		log.info("Dispatching ready-for-review review.");
		return settings.reviews.behavior.autoReview.onReadyForReview
			? {
					kind: "review",
					trigger: normalizedAction,
					manual: false,
				}
			: null;
	}

	// FIX #2: Removed the dead-code "approved" branch that was only reachable
	// for `pull_request` events (which GitHub never sends with action "approved").
	// The approved -> pre-merge path is correctly handled above via the
	// `pull_request_review` + reviewState === "approved" branch.
	log.info("No matching dispatch rule.", { action: normalizedAction });
	return null;
}
