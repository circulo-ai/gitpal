export interface ToTimestampOptions {
	fallback?: number;
	throwOnError?: boolean;
	utc?: boolean;
}

export function toTimestamp(
	value: unknown,
	options: ToTimestampOptions = {},
): number {
	const { fallback = 0, throwOnError = false, utc = false } = options;

	try {
		let date: Date;
		if (value instanceof Date) {
			date = value;
		} else if (typeof value === "number" && Number.isFinite(value)) {
			date = new Date(value);
		} else if (typeof value === "string" && value.trim() !== "") {
			if (utc) {
				const normalized = `${value.trim().replace(/[+-]\d{2}:?\d{2}$/, "")}Z`;
				date = new Date(normalized);
			} else {
				date = new Date(value);
			}
		} else if (value === null || value === undefined) {
			return fallback;
		} else {
			date = new Date(String(value));
		}

		const ts = date.getTime();
		if (Number.isFinite(ts) && !Number.isNaN(ts)) return ts;
		if (throwOnError) throw new Error("Invalid date");
		return fallback;
	} catch (err) {
		if (throwOnError) throw err;
		return fallback;
	}
}

export function isValidDate(value: unknown): boolean {
	const ts = toTimestamp(value, { fallback: Number.NaN });
	return Number.isFinite(ts);
}
