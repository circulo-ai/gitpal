import { randomUUID } from "node:crypto";
import type * as dashboardSchema from "@gitpal/db/schema/dashboard";
import {
	type GitActor,
	type GitProviderAdapter,
	type GitPullRequest,
	type GitPullRequestFile,
	type GitRepository,
	type GitWebhookEnvelope,
} from "@gitpal/git";
import { createLogger } from "@gitpal/logger";
import { repositories } from "@gitpal/repositories";
import type { WorkspaceSettings } from "@gitpal/utils";
import {
	createAppAdapterForRepository,
	type GitAccount,
	getAutomationActorForRepository,
	getEnterpriseProviderMap,
} from "./git-provider-access";
import {
	type RepositoryReviewOutput,
} from "./review-agent";
import { resolveDiffAnchor } from "./review-anchors";
import { sanitizeRunDetails } from "./safe-diagnostics";
import {
	findWebhookAfterDuplicate,
	isGitHubDuplicateWebhookError,
} from "./webhook-reconciliation";
import {
	buildDeliveryUrl,
	buildGitHubRepositoryWebhookAccessMessage,
	formatSecretPreview,
	getRequiredWebhookEvents,
	isGitHubRepositoryWebhookAccessError,
	normalizeWebhookUrl,
	resolveWebhookTarget,
	getWebhookBaseUrl,
	type ProviderType,
	type ProviderWebhookTarget,
} from "./repository-webhooks-shared";
import {
	type ReviewDispatch,
	type ReviewDispatchKind,
} from "./repository-webhooks-dispatch";
export { processProviderWebhookFailure, receiveProviderWebhook } from "./repository-webhook-ingress";
export { processProviderWebhookReceiptJob } from "./repository-webhook-receipts";
export { isGitHubRepositoryWebhookAccessError } from "./repository-webhooks-shared";

const log = createLogger("repository-webhooks");
type RepositoryRow = typeof dashboardSchema.repository.$inferSelect;
type PullRequestRow = typeof dashboardSchema.pullRequest.$inferSelect;
type IssueRow = typeof dashboardSchema.issue.$inferSelect;
type WebhookReviewKind = ReviewDispatchKind | "labeler";
type RepositoryWebhookSyncResult = {
	created: number;
	existing: number;
	skipped: number;
	failed: number;
	warnings: string[];
	errors: string[];
};
type RepositoryWebhookSubscriptionResult = {
	status: "created" | "existing" | "skipped";
	error: string | null;
	severity: "warning" | "error" | null;
};
// FIX #6: added teamReviewers so it can be populated if the adapter supports it
type NativeReviewerRequest = {
	reviewers?: string[];
	reviewerIds?: number[];
	teamReviewers?: string[];
};
// `upsertPullRequestSnapshot` and `recordHumanReviewSignal` now live in
// `./pull-request-projection` so the webhook path, the scheduled reconcile
// worker, and any future on-demand refresh share one idempotent projection.
export async function createReviewRun({
	repository,
	pullRequest,
	envelope,
	reviewKind,
	trigger,
	modelId,
	thinkingEnabled,
	issue = null,
	requestedByUserId = null,
	retryOfRunId = null,
	precreatedRunId = null,
}: {
	repository: RepositoryRow;
	pullRequest: PullRequestRow | null;
	envelope: GitWebhookEnvelope;
	reviewKind: WebhookReviewKind;
	trigger: string;
	modelId: string;
	thinkingEnabled: boolean;
	issue?: IssueRow | null;
	requestedByUserId?: string | null;
	retryOfRunId?: string | null;
	precreatedRunId?: string | null;
}) {
	const now = new Date();
	const id = precreatedRunId ?? `review_run_${randomUUID()}`;
	if (precreatedRunId) {
		const row = await repositories.reviewRun.startQueuedRun(precreatedRunId, {
			trigger,
			modelId,
			thinkingEnabled,
		});
		if (!row) throw new Error("Queued review run could not be started.");
		return row;
	}
	const row = await repositories.reviewRun.create({
		id,
		repositoryId: repository.id,
		pullRequestId: pullRequest?.id ?? null,
		issueId: issue?.id ?? null,
		requestedByUserId,
		retryOfRunId,
		traceId: id,
		reviewKind,
		trigger,
		providerId: repository.providerId,
		providerDeliveryId: envelope.deliveryId,
		providerEvent: envelope.event,
		providerAction: envelope.action,
		status: "running",
		modelId,
		thinkingEnabled,
		startedAt: now,
		createdAt: now,
		updatedAt: now,
	});
	return row;
}

export async function finalizeUnstartedManualRun({
	reviewRunId,
	status,
	reason,
}: {
	reviewRunId: string | null | undefined;
	status: "failed" | "ignored";
	reason: string;
}) {
	if (!reviewRunId) return;
	await repositories.reviewRun.finalizeUnstartedManualRun(
		reviewRunId,
		status,
		reason,
	);
}

export async function finalizeReviewRun({
	reviewRunId,
	status,
	summary,
	finalCommentBody,
	result,
	promptVersion,
	reviewTemplate,
	confidence,
}: {
	reviewRunId: string;
	status: string;
	summary: string | null;
	finalCommentBody: string | null;
	result: Record<string, unknown>;
	promptVersion?: string | null;
	reviewTemplate?: string | null;
	confidence?: RepositoryReviewOutput["confidence"] | null;
}) {
	await repositories.reviewRun.finalizeReviewRun(reviewRunId, {
		status,
		summary,
		finalCommentBody,
		result: sanitizeRunDetails(result),
		promptVersion: promptVersion ?? undefined,
		reviewTemplate: reviewTemplate ?? undefined,
		confidenceLevel: confidence?.risk ?? undefined,
		confidenceScore: confidence?.score ?? undefined,
		confidenceSummary: confidence?.summary ?? undefined,
	});
}
function formatFindingBody(
	finding: RepositoryReviewOutput["findings"][number],
) {
	const suggestionBlocks = finding.suggestions
		.map((suggestion) => {
			const label =
				suggestion.kind === "patch_hint"
					? "Suggested patch"
					: suggestion.kind === "code_snippet"
						? "Suggested snippet"
						: "Suggestion";
			const sections = [`**${label}** - ${suggestion.title}`];
			if (suggestion.body.trim()) {
				sections.push(suggestion.body.trim());
			}
			if (suggestion.patch?.trim()) {
				sections.push(`Patch hint:\n\`\`\`diff\n${suggestion.patch.trim()}\n\`\`\``);
			}
			if (suggestion.codeSnippet?.trim()) {
				sections.push(
					`Code snippet${suggestion.language?.trim() ? ` (${suggestion.language.trim()})` : ""}:\n\`\`\`${suggestion.language?.trim() || "text"}\n${suggestion.codeSnippet.trim()}\n\`\`\``,
				);
			}
			return sections.join("\n\n");
		})
		.join("\n\n");

	return [
		`**${finding.severity.toUpperCase()}** · ${finding.title}`,
		finding.body,
		suggestionBlocks,
	]
		.filter((section) => section.trim().length > 0)
		.join("\n\n");
}
export function buildLabelerSummaryMarkdown({
	summary,
	suggestedLabels,
	appliedLabels,
}: {
	summary: string;
	suggestedLabels: string[];
	appliedLabels: string[];
}) {
	const sections: string[] = [];
	if (summary.trim()) {
		sections.push(`## Label summary\n${summary.trim()}`);
	}
	if (suggestedLabels.length > 0) {
		sections.push(
			`## Suggested labels\n${suggestedLabels.map((label) => `- ${label}`).join("\n")}`,
		);
	}
	if (appliedLabels.length > 0) {
		sections.push(
			`## Applied labels\n${appliedLabels.map((label) => `- ${label}`).join("\n")}`,
		);
	}
	return sections.join("\n\n");
}
async function listRepositoryReviewerCandidates(repositoryId: string) {
	return repositories.repositoryAccess.listReviewerCandidates(repositoryId);
}
export async function listSuggestedReviewersForRepository(repositoryId: string) {
	const rows = await listRepositoryReviewerCandidates(repositoryId);
	return rows
		.map(({ user }) => user.name?.trim() || user.email.split("@")[0] || user.id)
		.filter(Boolean);
}
function getActorIdentityKey(
	actor: GitActor | null,
	providerType: ProviderType,
) {
	if (!actor) {
		return null;
	}
	if (providerType === "github") {
		return actor.login?.trim().toLowerCase() ?? null;
	}
	return actor.id?.trim() ?? null;
}
export async function requestProviderNativeReviewers({
	repository,
	automationActor,
	pullRequest,
	providerType,
}: {
	repository: RepositoryRow;
	automationActor: Awaited<ReturnType<typeof getAutomationActorForRepository>>;
	pullRequest: GitPullRequest;
	providerType: ProviderType;
}) {
	if (!automationActor?.adapter.capabilities.reviewers) {
		return {
			applied: false,
			reviewers: [] as string[],
			reviewerIds: [] as number[],
		};
	}
	const candidates = await listRepositoryReviewerCandidates(repository.id);
	if (candidates.length === 0) {
		return {
			applied: false,
			reviewers: [] as string[],
			reviewerIds: [] as number[],
		};
	}
	const providerMembers =
		await repositories.providerWorkspaceMember.listProviderMembersForOrgAndProvider(
			repository.organizationId,
			repository.providerId,
		);
	const loginByMemberId = new Map(
		providerMembers.map((member) => [member.providerMemberId, member.login]),
	);
	const automationIdentity = await automationActor.adapter
		.getCurrentUser()
		.catch(() => null);
	const automationIdentityKey = getActorIdentityKey(
		automationIdentity,
		providerType,
	);
	const pullRequestAuthorIdentityKey = getActorIdentityKey(
		pullRequest.author,
		providerType,
	);
	const target = {
		reviewers: new Set<string>(),
		reviewerIds: new Set<number>(),
	};
	for (const candidate of candidates) {
		if (candidate.access.userId === automationActor.userId) {
			continue;
		}
		const account = candidate.account as GitAccount;
		if (account.providerId !== repository.providerId || !account.accountId) {
			continue;
		}
		// Build the candidate provider identity from stored data only.
		const candidateActor: GitActor = {
			id: account.accountId,
			login: loginByMemberId.get(account.accountId) ?? null,
			name: null,
			email: null,
			avatarUrl: null,
			htmlUrl: null,
			kind: "user",
		};
		const providerIdentityKey = getActorIdentityKey(
			candidateActor,
			providerType,
		);
		if (!providerIdentityKey) {
			continue;
		}
		if (
			automationIdentityKey &&
			providerIdentityKey === automationIdentityKey
		) {
			continue;
		}
		if (
			pullRequestAuthorIdentityKey &&
			providerIdentityKey === pullRequestAuthorIdentityKey
		) {
			continue;
		}
		if (providerType === "github") {
			const login = candidateActor.login?.trim();
			if (!login) {
				continue;
			}
			target.reviewers.add(login);
		} else {
			const reviewerId = Number(candidateActor.id);
			if (!Number.isInteger(reviewerId) || reviewerId <= 0) {
				continue;
			}
			target.reviewerIds.add(reviewerId);
		}
		if (target.reviewers.size + target.reviewerIds.size >= 3) {
			break;
		}
	}
	const request: NativeReviewerRequest = {
		reviewers: [...target.reviewers],
		reviewerIds: [...target.reviewerIds],
		// FIX #6: teamReviewers populated (empty for now; extend here when
		// team-based reviewer assignment is implemented)
		teamReviewers: [],
	};
	if (request.reviewers?.length === 0) {
		delete request.reviewers;
	}
	if (request.reviewerIds?.length === 0) {
		delete request.reviewerIds;
	}
	if (request.teamReviewers?.length === 0) {
		delete request.teamReviewers;
	}
	if (!request.reviewers && !request.reviewerIds && !request.teamReviewers) {
		return {
			applied: false,
			reviewers: [] as string[],
			reviewerIds: [] as number[],
		};
	}
	await automationActor.adapter.requestPullRequestReviewers({
		repositoryPath: repository.repositoryPath,
		pullRequestNumber: pullRequest.number,
		...request,
	});
	return {
		applied: true,
		reviewers: request.reviewers ?? [],
		reviewerIds: request.reviewerIds ?? [],
	};
}
export function toGitRepository(repository: RepositoryRow): GitRepository {
	return {
		providerId: repository.providerId,
		repositoryPath: repository.repositoryPath,
		repositoryId: repository.repositoryId,
		name: repository.name,
		fullName: repository.fullName,
		htmlUrl: repository.htmlUrl,
		defaultBranch: repository.defaultBranch,
		private: repository.private,
		description: repository.description,
		owner: repository.ownerLogin
			? {
					id: repository.ownerLogin,
					login: repository.ownerLogin,
					name: repository.ownerLogin,
					email: null,
					avatarUrl: repository.ownerAvatarUrl,
					htmlUrl: null,
					kind: "user",
				}
			: null,
		workspace: null,
	};
}
export async function maybePublishSummaryComment({
	adapter,
	repository,
	pullRequest,
	settings,
	dispatch,
	commentMarkdown,
}: {
	adapter: GitProviderAdapter;
	repository: RepositoryRow;
	pullRequest: GitPullRequest;
	settings: WorkspaceSettings;
	dispatch: ReviewDispatch;
	commentMarkdown: string;
}) {
	const shouldPublish =
		dispatch.kind === "pre-merge"
			? settings.statuses.publishPreMergeSummary
			: settings.statuses.publishReviewSummary;
	if (!shouldPublish || !settings.ai.reviewer.postSummaryComment) {
		log.info("Summary comment publishing skipped — disabled by settings.", {
			kind: dispatch.kind,
			publishPreMergeSummary: settings.statuses.publishPreMergeSummary,
			publishReviewSummary: settings.statuses.publishReviewSummary,
			postSummaryComment: settings.ai.reviewer.postSummaryComment,
		});
		return null;
	}
	log.info("Publishing summary comment to provider.", {
		repositoryPath: repository.repositoryPath,
		pullRequestNumber: pullRequest.number,
		kind: dispatch.kind,
	});
	// LOOP DEFENSE — bot sentinel: append a hidden HTML comment to every review
	// body posted by this bot.  resolveReviewDispatch checks for this marker
	// before any command matching, so even if the login/type checks ever fail
	// (e.g. enterprise installs, renamed accounts, edge-case GitHub API shapes)
	// the bot's own comments are definitively self-identified and ignored.
	const bodyWithSentinel = `${commentMarkdown}\n\n<!-- gitpal-bot -->`;
	const comment = await adapter.createComment({
		repositoryPath: repository.repositoryPath,
		pullRequestNumber: pullRequest.number,
		body: bodyWithSentinel,
	});
	return comment;
}
export async function createReviewCommentRecords({
	reviewRunId,
	repository,
	pullRequest,
	settings,
	adapter,
	headSha,
	baseSha,
	output,
	files,
}: {
	reviewRunId: string;
	repository: RepositoryRow;
	pullRequest: PullRequestRow;
	settings: WorkspaceSettings;
	adapter: GitProviderAdapter;
	headSha: string | null;
	baseSha: string | null;
	output: RepositoryReviewOutput;
	files: GitPullRequestFile[];
}) {
	for (const finding of output.findings) {
		let providerCommentId: string | null = null;
		const now = new Date();
		const anchor = resolveDiffAnchor(files, finding.filePath, finding.line);
		if (
			settings.ai.reviewer.postInlineFindings &&
			["github", "gitlab"].includes(repository.providerType) &&
			finding.filePath &&
			anchor.line &&
			headSha
		) {
			try {
				const inlineComment = await adapter.createComment({
					repositoryPath: repository.repositoryPath,
					pullRequestNumber: pullRequest.number,
					body: formatFindingBody(finding),
					path: finding.filePath,
					line: anchor.line,
					commitSha: headSha,
					baseSha: baseSha ?? undefined,
					headSha,
				});
				providerCommentId = inlineComment.id;
			} catch {
				providerCommentId = null;
			}
		}
		await repositories.reviewComment.create({
			id: `review_comment_${randomUUID()}`,
			reviewRunId,
			pullRequestId: pullRequest.id,
			repositoryId: repository.id,
			providerCommentId,
			authorType: "ai",
			authorLogin: "gitpal",
			severity: finding.severity,
			category: finding.category,
			title: finding.title,
			body: finding.body,
			filePath: finding.filePath,
			line: anchor.line ?? finding.line,
			startLine: anchor.line ?? finding.line,
			metadata: {
				anchorStatus: anchor.status,
				requestedLine: anchor.originalLine,
				publishedInline: Boolean(providerCommentId),
				suggestionCount: finding.suggestions.length,
				suggestionKinds: finding.suggestions.map((suggestion) => suggestion.kind),
			},
			accepted: false,
			resolved: false,
			createdAt: now,
			updatedAt: now,
		});
	}
}
export async function createPreMergeCheckRecords({
	reviewRunId,
	repository,
	pullRequest,
	output,
}: {
	reviewRunId: string;
	repository: RepositoryRow;
	pullRequest: PullRequestRow;
	output: RepositoryReviewOutput;
}) {
	for (const check of output.preMergeChecks) {
		const now = new Date();
		await repositories.preMergeCheckRun.create({
			id: `pre_merge_check_${randomUUID()}`,
			reviewRunId,
			repositoryId: repository.id,
			pullRequestId: pullRequest.id,
			checkName: check.name,
			checkType: "ai",
			status: check.status,
			details: {
				details: check.details,
			},
			startedAt: now,
			completedAt: now,
		});
	}
}
async function ensureRepositoryWebhookSubscription({
	repository,
	adapter,
	target,
}: {
	repository: RepositoryRow;
	adapter: GitProviderAdapter;
	target: ProviderWebhookTarget;
}): Promise<RepositoryWebhookSubscriptionResult> {
	const webhookSecret = target.secret ?? target.signingSecret;
	if (!webhookSecret || !getWebhookBaseUrl()) {
		return {
			status: "skipped" as const,
			error: `${repository.fullName}: webhook base URL or secret is not configured.`,
			severity: "error" as const,
		};
	}
	try {
		const deliveryUrl = normalizeWebhookUrl(buildDeliveryUrl(target));
		const requiredEvents = getRequiredWebhookEvents(target.providerType);
		const existingWebhooks = await adapter.listWebhooks({
			repositoryPath: repository.repositoryPath,
		});
		const matchingWebhooks = existingWebhooks.filter(
			(webhook) => normalizeWebhookUrl(webhook.url) === deliveryUrl,
		);
		const configuredSecretPreview = formatSecretPreview(webhookSecret);
		const matchingWebhookIds = matchingWebhooks.map((webhook) =>
			String(webhook.id),
		);
		const recordedWebhooks =
			await repositories.repositoryWebhook.listMatchingWebhookSecretPreviews(
				repository.id,
				repository.providerId,
				matchingWebhookIds,
			);
		const recordedWebhookSecretPreviewById = new Map(
			recordedWebhooks.map((recordedWebhook) => [
				recordedWebhook.providerWebhookId,
				recordedWebhook.secretPreview,
			]),
		);
		const compatibleWebhook = matchingWebhooks.find(
			(webhook) =>
				Boolean(webhook.active) &&
				requiredEvents.every((event) => webhook.events.includes(event)) &&
				recordedWebhookSecretPreviewById.get(String(webhook.id)) ===
					configuredSecretPreview,
		);
		let createdWebhook = false;
		let activeWebhook = compatibleWebhook ?? null;
		const deleteWebhook = async (
			webhook: (typeof matchingWebhooks)[number],
		) => {
			await adapter.deleteWebhook({
				repositoryPath: repository.repositoryPath,
				webhookId: webhook.id,
			});
		};
		const createWebhook = async () => {
			try {
				const webhook = await adapter.createWebhook({
					repositoryPath: repository.repositoryPath,
					url: deliveryUrl,
					events: requiredEvents,
					secret: target.secret ?? undefined,
					signingSecret: target.signingSecret ?? undefined,
					active: true,
				});
				createdWebhook = true;
				return webhook;
			} catch (error) {
				if (
					target.providerType === "github" &&
					isGitHubDuplicateWebhookError(error)
				) {
					// GitHub can surface "hook already exists" when a stale duplicate
					// webhook is still present or another sync created the hook between
					// our list and create calls. Re-list and adopt the existing hook so
					// sync stays idempotent instead of failing the whole job.
					const recovered = await findWebhookAfterDuplicate({
						listWebhooks: () =>
							adapter.listWebhooks({
								repositoryPath: repository.repositoryPath,
							}),
						isMatch: (webhook) =>
							normalizeWebhookUrl(webhook.url) === deliveryUrl &&
							Boolean(webhook.active) &&
							requiredEvents.every((event) => webhook.events.includes(event)),
					});
					if (recovered) {
						const refreshedMatchingWebhooks = recovered.webhooks.filter(
							(webhook) => normalizeWebhookUrl(webhook.url) === deliveryUrl,
						);
						for (const webhook of refreshedMatchingWebhooks) {
							if (webhook.id !== recovered.webhook.id) {
								await deleteWebhook(webhook);
							}
						}
						createdWebhook = false;
						return recovered.webhook;
					}
				}
				throw error;
			}
		};
		if (activeWebhook) {
			for (const webhook of matchingWebhooks) {
				if (webhook.id !== activeWebhook.id) {
					await deleteWebhook(webhook);
				}
			}
		} else {
			for (const webhook of matchingWebhooks) {
				await deleteWebhook(webhook);
			}
			activeWebhook = await createWebhook();
		}
		const now = new Date();
		await repositories.repositoryWebhook.deleteByRepositoryAndProvider(
			repository.id,
			repository.providerId,
		);
		await repositories.repositoryWebhook.upsert({
			id: `repository_webhook_${randomUUID()}`,
			repositoryId: repository.id,
			providerId: repository.providerId,
			providerWebhookId: String(activeWebhook.id),
			deliveryUrl,
			events: requiredEvents,
			enabled: activeWebhook.active,
			secretPreview: configuredSecretPreview,
			verifiedAt: null,
			lastDeliveredAt: null,
			createdAt: now,
			updatedAt: now,
		});
		return {
			status: createdWebhook ? ("created" as const) : ("existing" as const),
			error: null,
			severity: null,
		};
	} catch (error) {
		if (isGitHubRepositoryWebhookAccessError(error)) {
			return {
				status: "skipped" as const,
				error: buildGitHubRepositoryWebhookAccessMessage(repository.fullName),
				severity: "warning" as const,
			};
		}
		throw error;
	}
}
export async function syncRepositoryWebhooksForUser({
	userId,
	organizationId,
	repositoryId,
}: {
	userId: string;
	organizationId?: string | null;
	repositoryId?: string;
}) {
	const syncRepositories =
		await repositories.repository.listWebhookSyncRepositories({
			userId,
			organizationId,
			repositoryId,
		});
	const accounts = await repositories.account.listByUserId(userId);
	const enterpriseProviders = await getEnterpriseProviderMap();
	const accountMap = new Map(
		accounts.map((account) => [account.providerId, account]),
	);
	const result: RepositoryWebhookSyncResult = {
		created: 0,
		existing: 0,
		skipped: 0,
		failed: 0,
		warnings: [],
		errors: [],
	};
	for (const { repository } of syncRepositories) {
		const account = accountMap.get(repository.providerId);
		if (!account) {
			result.skipped += 1;
			result.errors.push(
				`${repository.fullName}: no connected provider account is available for webhook setup.`,
			);
			continue;
		}
		const target = await resolveWebhookTarget(
			repository.providerId,
			enterpriseProviders,
		);
		if (!target) {
			result.skipped += 1;
			continue;
		}
		// App-installation-only: webhook setup authenticates as the GitHub App
		// installation. We never fall back to the OAuth login token of the user.
		// GitLab and enterprise providers cannot authenticate as a GitHub App, so
		// their webhook setup is disabled rather than borrowing user credentials.
		const adapter =
			repository.providerId === "github"
				? await createAppAdapterForRepository({
						repository,
						webhookSecrets: target.secret ? [target.secret] : [],
					}).catch((error) => {
						log.debug(
							{
								err: error,
								repositoryId: repository.id,
								providerId: repository.providerId,
							},
							"GitHub App installation adapter could not be created for webhook sync.",
						);
						return null;
					})
				: null;
		if (!adapter) {
			result.skipped += 1;
			result.errors.push(
				`${repository.fullName}: webhook setup requires GitHub App installation access (GitLab and enterprise providers are not supported).`,
			);
			continue;
		}
		try {
			const syncResult = await ensureRepositoryWebhookSubscription({
				repository,
				adapter,
				target,
			});
			if (syncResult.status === "created") {
				result.created += 1;
			} else if (syncResult.status === "existing") {
				result.existing += 1;
			} else {
				result.skipped += 1;
				if (syncResult.error) {
					if (syncResult.severity === "warning") {
						result.warnings.push(syncResult.error);
					} else {
						result.errors.push(syncResult.error);
					}
				}
			}
		} catch (error) {
			result.failed += 1;
			result.errors.push(
				error instanceof Error
					? `${repository.fullName}: ${error.message}`
					: `${repository.fullName}: webhook setup failed.`,
			);
		}
	}
	return result;
}


