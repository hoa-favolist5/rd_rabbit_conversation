/**
 * Generate Short Waiting Audio Files
 * 
 * Creates short acknowledgment sounds (< 1s) using Google TTS
 * with the same voice as the main responses for consistency.
 * 
 * Usage: npm run generate:short-waiting
 */

import { synthesizeSpeech } from "../services/google-tts.js";
import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createLogger } from "../utils/logger.js";

const log = createLogger("GenerateShortWaiting");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Output directory (frontend public folder)
const OUTPUT_DIR = join(__dirname, "../../../frontend/public/waiting-short");

// Short waiting phrases (< 1 second each)
// These are natural Japanese filler sounds/acknowledgments
const SHORT_WAITING_PHRASES = [
  // "ああ",           // 0: ah (acknowledgment)
  // "うん",           // 1: un (yes/acknowledgment)
  // "えっと",         // 2: etto (um/well)
  // "そうだね",       // 3: sou da ne (I see)
  // "なるほど",       // 4: naruhodo (I understand)
  // "ふむ",           // 5: fumu (hmm)
  // "へぇ",           // 6: hee (oh/interesting)
  // "そっか",         // 7: sokka (I see)
  // "うーん",         // 8: uun (hmm)
  // "わかった",       // 9: wakatta (got it)
  "今からちょっと確認するね。",
  "うん、今確認してるよ。",
  "OK、少し待っててね。",
  "任せて、探してみるね。",
  "ちょっと考えてみるね。",
  "うんうん、今見てるよ。",
  "今確認するね。",
  "今調べてるよ。",
  "すぐ確認するね。",
  "うん、ちょっと待ってね。",
  "了解、今チェックしてるよ。",
  "OK、今確認中だよ。",
  "ちょっと待ってね、今確認するね。",
  "はーい、少し待ってね。",
  "今対応するね。",
  "えっと、確認してみるね。",
  "大丈夫、任せてね。",
  "今確認してるから、少し待ってね。",
  "今探してるところだよ。",
  "ちょっとだけ時間もらうね。"
];

/**
 * Generate a single short waiting audio file
 */
async function generateShortWaiting(
  text: string,
  index: number
): Promise<void> {
  try {
    log.info(`Generating ${index}.mp3: "${text}"`);

    // Use the same voice settings as responses
    // "speaking" emotion for natural conversational tone
    const audioBuffer = await synthesizeSpeech(text, {
      emotion: "speaking",
      voice: "female",
    });

    // Ensure output directory exists
    await mkdir(OUTPUT_DIR, { recursive: true });

    // Write to file
    const outputPath = join(OUTPUT_DIR, `${index}.mp3`);
    await writeFile(outputPath, audioBuffer);

    log.info(`✓ Generated ${index}.mp3 (${audioBuffer.length} bytes)`);
  } catch (error) {
    log.error(`✗ Failed to generate ${index}.mp3:`, error);
    throw error;
  }
}

/**
 * Generate all short waiting audio files
 */
async function generateAll(): Promise<void> {
  log.info("=".repeat(60));
  log.info("Generating Short Waiting Audio Files");
  log.info("=".repeat(60));
  log.info(`Output directory: ${OUTPUT_DIR}`);
  log.info(`Total files: ${SHORT_WAITING_PHRASES.length}`);
  log.info("");

  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < SHORT_WAITING_PHRASES.length; i++) {
    try {
      await generateShortWaiting(SHORT_WAITING_PHRASES[i], i);
      successCount++;
    } catch (error) {
      failCount++;
      log.error(`Failed to generate file ${i}:`, error);
    }
  }

  const duration = Date.now() - startTime;

  log.info("");
  log.info("=".repeat(60));
  log.info("Generation Complete");
  log.info("=".repeat(60));
  log.info(`Success: ${successCount}/${SHORT_WAITING_PHRASES.length}`);
  log.info(`Failed: ${failCount}`);
  log.info(`Duration: ${(duration / 1000).toFixed(2)}s`);
  log.info("");

  if (failCount > 0) {
    process.exit(1);
  }
}

// Run the script
generateAll().catch((error) => {
  log.error("Script failed:", error);
  process.exit(1);
});
