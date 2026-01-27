/**
 * Simple logger utility for consistent logging with debug mode support
 *
 * Set DEBUG=true in environment to enable ALL logging (console + file)
 * When DEBUG=false or not set, NO logs will appear in console or files
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEBUG = process.env.DEBUG === "true";
const LOGS_DIR = path.join(__dirname, "../../logs");

// Session ID context for file logging
let currentSessionId: string | null = null;

// Ensure logs directory exists
if (DEBUG) {
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
  } catch (error) {
    console.error("Failed to create logs directory:", error);
  }
}

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogOptions {
  prefix?: string;
  data?: unknown;
  sessionId?: string;  // Optional session ID for this specific log
}

function formatMessage(level: LogLevel, message: string, options?: LogOptions): string {
  const timestamp = new Date().toISOString();
  const prefix = options?.prefix ? `[${options.prefix}] ` : "";
  const sessionPrefix = options?.sessionId ? `[${options.sessionId.slice(0, 8)}] ` : "";
  return `${timestamp} [${level.toUpperCase()}] ${sessionPrefix}${prefix}${message}`;
}

/**
 * Write log message to session-specific file
 */
function writeToFile(level: LogLevel, message: string, options?: LogOptions): void {
  if (!DEBUG) return;

  const sessionId = options?.sessionId || currentSessionId;
  if (!sessionId) return;

  try {
    const logFile = path.join(LOGS_DIR, `${sessionId}.log`);
    const formattedMessage = formatMessage(level, message, options);
    const logLine = options?.data !== undefined 
      ? `${formattedMessage}\n${JSON.stringify(options.data, null, 2)}\n`
      : `${formattedMessage}\n`;
    
    fs.appendFileSync(logFile, logLine, "utf8");
  } catch (error) {
    // Silently fail - don't disrupt application flow
    console.error("Failed to write to log file:", error);
  }
}

export const logger = {
  debug(message: string, options?: LogOptions): void {
    if (DEBUG) {
      console.log(formatMessage("debug", message, options));
      if (options?.data !== undefined) {
        console.log(options.data);
      }
      writeToFile("debug", message, options);
    }
  },

  info(message: string, options?: LogOptions): void {
    if (DEBUG) {
      console.log(formatMessage("info", message, options));
      if (options?.data !== undefined) {
        console.log(options.data);
      }
      writeToFile("info", message, options);
    }
  },

  warn(message: string, options?: LogOptions): void {
    if (DEBUG) {
      console.warn(formatMessage("warn", message, options));
      if (options?.data !== undefined) {
        console.warn(options.data);
      }
      writeToFile("warn", message, options);
    }
  },

  error(message: string, options?: LogOptions): void {
    if (DEBUG) {
      console.error(formatMessage("error", message, options));
      if (options?.data !== undefined) {
        console.error(options.data);
      }
      writeToFile("error", message, options);
    }
  },
};

/**
 * Set the current session ID for logging context
 * Call this when a new WebSocket connection is established
 */
export function setSessionId(sessionId: string): void {
  currentSessionId = sessionId;
}

/**
 * Clear the current session ID
 * Call this when a WebSocket connection is closed
 */
export function clearSessionId(): void {
  currentSessionId = null;
}

/**
 * Get the current session ID
 */
export function getSessionId(): string | null {
  return currentSessionId;
}

// Convenience function to create a prefixed logger
export function createLogger(prefix: string) {
  return {
    debug: (message: string, data?: unknown, sessionId?: string) => 
      logger.debug(message, { prefix, data, sessionId: sessionId || currentSessionId || undefined }),
    info: (message: string, data?: unknown, sessionId?: string) => 
      logger.info(message, { prefix, data, sessionId: sessionId || currentSessionId || undefined }),
    warn: (message: string, data?: unknown, sessionId?: string) => 
      logger.warn(message, { prefix, data, sessionId: sessionId || currentSessionId || undefined }),
    error: (message: string, data?: unknown, sessionId?: string) => 
      logger.error(message, { prefix, data, sessionId: sessionId || currentSessionId || undefined }),
  };
}

/**
 * Create a session-specific logger
 * Use this to ensure all logs from a session go to the same file
 */
export function createSessionLogger(prefix: string, sessionId: string) {
  return {
    debug: (message: string, data?: unknown) => 
      logger.debug(message, { prefix, data, sessionId }),
    info: (message: string, data?: unknown) => 
      logger.info(message, { prefix, data, sessionId }),
    warn: (message: string, data?: unknown) => 
      logger.warn(message, { prefix, data, sessionId }),
    error: (message: string, data?: unknown) => 
      logger.error(message, { prefix, data, sessionId }),
  };
}
