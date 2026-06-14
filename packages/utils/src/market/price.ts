export type PriceTrendDirection = "up" | "down" | "neutral";

export interface FormatUsdPriceOptions {
	/** Fallback shown when value is nullish or non-finite. */
	fallback?: string;
	/** Maximum fractional digits for values >= 1. */
	maxFractionDigits?: number;
}

export function formatUsdPrice(
	value: number | null | undefined,
	options: FormatUsdPriceOptions = {},
): string {
	const { fallback = "--", maxFractionDigits = 2 } = options;
	if (value == null || !Number.isFinite(value)) return fallback;
	if (value < 0.01) return `$${value.toFixed(6)}`;
	if (value < 1) return `$${value.toFixed(4)}`;
	return `$${value.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits })}`;
}

export interface FormatSignedPercentFromDecimalOptions {
	/** Fallback shown when value is nullish or non-finite. */
	fallback?: string;
	/** Decimal places in rendered percent value. */
	decimalPlaces?: number;
	/** Whether positive values should include a leading "+" sign. */
	includePositiveSign?: boolean;
}

export function formatSignedPercentFromDecimal(
	value: number | null | undefined,
	options: FormatSignedPercentFromDecimalOptions = {},
): string {
	const {
		fallback = "--",
		decimalPlaces = 2,
		includePositiveSign = true,
	} = options;
	if (value == null || !Number.isFinite(value)) return fallback;
	const sign = includePositiveSign && value >= 0 ? "+" : "";
	return `${sign}${(value * 100).toFixed(decimalPlaces)}%`;
}

export function priceTrendFromDecimal(
	value: number | null | undefined,
): PriceTrendDirection {
	if (value == null || value === 0 || !Number.isFinite(value)) {
		return "neutral";
	}
	return value > 0 ? "up" : "down";
}
