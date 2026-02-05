/**
 * Hiragana Converter Utility
 * 
 * Converts Japanese text (kanji/katakana) to hiragana for keyword matching.
 * Only used when movie/gourmet keywords are detected in STT output.
 * 
 * Uses kuroshiro-browser with kuromoji dictionary (~12MB, loaded on first use).
 */

import { Kuroshiro } from "kuroshiro-browser";
import { createLogger } from "./logger";

const log = createLogger("HiraganaConverter");

// Singleton instance with lazy initialization
let kuroshiro: Kuroshiro | null = null;
let initPromise: Promise<Kuroshiro> | null = null;

/**
 * Get or initialize Kuroshiro instance (singleton pattern).
 */
async function getKuroshiro(): Promise<Kuroshiro> {
  if (kuroshiro) return kuroshiro;
  
  if (!initPromise) {
    initPromise = (async () => {
      log.info("🔄 Loading Kuroshiro dictionary...");
      const start = performance.now();
      
      // IS_PROD=true → looks for dictionaries at /dict/ (served from public/dict/)
      const instance = await Kuroshiro.buildAndInitWithKuromoji(true);
      
      log.info(`✅ Kuroshiro ready (${Math.round(performance.now() - start)}ms)`);
      kuroshiro = instance;
      return instance;
    })().catch((err) => {
      initPromise = null; // Allow retry on failure
      throw err;
    });
  }
  
  return initPromise;
}

/**
 * Convert katakana characters to hiragana (simple character mapping).
 * Used as fallback for words not in the dictionary.
 */
function katakanaToHiragana(str: string): string {
  // Katakana range: U+30A1 to U+30F6, Hiragana is 0x60 lower
  return str.replace(/[\u30A1-\u30F6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

/**
 * Convert Japanese text to hiragana.
 * 
 * @param text - Text containing kanji/katakana (e.g., "タイタニック映画")
 * @returns Hiragana string (e.g., "たいたにっくえいが")
 */
export async function toHiragana(text: string): Promise<string> {
  if (!text?.trim()) return text;

  try {
    const k = await getKuroshiro();
    let result = await k.convert(text, { to: "hiragana", mode: "normal" });
    
    // Catch unknown words left as katakana by kuroshiro
    result = katakanaToHiragana(result);
    
    log.debug(`📝 "${text}" → "${result}"`);
    return result;
  } catch (err) {
    log.error("Conversion failed:", err);
    // Fallback: at least convert katakana
    return katakanaToHiragana(text);
  }
}

/**
 * Pre-load dictionary for faster first conversion.
 * Call on app startup to avoid delay when user speaks.
 */
export async function preloadConverter(): Promise<boolean> {
  try {
    await getKuroshiro();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if converter is ready (dictionary loaded).
 */
export function isConverterReady(): boolean {
  return kuroshiro !== null;
}
