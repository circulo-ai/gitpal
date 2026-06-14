import { parseNumberish } from "../number/numberish";

export interface FormatNumberOptions {
	locale?: string;
	notation?: Intl.NumberFormatOptions["notation"];
	maximumFractionDigits?: number;
	minimumFractionDigits?: number;
	fallback?: string;
	forceCompact?: boolean;
	currency?: string;
	style?: "decimal" | "currency" | "percent";
}

export function formatNumber(
	value: unknown,
	options: FormatNumberOptions = {},
): string {
	const {
		locale = "en-US",
		notation,
		maximumFractionDigits,
		minimumFractionDigits = 0,
		fallback = "—",
		forceCompact = false,
		currency,
		style = "decimal",
	} = options;

	const num = parseNumberish(value);
	if (num === null) return fallback;

	let finalNotation = notation;
	if (!finalNotation && !forceCompact && Math.abs(num) >= 1_000_000) {
		finalNotation = "compact";
	} else if (forceCompact) {
		finalNotation = "compact";
	} else if (!finalNotation) {
		finalNotation = "standard";
	}

	let maxFrac = maximumFractionDigits;
	if (maxFrac === undefined) {
		maxFrac = finalNotation === "compact" ? 2 : 3;
	}

	const formatter = new Intl.NumberFormat(locale, {
		style,
		currency,
		notation: finalNotation,
		minimumFractionDigits,
		maximumFractionDigits: maxFrac,
	});
	return formatter.format(num);
}

export interface FormatTokenAmountOptions {
	locale?: string;
	maximumFractionDigits?: number;
	fallback?: string;
	compact?: boolean;
}

export function formatTokenAmount(
	value: unknown,
	options: FormatTokenAmountOptions = {},
): string {
	const {
		locale = "en-US",
		maximumFractionDigits = 9,
		fallback = "—",
		compact = false,
	} = options;

	return formatNumber(value, {
		locale,
		maximumFractionDigits,
		fallback,
		notation: compact ? undefined : "standard",
	});
}

export interface FormatPercentOptions {
	decimalPlaces?: number;
	fallback?: string;
	spaceBeforePercent?: boolean;
	locale?: string;
}

export function formatPercent(
	numerator: unknown,
	denominator: unknown,
	options: FormatPercentOptions = {},
): string {
	const {
		decimalPlaces = 2,
		fallback = "0%",
		spaceBeforePercent = false,
		locale = "en-US",
	} = options;

	const num = parseNumberish(numerator) ?? 0;
	const den = parseNumberish(denominator) ?? 0;
	if (den <= 0) return fallback;

	const percent = (num / den) * 100;
	const formatted = percent.toLocaleString(locale, {
		minimumFractionDigits: decimalPlaces,
		maximumFractionDigits: decimalPlaces,
	});
	const percentSign = spaceBeforePercent ? " %" : "%";
	return `${formatted}${percentSign}`;
}
