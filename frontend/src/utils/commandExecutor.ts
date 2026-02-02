/**
 * Command Executor
 * 
 * Executes detected commands locally on the client side.
 * Extensible architecture for adding new command handlers.
 */

import type { DomainType } from "@/types";
import type { CommandType } from "./voiceCommands";
import { createLogger } from "./logger";
import archiveStorage from "./archiveStorage";

const log = createLogger("CommandExecutor");

/**
 * Command execution context - all data needed to execute commands
 */
export interface CommandContext {
  userId: string | null;
  saveToArchive: (
    userId: string,
    domain: DomainType,
    itemId: string,
    itemTitle?: string,
    itemData?: Record<string, unknown>
  ) => void;
}

/**
 * Command execution result
 */
export interface CommandResult {
  success: boolean;
  message: string;
  shouldSendToBackend: boolean; // Whether to send original text to backend
}

/**
 * Command handler function type
 */
type CommandHandler = (context: CommandContext) => CommandResult;

/**
 * Registry of command handlers
 * Add new handlers here for easy maintenance
 */
const COMMAND_HANDLERS: Record<CommandType, CommandHandler> = {
  /**
   * SAVE command - Save last archivable item to user's archive
   * Uses FILO storage to get the most recent item
   */
  save: (context: CommandContext): CommandResult => {
    const { userId, saveToArchive } = context;
    
    // Validation: Check if user is logged in
    if (!userId) {
      log.warn("❌ Save failed: User not logged in");
      return {
        success: false,
        message: "ログインしてください",
        shouldSendToBackend: false,
      };
    }
    
    // Get the most recent archivable item from FILO storage
    const item = archiveStorage.peek();
    
    if (!item) {
      log.warn("❌ Save failed: No archivable item in storage");
      return {
        success: false,
        message: "保存できるアイテムが見つかりません",
        shouldSendToBackend: false,
      };
    }
    
    // Extract item details
    const { itemId, itemTitle, itemDomain, itemData } = item;
    
    // Execute save
    try {
      saveToArchive(userId, itemDomain, itemId, itemTitle, itemData);
      
      log.info(`✅ Voice/Text command: Saved ${itemTitle} (${itemDomain}:${itemId})`);
      
      return {
        success: true,
        message: `${itemTitle}をアーカイブに保存しました`,
        shouldSendToBackend: false, // Don't send to backend
      };
    } catch (error) {
      log.error("❌ Save failed:", error);
      return {
        success: false,
        message: "保存に失敗しました",
        shouldSendToBackend: false,
      };
    }
  },
  
  /**
   * DELETE command - Remove item from archive (future implementation)
   */
  delete: (context: CommandContext): CommandResult => {
    log.info("🚧 Delete command not yet implemented");
    return {
      success: false,
      message: "削除機能は準備中です",
      shouldSendToBackend: false,
    };
  },
  
  /**
   * LIST command - Show archived items (future implementation)
   */
  list: (context: CommandContext): CommandResult => {
    log.info("🚧 List command not yet implemented");
    return {
      success: false,
      message: "リスト表示機能は準備中です",
      shouldSendToBackend: false,
    };
  },
  
  /**
   * CLEAR command - Clear all archived items (future implementation)
   */
  clear: (context: CommandContext): CommandResult => {
    log.info("🚧 Clear command not yet implemented");
    return {
      success: false,
      message: "クリア機能は準備中です",
      shouldSendToBackend: false,
    };
  },
};

/**
 * Execute a command with given context
 */
export function executeCommand(
  commandType: CommandType,
  context: CommandContext
): CommandResult {
  log.debug(`🎯 Executing command: ${commandType}`);
  
  const handler = COMMAND_HANDLERS[commandType];
  
  if (!handler) {
    log.error(`❌ No handler found for command: ${commandType}`);
    return {
      success: false,
      message: `コマンド "${commandType}" は実装されていません`,
      shouldSendToBackend: false,
    };
  }
  
  try {
    return handler(context);
  } catch (error) {
    log.error(`❌ Command execution failed:`, error);
    return {
      success: false,
      message: "コマンドの実行に失敗しました",
      shouldSendToBackend: false,
    };
  }
}

/**
 * Register a custom command handler
 * Useful for plugins or extensions
 */
export function registerCommandHandler(
  commandType: CommandType,
  handler: CommandHandler
): void {
  COMMAND_HANDLERS[commandType] = handler;
  log.info(`✅ Registered custom handler for: ${commandType}`);
}

/**
 * Check if a command has a handler
 */
export function hasCommandHandler(commandType: CommandType): boolean {
  return commandType in COMMAND_HANDLERS;
}
