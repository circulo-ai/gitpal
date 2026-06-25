import { db } from "@gitpal/db";

import {
	AiGenerationRepository,
	UserLlmApiKeyRepository,
	UserLlmRoutingSettingsRepository,
} from "./ai.repository";
import {
	OrganizationBudgetRepository,
	WalletLedgerEntryRepository,
	WalletRepository,
	WalletTopupRepository,
} from "./billing.repository";
import {
	IssueRepository,
	KnowledgeBaseLearningRepository,
	OrganizationSettingsRepository,
	PreMergeCheckRunRepository,
	ProviderWorkspaceMemberRepository,
	PullRequestRepository,
	ReportDeliveryRepository,
	RepositoryAccessRepository,
	RepositoryRepository,
	RepositorySettingsRepository,
	RepositoryWebhookRepository,
	ReviewCommentRepository,
	ReviewRunRepository,
	ReviewRunStepRepository,
	ToolFindingRepository,
	WebhookEventReceiptRepository,
} from "./dashboard.repository";
import {
	IntegrationConnectionRepository,
	IntegrationOAuthStateRepository,
} from "./integrations.repository";
import {
	NotificationChannelRepository,
	NotificationDeliveryRepository,
	NotificationRepository,
	ObservabilityEventRepository,
} from "./observability.repository";
import type { Executor } from "./shared/types";

export * from "./ai.repository";
export * from "./billing.repository";
export * from "./dashboard.repository";
export * from "./integrations.repository";
export * from "./observability.repository";
export * from "./shared";

/**
 * Wires every repository to a single executor. Pass a transaction handle to
 * run a whole use-case inside one transaction (unit of work):
 *
 * @example
 * await db.transaction(async (tx) => {
 *   const repos = createRepositories(tx);
 *   const wallet = await repos.wallet.findByUserId(userId);
 *   await repos.walletLedgerEntry.create({ ... });
 * });
 */
export function createRepositories(executor: Executor = db) {
	return {
		// ai
		userLlmRoutingSettings: new UserLlmRoutingSettingsRepository(executor),
		userLlmApiKey: new UserLlmApiKeyRepository(executor),
		aiGeneration: new AiGenerationRepository(executor),

		// billing
		organizationBudget: new OrganizationBudgetRepository(executor),
		wallet: new WalletRepository(executor),
		walletTopup: new WalletTopupRepository(executor),
		walletLedgerEntry: new WalletLedgerEntryRepository(executor),

		// integrations
		integrationConnection: new IntegrationConnectionRepository(executor),
		integrationOAuthState: new IntegrationOAuthStateRepository(executor),

		// observability
		observabilityEvent: new ObservabilityEventRepository(executor),
		notification: new NotificationRepository(executor),
		notificationChannel: new NotificationChannelRepository(executor),
		notificationDelivery: new NotificationDeliveryRepository(executor),

		// dashboard
		repository: new RepositoryRepository(executor),
		repositoryAccess: new RepositoryAccessRepository(executor),
		providerWorkspaceMember: new ProviderWorkspaceMemberRepository(executor),
		pullRequest: new PullRequestRepository(executor),
		issue: new IssueRepository(executor),
		reviewRun: new ReviewRunRepository(executor),
		reviewRunStep: new ReviewRunStepRepository(executor),
		reviewComment: new ReviewCommentRepository(executor),
		toolFinding: new ToolFindingRepository(executor),
		preMergeCheckRun: new PreMergeCheckRunRepository(executor),
		knowledgeBaseLearning: new KnowledgeBaseLearningRepository(executor),
		reportDelivery: new ReportDeliveryRepository(executor),
		organizationSettings: new OrganizationSettingsRepository(executor),
		repositorySettings: new RepositorySettingsRepository(executor),
		repositoryWebhook: new RepositoryWebhookRepository(executor),
		webhookEventReceipt: new WebhookEventReceiptRepository(executor),
	};
}

/** The fully-typed repository container. */
export type Repositories = ReturnType<typeof createRepositories>;

/** Ready-to-use repositories bound to the root database connection. */
export const repositories: Repositories = createRepositories(db);
