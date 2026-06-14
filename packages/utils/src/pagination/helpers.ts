export function applyCursorPagination<
	T extends { id: string; createdAt: Date },
>(
	rows: T[],
	params: { cursor?: { id: string; createdAt: Date }; limit: number },
) {
	const cursor = params.cursor;
	const filtered = cursor
		? rows.filter((item) => {
				if (item.createdAt < cursor.createdAt) return true;
				if (item.createdAt > cursor.createdAt) return false;
				return item.id < cursor.id;
			})
		: rows;

	const items = filtered.slice(0, params.limit);
	const hasMore = filtered.length > params.limit;
	const last = items[items.length - 1];
	return {
		items,
		nextCursor:
			hasMore && last
				? {
						id: last.id,
						createdAt: last.createdAt,
					}
				: null,
	};
}
