type ErrorRecord = Record<string, unknown>;

function asRecord(value: unknown): ErrorRecord | null {
	return value && typeof value === "object" ? (value as ErrorRecord) : null;
}

function getErrorStatus(error: unknown) {
	const record = asRecord(error);
	const response = asRecord(record?.response);
	const status = record?.status ?? response?.status;
	return typeof status === "number" ? status : null;
}

function getErrorMessages(error: unknown) {
	const messages: string[] = [];
	if (typeof error === "string") {
		messages.push(error);
	}
	if (error instanceof Error) {
		messages.push(error.message);
	}

	const record = asRecord(error);
	const response = asRecord(record?.response);
	const data = asRecord(response?.data);
	for (const candidate of [record?.message, data?.message]) {
		if (typeof candidate === "string") {
			messages.push(candidate);
		}
	}
	if (Array.isArray(data?.errors)) {
		for (const item of data.errors) {
			const message = asRecord(item)?.message;
			if (typeof message === "string") {
				messages.push(message);
			}
		}
	}

	return messages;
}

export function isGitHubDuplicateWebhookError(error: unknown) {
	const status = getErrorStatus(error);
	return (
		(status === null || status === 422) &&
		getErrorMessages(error).some((message) =>
			/hook already exists on this repository/i.test(message),
		)
	);
}

export function getUnverifiedWebhookDecision({
	hasSecret,
	isProduction,
}: {
	hasSecret: boolean;
	isProduction: boolean;
}) {
	if (hasSecret) return "invalid_signature" as const;
	if (isProduction) return "secret_not_configured" as const;
	return "allow_development" as const;
}

export async function findWebhookAfterDuplicate<T>({
	listWebhooks,
	isMatch,
	attempts = 3,
	baseDelayMs = 100,
	sleep = (delayMs) =>
		new Promise<void>((resolve) => {
			setTimeout(resolve, delayMs);
		}),
}: {
	listWebhooks: () => Promise<T[]>;
	isMatch: (webhook: T) => boolean;
	attempts?: number;
	baseDelayMs?: number;
	sleep?: (delayMs: number) => Promise<void>;
}) {
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		const webhooks = await listWebhooks();
		const webhook = webhooks.find(isMatch);
		if (webhook) {
			return { webhook, webhooks };
		}
		if (attempt < attempts) {
			await sleep(baseDelayMs * 2 ** (attempt - 1));
		}
	}

	return null;
}
