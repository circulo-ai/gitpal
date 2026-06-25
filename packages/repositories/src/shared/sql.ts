import { getTableColumns, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

/**
 * Builds the `set` clause for an upsert (`onConflictDoUpdate`) that copies every
 * column from the proposed row (`excluded.*`) except the ones listed in
 * `except` — typically the primary key, the conflict-target columns, and
 * immutable audit fields such as `createdAt`.
 *
 * @example
 * .onConflictDoUpdate({
 *   target: [pullRequest.repositoryId, pullRequest.number],
 *   set: conflictUpdateAllExcept(pullRequest, ["id", "repositoryId", "number", "createdAt"]),
 * })
 */
export function conflictUpdateAllExcept<TTable extends PgTable>(
	table: TTable,
	except: ReadonlyArray<keyof TTable["$inferInsert"]> = [],
): Record<string, SQL> {
	const columns = getTableColumns(table);
	const excluded = new Set(except as ReadonlyArray<string>);
	const set: Record<string, SQL> = {};

	for (const [property, column] of Object.entries(columns)) {
		if (excluded.has(property)) {
			continue;
		}
		set[property] = sql.raw(`excluded."${column.name}"`);
	}

	return set;
}
