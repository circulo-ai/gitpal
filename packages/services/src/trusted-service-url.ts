import { normalizeConnectorServerUrl } from "@gitpal/mcp";

export function normalizeTrustedServiceUrl(
	value: string | null | undefined,
	{
		exactHosts = [],
		hostSuffixes = [],
	}: {
		exactHosts?: readonly string[];
		hostSuffixes?: readonly string[];
	},
) {
	const normalized = normalizeConnectorServerUrl(value);
	if (!normalized) return null;

	const parsed = new URL(normalized);
	const hostname = parsed.hostname.toLowerCase();
	const trusted =
		exactHosts.some((host) => hostname === host.toLowerCase()) ||
		hostSuffixes.some((suffix) => {
			const normalizedSuffix = suffix.toLowerCase().replace(/^\./, "");
			return (
				hostname === normalizedSuffix ||
				hostname.endsWith(`.${normalizedSuffix}`)
			);
		});
	if (!trusted) {
		throw new Error("Service URL host is not allowed for this provider.");
	}
	if (parsed.port && parsed.port !== "443") {
		throw new Error("Service URLs must use the default HTTPS port.");
	}

	return normalized;
}
