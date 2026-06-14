function toBase64Url(base64: string): string {
	return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(base64Url: string): string {
	const normalized = base64Url.replace(/-/g, "+").replace(/_/g, "/");
	const padding = normalized.length % 4;
	if (padding === 0) return normalized;
	return `${normalized}${"=".repeat(4 - padding)}`;
}

export function encodeBase64Url(value: string): string {
	return toBase64Url(Buffer.from(value, "utf8").toString("base64"));
}

export function decodeBase64Url(value: string): string {
	return Buffer.from(fromBase64Url(value), "base64").toString("utf8");
}
