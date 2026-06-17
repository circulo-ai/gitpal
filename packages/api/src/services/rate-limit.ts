import { createDb } from "@gitpal/db";
import * as authSchema from "@gitpal/db/schema/auth";
import { eq } from "drizzle-orm";

export type AppRateLimitRule = {
  window: number;
  max: number;
};

export type AppRateLimitScope = "user" | "ip";

export type AppRateLimitKeyInput = {
  scope: AppRateLimitScope;
  subject: string;
  route: string;
};

export type AppRateLimitDecision = {
  allowed: boolean;
  retryAfter: number | null;
};

const db = createDb();

type RateLimitDatabase = Pick<typeof db, "select" | "insert" | "update">;

function getRetryAfter(lastRequest: number, window: number) {
  const windowMs = window * 1000;
  return Math.max(1, Math.ceil((lastRequest + windowMs - Date.now()) / 1000));
}

export function buildAppRateLimitKey({
  scope,
  subject,
  route,
}: AppRateLimitKeyInput) {
  return `app:${scope}:${subject}:${route}`;
}

async function readRateLimitRow(transaction: RateLimitDatabase, key: string) {
  const [row] = await transaction
    .select()
    .from(authSchema.rateLimit)
    .where(eq(authSchema.rateLimit.key, key))
    .limit(1)
    .for("update");

  return row ?? null;
}

export async function consumeAppRateLimit({
  key,
  rule,
}: {
  key: string;
  rule: AppRateLimitRule;
}): Promise<AppRateLimitDecision> {
  return db.transaction(async (transaction) => {
    const now = Date.now();
    const windowMs = rule.window * 1000;
    const existing = await readRateLimitRow(transaction, key);

    if (!existing) {
      const inserted = await transaction
        .insert(authSchema.rateLimit)
        .values({
          id: crypto.randomUUID(),
          key,
          count: 1,
          lastRequest: now,
        })
        .onConflictDoNothing()
        .returning({
          key: authSchema.rateLimit.key,
        });

      if (inserted.length > 0) {
        return {
          allowed: true,
          retryAfter: null,
        };
      }

      const rowAfterInsert = await readRateLimitRow(transaction, key);

      if (!rowAfterInsert) {
        return {
          allowed: true,
          retryAfter: null,
        };
      }

      if (now - rowAfterInsert.lastRequest > windowMs) {
        await transaction
          .update(authSchema.rateLimit)
          .set({
            count: 1,
            lastRequest: now,
          })
          .where(eq(authSchema.rateLimit.key, key));

        return {
          allowed: true,
          retryAfter: null,
        };
      }

      if (rowAfterInsert.count >= rule.max) {
        return {
          allowed: false,
          retryAfter: getRetryAfter(rowAfterInsert.lastRequest, rule.window),
        };
      }

      await transaction
        .update(authSchema.rateLimit)
        .set({
          count: rowAfterInsert.count + 1,
          lastRequest: now,
        })
        .where(eq(authSchema.rateLimit.key, key));

      return {
        allowed: true,
        retryAfter: null,
      };
    }

    if (now - existing.lastRequest > windowMs) {
      await transaction
        .update(authSchema.rateLimit)
        .set({
          count: 1,
          lastRequest: now,
        })
        .where(eq(authSchema.rateLimit.key, key));

      return {
        allowed: true,
        retryAfter: null,
      };
    }

    if (existing.count >= rule.max) {
      return {
        allowed: false,
        retryAfter: getRetryAfter(existing.lastRequest, rule.window),
      };
    }

    await transaction
      .update(authSchema.rateLimit)
      .set({
        count: existing.count + 1,
        lastRequest: now,
      })
      .where(eq(authSchema.rateLimit.key, key));

    return {
      allowed: true,
      retryAfter: null,
    };
  });
}

export function createRateLimitKeyFromRequestPath(route: string) {
  return route.replace(/^\/+/, "");
}

export function isRateLimitedRouteKey(key: string, scope: AppRateLimitScope) {
  return key.startsWith(`app:${scope}:`);
}
