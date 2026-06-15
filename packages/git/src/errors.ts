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

export class GitProviderWebhookError extends GitProviderError {
	constructor(message: string, providerId?: string) {
		super(message, providerId);
		this.name = "GitProviderWebhookError";
	}
}
