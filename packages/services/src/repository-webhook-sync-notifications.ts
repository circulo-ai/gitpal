export function getRepositoryWebhookSyncFailureNotificationKey({
	userId,
	organizationId,
	repositoryId,
}: {
	userId: string;
	organizationId?: string | null;
	repositoryId?: string;
}) {
	return [
		"repository-webhook-sync",
		userId,
		organizationId ?? "all",
		repositoryId ?? "all",
		"notification",
	].join(":");
}
