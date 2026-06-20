export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	concurrency: number,
	mapper: (item: T, index: number) => Promise<R>,
) {
	if (items.length === 0) {
		return [] as R[];
	}
	if (!Number.isInteger(concurrency) || concurrency < 1) {
		throw new Error("Concurrency must be a positive integer.");
	}

	const results = new Array<R>(items.length);
	let cursor = 0;
	const workerCount = Math.min(concurrency, items.length);

	await Promise.all(
		Array.from({ length: workerCount }, async () => {
			while (cursor < items.length) {
				const currentIndex = cursor;
				cursor += 1;
				results[currentIndex] = await mapper(
					items[currentIndex] as T,
					currentIndex,
				);
			}
		}),
	);

	return results;
}
