export class GitProviderError extends Error {
	constructor(
		message: string,
		public readonly providerId?: string,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = "GitProviderError";
	}
}

export class GitProviderConfigurationError extends GitProviderError {
	constructor(message: string, providerId?: string) {
		super(message, providerId);
		this.name = "GitProviderConfigurationError";
	}
}

export class GitProviderRequestError extends GitProviderError {
	constructor(
		message: string,
		public readonly status: number,
		providerId?: string,
		public readonly responseBody?: string,
	) {
		super(message, providerId);
		this.name = "GitProviderRequestError";
	}
}

export class GitProviderRateLimitError extends GitProviderRequestError {
	constructor(
		message: string,
		providerId: string | undefined,
		public readonly retryAfterSeconds: number,
		responseBody?: string,
	) {
		super(message, 429, providerId, responseBody);
		this.name = "GitProviderRateLimitError";
	}
}

function headerValue(headers: unknown, name: string): string | null {
	if (headers instanceof Headers) return headers.get(name);
	if (!headers || typeof headers !== "object") return null;
	const value = (headers as Record<string, unknown>)[name.toLowerCase()];
	return typeof value === "string" ? value : null;
}

export function toGitProviderRateLimitError(
	error: unknown,
	providerId?: string,
	now = Date.now(),
): GitProviderRateLimitError | null {
	if (error instanceof GitProviderRateLimitError) return error;
	if (!error || typeof error !== "object") return null;
	const candidate = error as {
		status?: unknown;
		message?: unknown;
		response?: { headers?: unknown };
	};
	const status = Number(candidate.status);
	const headers = candidate.response?.headers;
	const remaining = headerValue(headers, "x-ratelimit-remaining");
	if (status !== 429 && !(status === 403 && remaining === "0")) return null;
	const retryAfter = Number(headerValue(headers, "retry-after"));
	const resetAt = Number(headerValue(headers, "x-ratelimit-reset"));
	const retryAfterSeconds =
		Number.isFinite(retryAfter) && retryAfter > 0
			? Math.ceil(retryAfter)
			: Number.isFinite(resetAt) && resetAt > 0
				? Math.max(1, Math.ceil(resetAt - now / 1000))
				: providerId?.includes("gitlab")
					? 30
					: 60;
	return new GitProviderRateLimitError(
		`${providerId ?? "Git provider"} rate limit reached. Retry in ${retryAfterSeconds}s.`,
		providerId,
		retryAfterSeconds,
	);
}

export class GitProviderWebhookError extends GitProviderError {
	constructor(message: string, providerId?: string) {
		super(message, providerId);
		this.name = "GitProviderWebhookError";
	}
}
