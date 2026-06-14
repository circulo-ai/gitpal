export function joinNonEmptyParts(params: {
	parts: Array<string | number | null | undefined>;
	separator?: string;
	trim?: boolean;
}): string {
	const separator = params.separator ?? ":";
	const trim = params.trim ?? true;

	return params.parts
		.filter(
			(part): part is string | number => part !== null && part !== undefined,
		)
		.map((part) => (trim ? String(part).trim() : String(part)))
		.filter((part) => part.length > 0)
		.join(separator);
}
