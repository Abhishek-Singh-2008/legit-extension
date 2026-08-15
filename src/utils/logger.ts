// ─── Logger ───────────────────────────────────────────────────────────────────
// Central logging utility. Reads LOG_LEVEL from build-time env or defaults to
// "info" in production. Never logs auth tokens or secrets.

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Vite replaces this at build time. Fallback to "info" for safety.
const ENV_LEVEL = (
  typeof import.meta !== "undefined" &&
  // @ts-ignore — Vite define
  typeof import.meta.env !== "undefined"
    ? // @ts-ignore
      (import.meta.env.VITE_LOG_LEVEL as string | undefined)
    : undefined
) ?? "info";

const ACTIVE_LEVEL: LogLevel = (ENV_LEVEL as LogLevel) ?? "info";

const PREFIX = "[LCSync]";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[ACTIVE_LEVEL];
}

function sanitize(args: unknown[]): unknown[] {
  // Replace anything that looks like a token/secret in string args
  return args.map((arg) => {
    if (typeof arg === "string") {
      return arg
        .replace(/ghp_[A-Za-z0-9]{36}/g, "ghp_***REDACTED***")
        .replace(/gho_[A-Za-z0-9]{36}/g, "gho_***REDACTED***")
        .replace(/Bearer [A-Za-z0-9._-]{10,}/g, "Bearer ***REDACTED***");
    }
    return arg;
  });
}

export const logger = {
  debug(...args: unknown[]): void {
    if (shouldLog("debug")) {
      console.debug(PREFIX, ...sanitize(args));
    }
  },

  info(...args: unknown[]): void {
    if (shouldLog("info")) {
      console.info(PREFIX, ...sanitize(args));
    }
  },

  warn(...args: unknown[]): void {
    if (shouldLog("warn")) {
      console.warn(PREFIX, ...sanitize(args));
    }
  },

  error(...args: unknown[]): void {
    if (shouldLog("error")) {
      console.error(PREFIX, ...sanitize(args));
    }
  },
};
