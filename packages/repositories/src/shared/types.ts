import type { Database } from "@gitpal/db";
import type * as schema from "@gitpal/db/schema";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";

export type Schema = typeof schema;

/**
 * A live database transaction handle, structurally identical to the value
 * passed to `db.transaction(async (tx) => ...)`.
 */
export type Transaction = PgTransaction<
	NodePgQueryResultHKT,
	Schema,
	ExtractTablesWithRelations<Schema>
>;

/**
 * Anything capable of running queries: either the root `Database` connection
 * or an open `Transaction`. Repositories depend on this abstraction so the
 * same instance can participate in a unit-of-work transaction unchanged.
 */
export type Executor = Database | Transaction;
