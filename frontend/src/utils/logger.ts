/**
 * Simple logger utility for consistent logging with debug mode support
 *
 * Set DEBUG=true in .env.local to enable all logging
 * When DEBUG=false or not set, NO logs will appear in console
 */

// Read DEBUG from environment variable
// In Next.js, we need to use NEXT_PUBLIC_ prefix for client-side access
const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "true";

type LogLevel = "debug" | "info" | "warn" | "error";

function formatMessage(level: LogLevel, prefix: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `${timestamp} [${level.toUpperCase()}] [${prefix}] ${message}`;
}

export function createLogger(prefix: string) {
  return {
    debug(message: string, data?: unknown): void {
      if (DEBUG) {
        console.log(formatMessage("debug", prefix, message));
        if (data !== undefined) console.log(data);
      }
    },

    info(message: string, data?: unknown): void {
      if (DEBUG) {
        console.log(formatMessage("info", prefix, message));
        if (data !== undefined) console.log(data);
      }
    },

    warn(message: string, data?: unknown): void {
      if (DEBUG) {
        console.warn(formatMessage("warn", prefix, message));
        if (data !== undefined) console.warn(data);
      }
    },

    error(message: string, data?: unknown): void {
      if (DEBUG) {
        console.error(formatMessage("error", prefix, message));
        if (data !== undefined) console.error(data);
      }
    },
  };
}
