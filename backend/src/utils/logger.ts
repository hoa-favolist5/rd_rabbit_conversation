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

// Use function to check DEBUG at runtime (not at module load time)
// This ensures dotenv.config() has already run
const isDebugEnabled = () => process.env.DEBUG === "true";
const LOGS_DIR = path.join(__dirname, "../../logs");

// User ID context for file logging (instead of session ID)
let currentUserId: string | null = null;

// Ensure logs directory exists (will be created on first log write)
function ensureLogsDir() {
  if (!isDebugEnabled()) return;
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
      console.log(`[Logger] Created logs directory: ${LOGS_DIR}`);
    }
  } catch (error) {
    console.error("Failed to create logs directory:", error);
  }
}

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogOptions {
  prefix?: string;
  data?: unknown;
  userId?: string;  // Optional user ID for this specific log
}

function formatMessage(level: LogLevel, message: string, options?: LogOptions): string {
  const timestamp = new Date().toISOString();
  const prefix = options?.prefix ? `[${options.prefix}] ` : "";
  const userPrefix = options?.userId ? `[User: ${options.userId}] ` : "";
  return `${timestamp} [${level.toUpperCase()}] ${userPrefix}${prefix}${message}`;
}

/**
 * Write log message to user-specific file (appends to existing file)
 */
function writeToFile(level: LogLevel, message: string, options?: LogOptions): void {
  const debugEnabled = isDebugEnabled();
  
  if (!debugEnabled) {
    // Don't spam console, just skip silently
    return;
  }

  const userId = options?.userId || currentUserId;
  if (!userId) {
    // This is normal - logs without user context are skipped
    return;
  }

  try {
    // Ensure logs directory exists
    ensureLogsDir();
    
    // Use userid-xxx.log format
    const logFile = path.join(LOGS_DIR, `userid-${userId}.log`);
    const formattedMessage = formatMessage(level, message, options);
    const logLine = options?.data !== undefined 
      ? `${formattedMessage}\n${JSON.stringify(options.data, null, 2)}\n`
      : `${formattedMessage}\n`;
    
    // fs.appendFileSync automatically appends to existing file or creates new one
    fs.appendFileSync(logFile, logLine, "utf8");
  } catch (error) {
    // Log error to help debug
    console.error(`[Logger] ❌ Failed to write to log file:`, error);
  }
}

export const logger = {
  debug(message: string, options?: LogOptions): void {
    if (isDebugEnabled()) {
      console.log(formatMessage("debug", message, options));
      if (options?.data !== undefined) {
        console.log(options.data);
      }
      writeToFile("debug", message, options);
    }
  },

  info(message: string, options?: LogOptions): void {
    if (isDebugEnabled()) {
      console.log(formatMessage("info", message, options));
      if (options?.data !== undefined) {
        console.log(options.data);
      }
      writeToFile("info", message, options);
    }
  },

  warn(message: string, options?: LogOptions): void {
    if (isDebugEnabled()) {
      console.warn(formatMessage("warn", message, options));
      if (options?.data !== undefined) {
        console.warn(options.data);
      }
      writeToFile("warn", message, options);
    }
  },

  error(message: string, options?: LogOptions): void {
    if (isDebugEnabled()) {
      console.error(formatMessage("error", message, options));
      if (options?.data !== undefined) {
        console.error(options.data);
      }
      writeToFile("error", message, options);
    }
  },
};

/**
 * Set the current user ID for logging context
 * Call this when user authentication is established
 */
export function setUserId(userId: string): void {
  currentUserId = userId;
}

/**
 * Clear the current user ID
 * Call this when a WebSocket connection is closed
 */
export function clearUserId(): void {
  currentUserId = null;
}

/**
 * Get the current user ID
 */
export function getUserId(): string | null {
  return currentUserId;
}

// Convenience function to create a prefixed logger
export function createLogger(prefix: string) {
  return {
    debug: (message: string, data?: unknown, userId?: string) => 
      logger.debug(message, { prefix, data, userId: userId || currentUserId || undefined }),
    info: (message: string, data?: unknown, userId?: string) => 
      logger.info(message, { prefix, data, userId: userId || currentUserId || undefined }),
    warn: (message: string, data?: unknown, userId?: string) => 
      logger.warn(message, { prefix, data, userId: userId || currentUserId || undefined }),
    error: (message: string, data?: unknown, userId?: string) => 
      logger.error(message, { prefix, data, userId: userId || currentUserId || undefined }),
  };
}

/**
 * Create a user-specific logger
 * Use this to ensure all logs from a user go to the same file
 */
export function createUserLogger(prefix: string, userId: string) {
  return {
    debug: (message: string, data?: unknown) => 
      logger.debug(message, { prefix, data, userId }),
    info: (message: string, data?: unknown) => 
      logger.info(message, { prefix, data, userId }),
    warn: (message: string, data?: unknown) => 
      logger.warn(message, { prefix, data, userId }),
    error: (message: string, data?: unknown) => 
      logger.error(message, { prefix, data, userId }),
  };
}
