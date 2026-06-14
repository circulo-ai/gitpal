import pino, { type Logger, type LoggerOptions } from "pino";

// ─────────────────────────────────────────────────────────────────
// Log Level
// ─────────────────────────────────────────────────────────────────

type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

const LOG_LEVELS: LogLevel[] = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
];

function resolveLogLevel(value: unknown): LogLevel {
  if (typeof value !== "string") return "info";
  const normalized = value.trim().toLowerCase();
  if (LOG_LEVELS.includes(normalized as LogLevel)) {
    return normalized as LogLevel;
  }
  return "info";
}

function resolveNodeEnv(value: unknown): "development" | "production" | "test" {
  if (value === "production" || value === "test" || value === "development") {
    return value;
  }
  return "production";
}

const LOG_LEVEL = resolveLogLevel(process.env.LOG_LEVEL);
const NODE_ENV = resolveNodeEnv(process.env.NODE_ENV);
const IS_DEV = NODE_ENV !== "production";
const IS_NEXT =
  typeof (globalThis as Record<string, unknown>).__NEXT_DATA__ !==
    "undefined" ||
  typeof (globalThis as Record<string, unknown>).__webpack_require__ !==
    "undefined";

// ─────────────────────────────────────────────────────────────────
// Base Configuration
// ─────────────────────────────────────────────────────────────────

const baseOptions: LoggerOptions = {
  level: LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  // In dev, use pino-pretty for human-readable output.
  // In production, output structured JSON for log aggregators.
  ...(IS_DEV && !IS_NEXT
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
};

// ─────────────────────────────────────────────────────────────────
// Root Logger
// ─────────────────────────────────────────────────────────────────

/**
 * Root application logger.
 * Use `createLogger` for scoped child loggers with context.
 */
export const logger: Logger = pino(baseOptions);

// ─────────────────────────────────────────────────────────────────
// Child Logger Factory
// ─────────────────────────────────────────────────────────────────

/**
 * Create a scoped child logger with bound context fields.
 *
 * @example
 * ```ts
 * const log = createLogger("factory-sync", { factoryId: "abc" });
 * log.info("Starting sync");
 * // → { level: "info", module: "factory-sync", factoryId: "abc", msg: "Starting sync" }
 * ```
 */
export function createLogger(
  module: string,
  bindings?: Record<string, unknown>,
): Logger {
  return logger.child({ module, ...bindings });
}

/**
 * Create a request-scoped logger with a request ID.
 * Ideal for tRPC context or HTTP handlers.
 *
 * @example
 * ```ts
 * const log = createRequestLogger(requestId, "api");
 * log.info({ path: "/users" }, "Handling request");
 * ```
 */
export function createRequestLogger(
  requestId: string,
  module?: string,
): Logger {
  return logger.child({ requestId, ...(module ? { module } : {}) });
}

// Re-export pino types for consumers
export type { Logger, LoggerOptions } from "pino";
