export function buildValidUntil(
	validForSeconds: number,
	options?: {
		nowMs?: number;
		minSeconds?: number;
		maxSeconds?: number;
	},
): number {
	const nowMs = options?.nowMs ?? Date.now();
	const minSeconds = options?.minSeconds ?? 60;
	const maxSeconds = options?.maxSeconds ?? 3600;
	const clampedSeconds = Math.max(
		minSeconds,
		Math.min(maxSeconds, Math.trunc(validForSeconds)),
	);

	return Math.floor(nowMs / 1000) + clampedSeconds;
}
