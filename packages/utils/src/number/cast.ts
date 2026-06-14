export function nonNegativeInt(value: number): number {
	return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

export function toBigIntUnits(value: bigint | string | number): bigint {
	if (typeof value === "bigint") return value;
	if (typeof value === "number") return BigInt(Math.trunc(value));
	return BigInt(value);
}

export function toBigIntOrNull(
	value: bigint | string | number | null | undefined,
): bigint | null {
	if (value === null || value === undefined) return null;
	try {
		return toBigIntUnits(value);
	} catch {
		return null;
	}
}
