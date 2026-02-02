/**
 * Voice Command Detection and Execution
 * 
 * Detects commands in user input (voice or text) and executes them locally
 * without sending to backend. Extensible for adding new commands.
 */

import { createLogger } from "./logger";

const log = createLogger("VoiceCommands");

/**
 * Command types that can be detected
 */
export type CommandType = "save" | "delete" | "list" | "clear";

/**
 * Command detection result
 */
export interface CommandMatch {
  type: CommandType;
  matched: boolean;
  keyword: string;
  confidence: number; // 0-1, how confident we are this is the command
}

/**
 * Command keywords in multiple languages
 * Add new commands here for easy maintenance
 */
export const COMMAND_KEYWORDS: Record<CommandType, string[]> = {
  // Save commands
  save: [
    // Japanese
    "保存して",
    "保存する",
    "保存",
    "セーブして",
    "セーブする",
    "アーカイブに保存",
    "アーカイブに追加",
    "お気に入りに追加",
    "ブックマーク",
    // English
    "save this",
    "save it",
    "save",
    "add to archive",
    "add to favorites",
    "bookmark this",
    "bookmark it",
  ],
  
  // Delete commands (for future)
  delete: [
    "削除して",
    "削除する",
    "消して",
    "delete this",
    "remove this",
  ],
  
  // List commands (for future)
  list: [
    "リストを見せて",
    "アーカイブを見せて",
    "保存したものを見せて",
    "show my list",
    "show archive",
    "show saved items",
  ],
  
  // Clear commands (for future)
  clear: [
    "クリア",
    "全部消して",
    "clear all",
    "delete all",
  ],
};

/**
 * Normalize text for command detection
 * Removes punctuation and extra whitespace
 */
function normalizeForCommandDetection(text: string): string {
  return text
    .toLowerCase()
    .trim()
    // Remove common Japanese and English punctuation
    .replace(/[。、！？!?,.\s]+/g, "");
}

/**
 * Detect if text contains a command
 * Returns the first matched command with highest confidence
 */
export function detectCommand(text: string): CommandMatch | null {
  const normalized = text.toLowerCase().trim();
  const cleanNormalized = normalizeForCommandDetection(text);
  
  // Check each command type
  for (const [commandType, keywords] of Object.entries(COMMAND_KEYWORDS)) {
    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase();
      const cleanKeyword = normalizeForCommandDetection(keyword);
      
      // Check both original and cleaned versions for better matching
      const matchesOriginal = normalized.includes(keywordLower);
      const matchesCleaned = cleanNormalized.includes(cleanKeyword);
      
      if (matchesOriginal || matchesCleaned) {
        // Calculate confidence based on match quality
        const isExactMatch = cleanNormalized === cleanKeyword;
        const isStartMatch = cleanNormalized.startsWith(cleanKeyword);
        const isEndMatch = cleanNormalized.endsWith(cleanKeyword);
        
        let confidence = 0.7; // Base confidence
        if (isExactMatch) confidence = 1.0;
        else if (isStartMatch || isEndMatch) confidence = 0.9;
        
        log.debug(`✅ Command detected: ${commandType} (keyword: "${keyword}", confidence: ${confidence})`);
        
        return {
          type: commandType as CommandType,
          matched: true,
          keyword,
          confidence,
        };
      }
    }
  }
  
  return null;
}

/**
 * Check if text is ONLY a command (no other content)
 * Useful for deciding whether to send to backend
 */
export function isCommandOnly(text: string): boolean {
  const command = detectCommand(text);
  if (!command) return false;
  
  // Use the same normalization function for consistency
  const cleanText = normalizeForCommandDetection(text);
  const cleanKeyword = normalizeForCommandDetection(command.keyword);
  
  return cleanText === cleanKeyword;
}

/**
 * Extract command and remaining text
 * Useful for commands that have parameters
 */
export function parseCommand(text: string): {
  command: CommandMatch | null;
  remainingText: string;
} {
  const command = detectCommand(text);
  
  if (!command) {
    return { command: null, remainingText: text };
  }
  
  // Remove command keyword from text
  const normalized = text.toLowerCase();
  const keywordLower = command.keyword.toLowerCase();
  const index = normalized.indexOf(keywordLower);
  
  let remainingText = text;
  if (index !== -1) {
    remainingText = 
      text.substring(0, index) + 
      text.substring(index + command.keyword.length);
    remainingText = remainingText.trim();
  }
  
  return { command, remainingText };
}

/**
 * Add new command keywords dynamically
 * Useful for user customization or A/B testing
 */
export function addCommandKeyword(type: CommandType, keyword: string): void {
  if (!COMMAND_KEYWORDS[type].includes(keyword)) {
    COMMAND_KEYWORDS[type].push(keyword);
    log.info(`➕ Added new keyword for ${type}: "${keyword}"`);
  }
}

/**
 * Get all keywords for a command type
 */
export function getCommandKeywords(type: CommandType): string[] {
  return [...COMMAND_KEYWORDS[type]];
}

/**
 * Get all available command types
 */
export function getAvailableCommands(): CommandType[] {
  return Object.keys(COMMAND_KEYWORDS) as CommandType[];
}
