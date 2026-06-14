import { toTimestamp } from "../time/timestamp";

export type AgeUnit =
	| "second"
	| "minute"
	| "hour"
	| "day"
	| "week"
	| "month"
	| "year";

export interface FormatAgeOptions {
	fallback?: string;
	prefix?: string;
	suffix?: string;
	useJustNow?: boolean;
	maxUnit?: AgeUnit;
	locale?: string;
	labels?: Partial<Record<AgeUnit, { singular: string; plural: string }>>;
}

const defaultAgeLabels: Record<AgeUnit, { singular: string; plural: string }> =
	{
		second: { singular: "second", plural: "seconds" },
		minute: { singular: "minute", plural: "minutes" },
		hour: { singular: "hour", plural: "hours" },
		day: { singular: "day", plural: "days" },
		week: { singular: "week", plural: "weeks" },
		month: { singular: "month", plural: "months" },
		year: { singular: "year", plural: "years" },
	};

export function formatAge(
	value: unknown,
	options: FormatAgeOptions = {},
): string {
	const {
		fallback = "Updated unknown",
		prefix = "Updated ",
		suffix = "",
		useJustNow = true,
		maxUnit = "year",
		labels = {},
	} = options;

	const ts = toTimestamp(value);
	if (!ts) return fallback;

	const now = Date.now();
	const diffMs = now - ts;
	if (diffMs < 0) return fallback;

	const diffSeconds = Math.floor(diffMs / 1000);
	if (useJustNow && diffSeconds < 30) return `${prefix}just now${suffix}`;

	const units: { unit: AgeUnit; seconds: number }[] = [
		{ unit: "year", seconds: 31536000 },
		{ unit: "month", seconds: 2592000 },
		{ unit: "week", seconds: 604800 },
		{ unit: "day", seconds: 86400 },
		{ unit: "hour", seconds: 3600 },
		{ unit: "minute", seconds: 60 },
		{ unit: "second", seconds: 1 },
	];

	const maxIndex = units.findIndex((u) => u.unit === maxUnit);
	const relevantUnits = units.slice(maxIndex === -1 ? 0 : maxIndex);

	for (const { unit, seconds: secPerUnit } of relevantUnits) {
		if (diffSeconds >= secPerUnit) {
			const unitValue = Math.floor(diffSeconds / secPerUnit);
			const labelSet = { ...defaultAgeLabels[unit], ...labels[unit] };
			const unitLabel = unitValue === 1 ? labelSet.singular : labelSet.plural;
			return `${prefix}${unitValue} ${unitLabel} ago${suffix}`;
		}
	}

	return `${prefix}less than a minute ago${suffix}`;
}

export interface FormatSinceDateOptions {
	fallback?: string;
	prefix?: string;
	suffix?: string;
	dateOptions?: Intl.DateTimeFormatOptions;
	locale?: string;
}

export function formatSinceDate(
	value: unknown,
	options: FormatSinceDateOptions = {},
): string {
	const {
		fallback = "Since unknown",
		prefix = "Since ",
		suffix = "",
		dateOptions = { month: "short", year: "numeric" },
		locale = "en-US",
	} = options;

	const ts = toTimestamp(value);
	if (!ts) return fallback;

	try {
		const date = new Date(ts);
		const formattedDate = date.toLocaleDateString(locale, dateOptions);
		return `${prefix}${formattedDate}${suffix}`;
	} catch {
		return fallback;
	}
}
