import { env } from "@gitpal/env/server";
import pino, { type Logger, type LoggerOptions } from "pino";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type LogData =
  | Record<string, unknown>
  | unknown[]
  | string
  | number
  | boolean
  | null
  | undefined;

export type LogContext = Record<string, unknown>;

type LogMethod = {
  /** pino-native:  log.info({ key: val }, "message")  */
  (data: LogData, msg: string): void;
  /** message-first: log.info("message", data?)         */
  (msg: string, data?: LogData): void;
};

export interface ScopedLogger {
  trace: LogMethod;
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
  fatal: LogMethod;
  child(bindings: LogContext): ScopedLogger;
  readonly pino: Logger;
}

// ─────────────────────────────────────────────────────────────────
// Normalization
// ─────────────────────────────────────────────────────────────────

const NODE_ENV = env.NODE_ENV;
const LOG_LEVEL = env.LOG_LEVEL;
const IS_DEV = NODE_ENV !== "production";

const IS_NEXT =
  typeof (globalThis as Record<string, unknown>).__NEXT_DATA__ !==
    "undefined" ||
  typeof (globalThis as Record<string, unknown>).__webpack_require__ !==
    "undefined";

function normalizeData(data: LogData): Record<string, unknown> | null {
  if (data === null || data === undefined) return null;

  if (data instanceof Error) {
    return {
      err: { message: data.message, name: data.name, stack: data.stack },
    };
  }

  if (Array.isArray(data)) return { value: data };

  if (typeof data === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
      out[key] =
        val instanceof Error
          ? { message: val.message, name: val.name, stack: val.stack }
          : val;
    }
    return out;
  }

  // string | number | boolean
  return { value: data };
}

/**
 * Resolve both calling conventions into { ctx, msg }:
 *
 *   log.info({ jobId }, "Processing job")   → pino-native  (obj first)
 *   log.info("Processing job", { jobId })   → message first
 *   log.info("Processing job")              → message only
 *   log.info("Processing job", 42)          → message + primitive
 */
function resolveArgs(
  first: unknown,
  second: unknown,
): { ctx: Record<string, unknown> | null; msg: string } {
  if (typeof first === "string") {
    // message-first: log.info("msg", data?)
    return { msg: first, ctx: normalizeData(second as LogData) };
  }
  // pino-native: log.info(obj, "msg")
  return { msg: String(second ?? ""), ctx: normalizeData(first as LogData) };
}

// ─────────────────────────────────────────────────────────────────
// Wrapper
// ─────────────────────────────────────────────────────────────────

function wrapPino(pinoLogger: Logger): ScopedLogger {
  const levels = ["trace", "debug", "info", "warn", "error", "fatal"] as const;

  const wrapped: ScopedLogger = {
    pino: pinoLogger,
    child(bindings: LogContext): ScopedLogger {
      return wrapPino(pinoLogger.child(bindings));
    },
    trace: undefined!,
    debug: undefined!,
    info: undefined!,
    warn: undefined!,
    error: undefined!,
    fatal: undefined!,
  };

  for (const level of levels) {
    wrapped[level] = (first: unknown, second?: unknown) => {
      const { ctx, msg } = resolveArgs(first, second);
      if (ctx && Object.keys(ctx).length > 0) {
        pinoLogger[level](ctx, msg);
      } else {
        pinoLogger[level](msg);
      }
    };
  }

  return wrapped;
}

// ─────────────────────────────────────────────────────────────────
// Pino configuration
// ─────────────────────────────────────────────────────────────────

const baseOptions: LoggerOptions = {
  level: LOG_LEVEL ?? "info",
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: { err: pino.stdSerializers.err },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  ...(IS_DEV && !IS_NEXT
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname",
            messageFormat: "{msg}",
          },
        },
      }
    : {}),
};

// ─────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────

export const logger: ScopedLogger = wrapPino(pino(baseOptions));

/**
 * Create a module-scoped logger. Supports all three calling styles:
 *
 * @example
 * const log = createLogger("jobs");
 *
 * // pino-native (obj, msg) — your existing call sites keep working
 * log.info({ jobId, organizationId, attempt }, "Processing repository webhook sync.");
 *
 * // message-first with named context
 * log.info("Processing repository webhook sync.", { jobId, organizationId, attempt });
 *
 * // message only
 * log.info("Done.");
 *
 * // message + primitive / array / Error
 * log.info("PR number", 42);
 * log.info("Labels", ["bug", "feat"]);
 * log.error("Job failed", new Error("timeout"));
 */
export function createLogger(
  module: string,
  bindings?: LogContext,
): ScopedLogger {
  return logger.child({ module, ...bindings });
}

/**
 * Create a request-scoped logger bound to a request ID.
 *
 * @example
 * const log = createRequestLogger(requestId, "api");
 * log.info({ path: "/users", method: "GET" }, "Handling request");
 */
export function createRequestLogger(
  requestId: string,
  module?: string,
): ScopedLogger {
  return logger.child({ requestId, ...(module ? { module } : {}) });
}

export type { Logger as PinoLogger, LoggerOptions } from "pino";
