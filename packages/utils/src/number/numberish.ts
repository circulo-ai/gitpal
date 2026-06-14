export type Numberish = string | number | bigint | null | undefined;

export interface ParseNumberishOptions {
	fallback?: number | null;
	throwOnError?: boolean;
	allowEmptyString?: boolean;
}

export function parseNumberish(
	value: unknown,
	options: ParseNumberishOptions = {},
): number | null {
	const {
		fallback = null,
		throwOnError = false,
		allowEmptyString = false,
	} = options;

	if (value === null || value === undefined) {
		if (throwOnError) throw new Error("Value is null/undefined");
		return fallback;
	}

	if (value === "" && !allowEmptyString) {
		if (throwOnError) throw new Error("Empty string not allowed");
		return fallback;
	}

	const num = typeof value === "bigint" ? Number(value) : Number(value);
	if (Number.isFinite(num)) return num;

	if (throwOnError) {
		throw new Error(`Cannot parse "${String(value)}" as finite number`);
	}
	return fallback;
}

export function isNumberish(value: unknown): value is number | string | bigint {
	if (typeof value === "number") return Number.isFinite(value);
	if (typeof value === "string") return /^-?\d+(?:\.\d+)?$/.test(value.trim());
	if (typeof value === "bigint") return true;
	return false;
}
