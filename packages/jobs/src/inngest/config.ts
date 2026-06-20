export function readIntegerConfig(value: unknown, name: string, minimum = 1) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < minimum) {
		throw new Error(
			`${name} must be an integer greater than or equal to ${minimum}.`,
		);
	}
	return parsed;
}

export function secondsConfig(value: unknown, name: string) {
	return `${readIntegerConfig(value, name)}s` as `${number}s`;
}
