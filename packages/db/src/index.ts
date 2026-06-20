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
type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const RETRIABLE_POSTGRES_ERROR_CODES = new Set([
	"40001", // serialization_failure
	"40P01", // deadlock_detected
	"55P03", // lock_not_available
]);

export const db: Database = createDbInstance();

export function createDb() {
	return db;
}

function getPostgresErrorCode(error: unknown): string | null {
	if (
		error &&
		typeof error === "object" &&
		"code" in error &&
		typeof error.code === "string"
	) {
		return error.code;
	}

	if (error && typeof error === "object" && "cause" in error && error.cause) {
		return getPostgresErrorCode(error.cause);
	}

	return null;
}

export function isRetriableDatabaseError(error: unknown) {
	const code = getPostgresErrorCode(error);

	return code ? RETRIABLE_POSTGRES_ERROR_CODES.has(code) : false;
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runTransactionWithRetry<TResult>(
	callback: (tx: DbTransaction) => Promise<TResult>,
	{
		attempts = 3,
		baseDelayMs = 25,
	}: {
		attempts?: number;
		baseDelayMs?: number;
	} = {},
) {
	let lastError: unknown;

	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			return await db.transaction(callback);
		} catch (error) {
			lastError = error;

			if (attempt >= attempts || !isRetriableDatabaseError(error)) {
				throw error;
			}

			await sleep(baseDelayMs * 2 ** (attempt - 1));
		}
	}

	throw lastError;
}
