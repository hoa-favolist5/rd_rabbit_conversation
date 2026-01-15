import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { config } from "../config/index.js";
import type { EmotionType, TTSOptions } from "../types/index.js";

// Japanese Neural voices that support styles (emotions)
const VOICES = {
  female: "ja-JP-NanamiNeural", // Female voice with emotion support
  male: "ja-JP-KeitaNeural",   // Male voice with emotion support
} as const;

// Map emotion types to Azure TTS speaking styles
const EMOTION_STYLES: Record<EmotionType, string> = {
  happy: "cheerful",
  excited: "cheerful", // Azure doesn't have "excited", use cheerful with higher degree
  sad: "sad",
  surprised: "cheerful", // Use cheerful for surprised (no direct mapping)
  thinking: "calm",
  confused: "disgruntled",
  neutral: "default",
  listening: "default",
  speaking: "default",
};

// Style degree adjustments for different emotions
const STYLE_DEGREES: Record<EmotionType, number> = {
  happy: 1.2,
  excited: 1.8,
  sad: 1.0,
  surprised: 1.5,
  thinking: 0.8,
  confused: 1.0,
  neutral: 1.0,
  listening: 1.0,
  speaking: 1.0,
};

/**
 * Escape special XML characters for SSML
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generate SSML with emotion styling
 */
function generateSSML(
  text: string,
  voice: "female" | "male",
  emotion: EmotionType
): string {
  const voiceName = VOICES[voice];
  const style = EMOTION_STYLES[emotion];
  const styleDegree = STYLE_DEGREES[emotion];

  // If default style, use simpler SSML without express-as
  if (style === "default") {
    return `
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ja-JP">
  <voice name="${voiceName}">
    ${escapeXml(text)}
  </voice>
</speak>`.trim();
  }

  // SSML with emotion styling
  return `
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
       xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="ja-JP">
  <voice name="${voiceName}">
    <mstts:express-as style="${style}" styledegree="${styleDegree}">
      ${escapeXml(text)}
    </mstts:express-as>
  </voice>
</speak>`.trim();
}

/**
 * Synthesize speech from text using Azure Neural TTS
 * Returns audio data as Buffer (WAV format)
 */
export async function synthesizeSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<Buffer> {
  const { voice = "female", emotion = "neutral" } = options;

  // Create speech config
  const speechConfig = sdk.SpeechConfig.fromSubscription(
    config.azure.speechKey,
    config.azure.speechRegion
  );

  // Set output format to high quality audio
  speechConfig.speechSynthesisOutputFormat =
    sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

  // Generate SSML
  const ssml = generateSSML(text, voice, emotion);

  return new Promise((resolve, reject) => {
    // Create synthesizer with pull audio output stream
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, undefined);

    synthesizer.speakSsmlAsync(
      ssml,
      (result) => {
        synthesizer.close();

        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          // Convert ArrayBuffer to Buffer
          const audioData = Buffer.from(result.audioData);
          resolve(audioData);
        } else if (result.reason === sdk.ResultReason.Canceled) {
          const cancellation = sdk.CancellationDetails.fromResult(result);
          reject(
            new Error(
              `TTS canceled: ${cancellation.reason}. ${cancellation.errorDetails}`
            )
          );
        } else {
          reject(new Error(`TTS failed with reason: ${result.reason}`));
        }
      },
      (error) => {
        synthesizer.close();
        reject(error);
      }
    );
  });
}

/**
 * Synthesize speech and return as base64 encoded string
 */
export async function synthesizeSpeechBase64(
  text: string,
  options: TTSOptions = {}
): Promise<string> {
  const audioBuffer = await synthesizeSpeech(text, options);
  return audioBuffer.toString("base64");
}

/**
 * Get available voices for debugging
 */
export function getAvailableVoices(): Record<string, string> {
  return { ...VOICES };
}

/**
 * Get available emotion styles for debugging
 */
export function getAvailableStyles(): Record<string, string> {
  return { ...EMOTION_STYLES };
}
