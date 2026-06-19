import { env } from "@gitpal/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export const dbPool = new Pool({
	connectionString: env.DATABASE_URL,
	connectionTimeoutMillis: env.GITPAL_DB_POOL_CONNECTION_TIMEOUT_MS,
	idleTimeoutMillis: env.GITPAL_DB_POOL_IDLE_TIMEOUT_MS,
	max: env.GITPAL_DB_POOL_MAX,
});

function createDbInstance() {
	return drizzle(dbPool, { schema });
}

export type Database = ReturnType<typeof createDbInstance>;

export const db: Database = createDbInstance();

export function createDb() {
	return db;
}
