import { randomUUID } from "node:crypto";
import { joinNonEmptyParts } from "@gitpal/utils";
import type { Redis } from "ioredis";

export function redisKey(...parts: Array<string | number | null | undefined>) {
	return joinNonEmptyParts({ parts, separator: ":" });
}

export async function setJson(
	redis: Redis,
	key: string,
	value: unknown,
	options?: { ttlSeconds?: number },
) {
	const payload = JSON.stringify(value);
	if (options?.ttlSeconds && options.ttlSeconds > 0) {
		await redis.set(key, payload, "EX", options.ttlSeconds);
		return;
	}
	await redis.set(key, payload);
}

export async function getJson<T>(redis: Redis, key: string): Promise<T | null> {
	const value = await redis.get(key);
	if (!value) return null;
	try {
		return JSON.parse(value) as T;
	} catch {
		return null;
	}
}

export async function delByPattern(redis: Redis, pattern: string) {
	const keys = await redis.keys(pattern);
	if (keys.length === 0) return 0;
	return redis.del(...keys);
}

export async function withRedisLock<T>(params: {
	redis: Redis;
	key: string;
	ttlMs: number;
	work: () => Promise<T>;
}) {
	const token = randomUUID();
	const acquired = await params.redis.set(
		params.key,
		token,
		"PX",
		params.ttlMs,
		"NX",
	);
	if (acquired !== "OK") return null;

	try {
		return await params.work();
	} finally {
		const current = await params.redis.get(params.key);
		if (current === token) {
			await params.redis.del(params.key);
		}
	}
}
