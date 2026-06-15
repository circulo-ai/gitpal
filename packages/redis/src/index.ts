import { env } from "@gitpal/env/server";
import { createLogger } from "@gitpal/logger";
import Redis from "ioredis";

export type { Redis } from "ioredis";
export {
	delByPattern,
	getJson,
	redisKey,
	setJson,
	withRedisLock,
} from "./utils";

function attachRedisErrorHandler(instance: Redis) {
	const redisLogger = createLogger("redis");

	instance.on("error", (error) => {
		const message =
			error instanceof Error
				? error.message
				: typeof error === "string"
					? error
					: error != null
						? JSON.stringify(error)
						: "Unknown error";
		redisLogger.error({ message }, "Redis connection error");
	});
}

/**
 * Create a new Redis connection instance.
 * Each caller gets its own connection — use for workers, subscribers, etc.
 */
export function createRedis(options?: {
	maxRetriesPerRequest?: number | null;
}) {
	const instance = new Redis(env.REDIS_URL, {
		maxRetriesPerRequest: options?.maxRetriesPerRequest ?? null,
		enableReadyCheck: true,
		retryStrategy(times) {
			return Math.min(times * 200, 5000);
		},
	});
	attachRedisErrorHandler(instance);
	return instance;
}

/**
 * Shared singleton connection for general-purpose use (caching, pub/sub publishing).
 * Do NOT use this for BullMQ workers — they need dedicated connections.
 */
export const redis = createRedis();

/**
 * Gracefully close a Redis connection.
 */
export async function closeRedis(instance: Redis): Promise<void> {
	try {
		await instance.quit();
	} catch {
		instance.disconnect();
	}
}
