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
	createRepositoryWebhookSyncFunction,
	type RepositoryWebhookSyncProcessor,
} from "./repository-webhook-sync";

export type JobsDependencies = {
	processProviderWebhookReceiptJob: ProviderWebhookReceiptProcessor;
	processRepositoryWebhookSyncJob: RepositoryWebhookSyncProcessor;
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
		createPullRequestSyncFunction({
			dispatchPullRequestReconcile: dependencies.dispatchPullRequestReconcile,
			reconcilePullRequestsForRepository:
				dependencies.reconcilePullRequestsForRepository,
		}),
	];
}
