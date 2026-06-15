import { GitProviderRequestError } from "./errors";

export async function requestJson<T>(
	url: string,
	init: RequestInit,
	providerId: string,
): Promise<T> {
	const response = await fetch(url, {
		...init,
		headers: {
			Accept: "application/json",
			...(init.headers ?? {}),
		},
	});

	const body = await response.text();

	if (!response.ok) {
		throw new GitProviderRequestError(
			`Request to ${url} failed with ${response.status} ${response.statusText}.`,
			response.status,
			providerId,
			body || undefined,
		);
	}

	if (!body) {
		return undefined as T;
	}

	return JSON.parse(body) as T;
}
