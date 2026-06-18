import { pullRequestSyncFunction } from "./pr-sync";
import { processProviderWebhook } from "./provider-webhooks";
import { repositoryWebhookSyncFunction } from "./repository-webhook-sync";

export const functions = [
  processProviderWebhook,
  repositoryWebhookSyncFunction,
  pullRequestSyncFunction,
];
