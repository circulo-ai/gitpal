import { GitProviderRequestError } from "./errors";

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function sleep(ms: number) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function parseRetryAfter(value: string | null) {
	if (!value) {
		return null;
	}

	const seconds = Number(value);
	if (Number.isFinite(seconds)) {
		return Math.max(0, seconds * 1000);
	}

	const asDate = Date.parse(value);
	if (Number.isFinite(asDate)) {
		return Math.max(0, asDate - Date.now());
	}

	return null;
}

export async function requestJson<T>(
	url: string,
	init: RequestInit,
	providerId: string,
): Promise<T> {
	const method = (init.method ?? "GET").toUpperCase();
	const shouldRetry = RETRYABLE_METHODS.has(method);
	const maxAttempts = shouldRetry ? 3 : 1;

	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		try {
			const response = await fetch(url, {
				...init,
				headers: {
					Accept: "application/json",
					...(init.headers ?? {}),
				},
			});

			if (!response.ok) {
				if (
					shouldRetry &&
					attempt < maxAttempts - 1 &&
					RETRYABLE_STATUSES.has(response.status)
				) {
					const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
					const backoffMs = retryAfter ?? Math.min(250 * 2 ** attempt, 2_000);
					await sleep(backoffMs);
					continue;
				}

				const body = await response.text();
				throw new GitProviderRequestError(
					`Request to ${url} failed with ${response.status} ${response.statusText}.`,
					response.status,
					providerId,
					body || undefined,
				);
			}

			const body = await response.text();

			if (!body) {
				return undefined as T;
			}

			return JSON.parse(body) as T;
		} catch (error) {
			if (attempt < maxAttempts - 1 && shouldRetry && !(error instanceof GitProviderRequestError)) {
				await sleep(Math.min(250 * 2 ** attempt, 2_000));
				continue;
			}

			throw error;
		}
	}

	throw new GitProviderRequestError(
		`Request to ${url} failed after ${maxAttempts} attempts.`,
		503,
		providerId,
	);
}
