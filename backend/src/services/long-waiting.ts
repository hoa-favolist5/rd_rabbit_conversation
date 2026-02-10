/**
 * Long Waiting Phrases - Database query acknowledgment
 * 
 * These are longer phrases (2-4 seconds) that:
 * 1. Confirm what the user is looking for
 * 2. Tell them to wait while searching
 * 3. Give a sense of progress
 * 
 * Used specifically for database/tool operations that take time.
 * Streamed to frontend as TTS audio immediately when tool use is detected.
 */

// Template functions for context-aware waiting phrases
export interface WaitingContext {
  query?: string;      // User's search query (e.g., "アクション映画")
  genre?: string;      // Detected genre
  year?: number;       // Detected year
}

/**
 * Generate a context-aware waiting phrase for database search
 * 
 * @param context - Information about the search being performed
 * @returns Japanese waiting phrase that confirms and acknowledges the search
 */
export function generateLongWaitingPhrase(context: WaitingContext): string {
  const templates = [
    // General search phrases
    "少々お待ちください、今すぐ探してみますね。",
    "了解です、ちょっと調べてみますね。",
    "わかりました、今確認しています。",
    "はい、探してみますね、少々お待ちください。",
    
    // With query confirmation
    ...(context.query ? [
      `${context.query}ですね、今探していますので少々お待ちください。`,
      `了解です、${context.query}を調べてみますね。`,
      `${context.query}についてお調べしますね。`,
      `なるほど、${context.query}ですね。今確認しています。`,
    ] : []),
    
    // With genre confirmation
    ...(context.genre ? [
      `${context.genre}の作品ですね、今探していますので少々お待ちください。`,
      `${context.genre}ですね、データベースを確認しています。`,
    ] : []),
    
    // With year confirmation
    ...(context.year ? [
      `${context.year}年の作品ですね、今探していますので少々お待ちください。`,
      `${context.year}年ですね、調べてみますね。`,
    ] : []),
    
    // Combined confirmations
    ...(context.genre && context.year ? [
      `${context.year}年の${context.genre}作品ですね、今確認しています。`,
      `了解です、${context.year}年の${context.genre}を探してみますね。`,
    ] : []),
  ];
  
  const index = Math.floor(Math.random() * templates.length);
  return templates[index];
}

/**
 * Simplified waiting phrases without context (fallback)
 */
export const SIMPLE_LONG_WAITING_PHRASES = [
  "少々お待ちください、今すぐ探してみますね。",
  "了解です、ちょっと調べてみますね。",
  "わかりました、今確認しています。",
  "はい、探してみますね、少々お待ちください。",
  "データベースを確認していますので、少々お待ちください。",
  "今すぐお調べしますね。",
] as const;

/**
 * Get a random simple waiting phrase (no context)
 */
export function getRandomLongWaiting(): string {
  const index = Math.floor(Math.random() * SIMPLE_LONG_WAITING_PHRASES.length);
  return SIMPLE_LONG_WAITING_PHRASES[index];
}
