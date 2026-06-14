export function formatRawAmount(raw: bigint, decimals: number): string {
	if (decimals < 0) throw new Error("decimals must be non-negative");
	if (raw <= BigInt(0)) return "0";
	if (decimals === 0) return raw.toString();

	const str = raw.toString().padStart(decimals + 1, "0");
	const intPart = str.slice(0, str.length - decimals) || "0";
	const fracPart = str.slice(str.length - decimals).replace(/0+$/, "");
	return fracPart ? `${intPart}.${fracPart}` : intPart;
}

export function formatTonAmountFromNano(raw: bigint): string {
	return formatRawAmount(raw, 9);
}

export function parseRawStringToBigInt(
	value: string | null | undefined,
): bigint {
	if (!value) return BigInt(0);
	try {
		const parsed = BigInt(value);
		return parsed > BigInt(0) ? parsed : BigInt(0);
	} catch {
		return BigInt(0);
	}
}

export function normalizeEstimatedMintAmountRawForDisplay(args: {
	desiredMintAmountRaw: string | null | undefined;
	estimatedMintAmountRaw: string | null | undefined;
	maxAllowedDustRaw?: bigint;
}): bigint {
	const desired = parseRawStringToBigInt(args.desiredMintAmountRaw);
	const estimated = parseRawStringToBigInt(args.estimatedMintAmountRaw);
	const maxAllowedDustRaw = args.maxAllowedDustRaw ?? BigInt(1);

	if (estimated <= desired) return estimated;
	const delta = estimated - desired;
	if (delta <= maxAllowedDustRaw) return desired;
	return estimated;
}
