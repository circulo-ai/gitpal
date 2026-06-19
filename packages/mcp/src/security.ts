import { z } from "zod";

export const blockedConnectorHeaderNames = new Set([
	"__proto__",
	"connection",
	"constructor",
	"content-length",
	"cookie",
	"host",
	"prototype",
	"proxy-authorization",
	"set-cookie",
	"transfer-encoding",
]);

const headersSchema = z.record(z.string().min(1), z.string().max(2048));

const blockedConnectorHostnames = new Set([
	"0.0.0.0",
	"localhost",
	"localhost.localdomain",
]);

function parseIpv4(value: string) {
	const parts = value.split(".");
	if (parts.length !== 4) {
		return null;
	}

	const octets = parts.map((part) => {
		if (!/^\d{1,3}$/.test(part)) {
			return null;
		}

		const number = Number(part);
		return number >= 0 && number <= 255 ? number : null;
	});

	return octets.some((octet) => octet === null)
		? null
		: (octets as [number, number, number, number]);
}

function isPrivateIpv4(hostname: string) {
	const octets = parseIpv4(hostname);
	if (!octets) {
		return false;
	}

	const [first, second] = octets;

	return (
		first === 10 ||
		first === 127 ||
		(first === 169 && second === 254) ||
		(first === 172 && second >= 16 && second <= 31) ||
		(first === 192 && second === 168)
	);
}

function isPrivateIpv6(hostname: string) {
	const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
	if (!normalized.includes(":")) {
		return false;
	}

	return (
		normalized === "::1" ||
		normalized.startsWith("fc") ||
		normalized.startsWith("fd") ||
		normalized.startsWith("fe80:") ||
		normalized.startsWith("::ffff:127.") ||
		normalized.startsWith("::ffff:10.") ||
		normalized.startsWith("::ffff:192.168.")
	);
}

function assertConnectorServerUrlSafe(parsed: URL) {
	if (parsed.username || parsed.password) {
		throw new Error("Connector URLs must not include credentials.");
	}

	const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
	if (
		blockedConnectorHostnames.has(hostname) ||
		hostname.endsWith(".localhost") ||
		isPrivateIpv4(hostname) ||
		isPrivateIpv6(hostname)
	) {
		throw new Error("Connector URLs must use a public HTTPS host.");
	}
}

export function normalizeConnectorServerUrl(value: string | null | undefined) {
	const trimmed = value?.trim();
	if (!trimmed) {
		return null;
	}

	const parsed = new URL(trimmed);
	if (parsed.protocol !== "https:") {
		throw new Error("Connector URLs must use HTTPS.");
	}
	assertConnectorServerUrlSafe(parsed);
	parsed.hash = "";
	return parsed.toString().replace(/\/+$/, "");
}

export function normalizeConnectorHeaders(headers: Record<string, string>) {
	const safeHeaders: Record<string, string> = {};

	for (const [name, headerValue] of Object.entries(headers)) {
		const normalizedName = name.trim().toLowerCase();
		if (!normalizedName || blockedConnectorHeaderNames.has(normalizedName)) {
			continue;
		}
		safeHeaders[name.trim()] = headerValue;
	}

	return safeHeaders;
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
	return normalizeConnectorHeaders(parsed);
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
