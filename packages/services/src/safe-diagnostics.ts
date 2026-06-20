const SECRET_KEY_PATTERN =
	/authorization|cookie|secret|token|password|raw|prompt/i;

export function sanitizeDiagnosticText(value: string) {
	return value
		.replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer [redacted]")
		.replace(/\b(sk|ghp|glpat)-[A-Za-z0-9_-]{8,}\b/gi, "[redacted]")
		.replace(/([?&](?:key|token|secret|password)=)[^&\s]+/gi, "$1[redacted]");
}

function sanitizeValue(value: unknown, depth = 0): unknown {
	if (depth > 4) return "[truncated]";
	if (Array.isArray(value)) {
		return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1));
	}
	if (!value || typeof value !== "object") {
		if (typeof value !== "string") return value;
		const sanitized = sanitizeDiagnosticText(value);
		return sanitized.length > 2_000
			? `${sanitized.slice(0, 2_000)}...`
			: sanitized;
	}
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.filter(([key]) => !SECRET_KEY_PATTERN.test(key))
			.map(([key, item]) => [key, sanitizeValue(item, depth + 1)]),
	);
}

export function sanitizeRunDetails(details?: Record<string, unknown> | null) {
	return (sanitizeValue(details ?? {}) ?? {}) as Record<string, unknown>;
}
