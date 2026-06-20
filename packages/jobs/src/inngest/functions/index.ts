import {
	createRepositoryLabelerRunFunction,
	createRepositoryReviewRunFunction,
	type RepositoryLabelerRunProcessor,
	type RepositoryReviewRunProcessor,
	type RepositoryRunFailureProcessor,
} from "./ai-workflows";
import {
	createDurableStateMaintenanceFunction,
	type DurableStateMaintenanceProcessor,
} from "./durable-maintenance";
import type {
	PullRequestDispatchProcessor,
	PullRequestReconcileFailureProcessor,
	PullRequestReconcileProcessor,
} from "./pr-sync";
import { createPullRequestSyncFunction } from "./pr-sync";
import {
	createProcessProviderWebhookFunction,
	type ProviderWebhookFailureProcessor,
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
	processProviderWebhookFailure: ProviderWebhookFailureProcessor;
	processRepositoryWebhookSyncJob: RepositoryWebhookSyncProcessor;
	processRepositorySyncJob: RepositorySyncProcessor;
	processRepositoryReviewRunJob: RepositoryReviewRunProcessor;
	processRepositoryLabelerRunJob: RepositoryLabelerRunProcessor;
	processRepositoryRunFailure: RepositoryRunFailureProcessor;
	expireStaleDurableState: DurableStateMaintenanceProcessor;
	dispatchPullRequestReconcile: PullRequestDispatchProcessor;
	reconcilePullRequestsForRepository: PullRequestReconcileProcessor;
	markPullRequestReconcileFailed: PullRequestReconcileFailureProcessor;
};

export function createFunctions(dependencies: JobsDependencies) {
	return [
		createProcessProviderWebhookFunction(
			dependencies.processProviderWebhookReceiptJob,
			dependencies.processProviderWebhookFailure,
		),
		createRepositoryWebhookSyncFunction(
			dependencies.processRepositoryWebhookSyncJob,
		),
		createRepositorySyncFunction(dependencies.processRepositorySyncJob),
		createRepositoryReviewRunFunction(
			dependencies.processRepositoryReviewRunJob,
			dependencies.processRepositoryRunFailure,
		),
		createRepositoryLabelerRunFunction(
			dependencies.processRepositoryLabelerRunJob,
			dependencies.processRepositoryRunFailure,
		),
		createDurableStateMaintenanceFunction(dependencies.expireStaleDurableState),
		createPullRequestSyncFunction({
			dispatchPullRequestReconcile: dependencies.dispatchPullRequestReconcile,
			reconcilePullRequestsForRepository:
				dependencies.reconcilePullRequestsForRepository,
			markPullRequestReconcileFailed:
				dependencies.markPullRequestReconcileFailed,
		}),
	];
}
