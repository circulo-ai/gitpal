import { randomUUID } from "node:crypto";
import { env } from "@gitpal/env/server";
import type { GitWebhookEnvelope } from "@gitpal/git";
import { enqueueProviderWebhookReceiptJob } from "@gitpal/jobs/inngest/functions/provider-webhooks";
import { createLogger } from "@gitpal/logger";
import { repositories } from "@gitpal/repositories";
import {
	asRecord,
	createWebhookVerifier,
	resolveWebhookTarget,
	type WebhookReceiptStatus,
} from "./repository-webhooks-shared";
import { sanitizeRunDetails } from "./safe-diagnostics";
import { getUnverifiedWebhookDecision } from "./webhook-reconciliation";

const log = createLogger("repository-webhook-ingress");

export type WebhookReceiptResult = {
	receiptId: string;
	duplicate: boolean;
};

type WebhookEventReceiptRow = NonNullable<
	Awaited<ReturnType<typeof repositories.webhookEventReceipt.findById>>
>;

export async function findRepositoriesForWebhook({
	providerId,
	repositoryPath,
}: {
	providerId: string;
	repositoryPath: string;
}) {
	return repositories.repository.listByProviderAndPath(
		providerId,
		repositoryPath,
	);
}

export async function updateRepositoryWebhookHeartbeat(
	repositoryIds: string[],
) {
	await repositories.repositoryWebhook.updateHeartbeat(repositoryIds);
}

export async function createWebhookReceipt({
	providerId,
	deliveryId,
	repositoryId,
	repositoryPath,
	event,
	action,
	payload,
}: {
	providerId: string;
	deliveryId: string | null;
	repositoryId: string | null;
	repositoryPath: string | null;
	event: string;
	action: string | null;
	payload: Record<string, unknown>;
}): Promise<WebhookReceiptResult> {
	const now = new Date();
	return repositories.webhookEventReceipt.createReceipt({
		id: `webhook_receipt_${randomUUID()}`,
		repositoryId,
		providerId,
		deliveryId: deliveryId ?? `no-delivery-id:${randomUUID()}`,
		repositoryPath,
		event,
		action,
		status: "received",
		payload,
		receivedAt: now,
		updatedAt: now,
	});
}

export async function updateWebhookReceipt({
	receiptId,
	status,
}: {
	receiptId: string;
	status: WebhookReceiptStatus;
}) {
	await repositories.webhookEventReceipt.updateStatus(receiptId, status);
}

export async function processProviderWebhookFailure({
	receiptId,
	errorMessage,
}: {
	receiptId: string;
	errorMessage: string;
}) {
	log.error(
		{ receiptId, error: sanitizeRunDetails({ message: errorMessage }) },
		"Provider webhook processing exhausted its retries.",
	);
	await updateWebhookReceipt({ receiptId, status: "failed" });
}

export async function getWebhookReceipt(receiptId: string) {
	return repositories.webhookEventReceipt.findById(receiptId);
}

export async function getRepositoryById(repositoryId: string) {
	return repositories.repository.findById(repositoryId);
}

export function createWebhookEnvelopeFromReceipt(
	receipt: WebhookEventReceiptRow,
): GitWebhookEnvelope<Record<string, unknown>> {
	const payload = receipt.payload ?? {};
	const deliveryId = receipt.deliveryId.startsWith("no-delivery-id:")
		? null
		: receipt.deliveryId;
	return {
		providerId: receipt.providerId,
		event: receipt.event,
		action: receipt.action,
		deliveryId,
		repository: null,
		sender: null,
		payload,
		headers: {},
		rawBody: JSON.stringify(payload),
	};
}

export async function receiveProviderWebhook({
	providerId,
	headers,
	rawBody,
}: {
	providerId: string;
	headers: Headers | Record<string, string | null | undefined>;
	rawBody: string;
}) {
	const target = await resolveWebhookTarget(providerId);
	if (!target) {
		return {
			status: 404,
			body: { ok: false, error: "provider_not_found" },
		};
	}
	log.info(
		{
			label: target.label,
			id: target.providerId,
		},
		"Webhook Target",
	);
	const verifier = createWebhookVerifier(target);
	const hasSecret = Boolean(target.secret || target.signingSecret);
	try {
		const verified = await verifier.verify({ headers, rawBody });
		if (!verified) {
			const decision = getUnverifiedWebhookDecision({
				hasSecret,
				isProduction: env.NODE_ENV === "production",
			});
			if (decision === "invalid_signature") {
				log.warn(
					{
						providerId,
						verificationStrength: verifier.verificationStrength,
					},
					"Webhook signature verification failed; rejecting payload.",
				);
				return {
					status: 401,
					body: { ok: false, error: "invalid_signature" },
				};
			}
			if (decision === "secret_not_configured") {
				log.error(
					{ providerId },
					"Webhook secret is missing in production; rejecting payload.",
				);
				return {
					status: 503,
					body: { ok: false, error: "webhook_secret_not_configured" },
				};
			}
			log.warn(
				{ providerId },
				"Webhook secret is not configured; processing payload WITHOUT verification.",
			);
		}
		const envelope = verifier.parse({ headers, rawBody });
		log.info(envelope.action, "Envelope parsed");
		const repositoryPath = envelope.repository?.repositoryPath ?? null;
		const matchingRepositories = repositoryPath
			? await findRepositoriesForWebhook({ providerId, repositoryPath })
			: [];
		const receipt = await createWebhookReceipt({
			providerId,
			deliveryId: envelope.deliveryId,
			repositoryId: matchingRepositories[0]?.id ?? null,
			repositoryPath,
			event: envelope.event,
			action: envelope.action,
			payload: asRecord(envelope.payload) ?? { payload: envelope.payload },
		});
		if (receipt.duplicate) {
			return {
				status: 200,
				body: { ok: true, deduplicated: true },
			};
		}
		if (matchingRepositories.length === 0) {
			await updateWebhookReceipt({
				receiptId: receipt.receiptId,
				status: "ignored",
			});
			return {
				status: 202,
				body: { ok: true, queued: false, matchedRepositories: 0 },
			};
		}
		await updateRepositoryWebhookHeartbeat(
			matchingRepositories.map((repository) => repository.id),
		);
		try {
			await enqueueProviderWebhookReceiptJob({
				receiptId: receipt.receiptId,
				providerId,
			});
		} catch (error) {
			log.error(
				{ err: error, providerId, receiptId: receipt.receiptId },
				"Provider webhook receipt could not be queued.",
			);
			await updateWebhookReceipt({
				receiptId: receipt.receiptId,
				status: "failed",
			});
			return {
				status: 503,
				body: { ok: false, error: "webhook_queue_unavailable" },
			};
		}
		return {
			status: 202,
			body: {
				ok: true,
				queued: true,
				matchedRepositories: matchingRepositories.length,
			},
		};
	} catch (error) {
		log.warn(
			{
				err: error,
				providerId,
			},
			"Provider webhook payload could not be accepted.",
		);
		return {
			status: 400,
			body: {
				ok: false,
				error:
					error instanceof SyntaxError
						? "invalid_payload"
						: "webhook_processing_failed",
			},
		};
	}
}
