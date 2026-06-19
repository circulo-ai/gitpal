import { z } from "zod";

export const blockedConnectorHeaderNames = new Set([
	"connection",
	"content-length",
	"cookie",
	"host",
	"proxy-authorization",
	"set-cookie",
	"transfer-encoding",
]);

const headersSchema = z.record(z.string().min(1), z.string().max(2048));

export function normalizeConnectorServerUrl(value: string | null | undefined) {
	const trimmed = value?.trim();
	if (!trimmed) {
		return null;
	}

	const parsed = new URL(trimmed);
	if (parsed.protocol !== "https:") {
		throw new Error("Connector URLs must use HTTPS.");
	}
	parsed.hash = "";
	return parsed.toString().replace(/\/+$/, "");
}

export function parseConnectorHeaders(value: string | null | undefined) {
	const trimmed = value?.trim();
	if (!trimmed) {
		return {};
	}

	if (trimmed.length > 8 * 1024) {
		throw new Error("Additional headers must be 8KB or smaller.");
	}

	const parsed = headersSchema.parse(JSON.parse(trimmed));
	const safeHeaders: Record<string, string> = {};

	for (const [name, headerValue] of Object.entries(parsed)) {
		const normalizedName = name.trim().toLowerCase();
		if (!normalizedName || blockedConnectorHeaderNames.has(normalizedName)) {
			continue;
		}
		safeHeaders[name.trim()] = headerValue;
	}

	return safeHeaders;
}

export function redactSecret(value: string | null | undefined) {
	if (!value) {
		return null;
	}

	if (value.length <= 8) {
		return "****";
	}

	return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

export function redactHeaders(headers: Record<string, string>) {
	const redacted: Record<string, string> = {};

	for (const [key, value] of Object.entries(headers)) {
		redacted[key] = redactSecret(value) ?? "";
	}

	return redacted;
}
