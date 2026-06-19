import {
	createRepositoryLabelerRunFunction,
	createRepositoryReviewRunFunction,
	type RepositoryLabelerRunProcessor,
	type RepositoryReviewRunProcessor,
} from "./ai-workflows";
import type {
	PullRequestDispatchProcessor,
	PullRequestReconcileProcessor,
} from "./pr-sync";
import { createPullRequestSyncFunction } from "./pr-sync";
import {
	createProcessProviderWebhookFunction,
	type ProviderWebhookReceiptProcessor,
} from "./provider-webhooks";
import {
	createRepositorySyncFunction,
	type RepositorySyncProcessor,
} from "./repo-sync";
import {
	createRepositoryWebhookSyncFunction,
	type RepositoryWebhookSyncProcessor,
} from "./repository-webhook-sync";

export type JobsDependencies = {
	processProviderWebhookReceiptJob: ProviderWebhookReceiptProcessor;
	processRepositoryWebhookSyncJob: RepositoryWebhookSyncProcessor;
	processRepositorySyncJob: RepositorySyncProcessor;
	processRepositoryReviewRunJob: RepositoryReviewRunProcessor;
	processRepositoryLabelerRunJob: RepositoryLabelerRunProcessor;
	dispatchPullRequestReconcile: PullRequestDispatchProcessor;
	reconcilePullRequestsForRepository: PullRequestReconcileProcessor;
};

export function createFunctions(dependencies: JobsDependencies) {
	return [
		createProcessProviderWebhookFunction(
			dependencies.processProviderWebhookReceiptJob,
		),
		createRepositoryWebhookSyncFunction(
			dependencies.processRepositoryWebhookSyncJob,
		),
		createRepositorySyncFunction(dependencies.processRepositorySyncJob),
		createRepositoryReviewRunFunction(
			dependencies.processRepositoryReviewRunJob,
		),
		createRepositoryLabelerRunFunction(
			dependencies.processRepositoryLabelerRunJob,
		),
		createPullRequestSyncFunction({
			dispatchPullRequestReconcile: dependencies.dispatchPullRequestReconcile,
			reconcilePullRequestsForRepository:
				dependencies.reconcilePullRequestsForRepository,
		}),
	];
}
