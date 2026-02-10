/**
 * Gemini-TTS Service
 * 
 * Migration from Google Cloud Neural2 TTS to Gemini-TTS
 * 
 * Benefits:
 * - Natural language prompts for style control
 * - Better conversational quality
 * - Advanced emotion and tone control
 * - Low latency streaming
 * 
 * Setup:
 * 1. Service account JSON file at GOOGLE_APPLICATION_CREDENTIALS
 * 2. Enable Cloud Text-to-Speech API
 * 3. Japanese (ja-JP) is GA (Generally Available)
 */

import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { config } from '../config/index.js';
import { createLogger } from '../utils/logger.js';
import type { EmotionType, TTSOptions } from '../types/index.js';

const log = createLogger("GeminiTTS");

// Initialize Gemini-TTS client
let ttsClient: TextToSpeechClient | null = null;

function getClient(): TextToSpeechClient {
  if (!ttsClient) {
    const keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    
    if (keyFilePath) {
      ttsClient = new TextToSpeechClient({
        keyFilename: keyFilePath,
      });
      log.info(`Using Google service account from: ${keyFilePath}`);
    } else {
      const apiKey = config.google?.cloudApiKey || config.google?.apiKey;
      if (apiKey) {
        ttsClient = new TextToSpeechClient({
          apiKey: apiKey,
        });
        log.info('Using Google API key authentication');
      } else {
        ttsClient = new TextToSpeechClient();
        log.info('Using default Google credentials');
      }
    }
  }
  return ttsClient;
}

// Gemini-TTS voice options for Japanese
const GEMINI_VOICES = {
  female: 'Achernar',      // Female voice
  male: 'Charon',      // Male voice
} as const;

// NOTE: Emotion prompts are intentionally NOT sent to Gemini TTS.
// Gemini 2.5 Flash TTS is inherently expressive — it interprets emotional
// cues from the text itself and over-exaggerates pitch/rate when given
// emotion descriptions. Sending only pure text (sentences) produces
// smoother, more natural-sounding audio output.

/**
 * Synthesize speech using Gemini-TTS
 * Returns audio data as Buffer (MP3 format)
 * 
 * Uses natural language prompts for emotion control
 */
export async function synthesizeSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<Buffer> {
  const { voice = 'female' } = options;

  // Get voice name — no emotion prompt attached
  const voiceName = GEMINI_VOICES[voice];

  // Construct the Gemini-TTS request
  // Only send pure text — no prompt/emotion description.
  // This prevents Gemini TTS from over-exaggerating pitch/rate.
  const request = {
    input: {
      text,
    },
    voice: {
      languageCode: 'ja-JP',
      name: voiceName,
      modelName: 'gemini-2.5-flash-tts', // Low latency, cost-efficient
    },
    audioConfig: {
      audioEncoding: 'MP3' as const,
      sampleRateHertz: 24000,
    },
  };

  try {
    const client = getClient();
    const startTime = performance.now();
    const textPreview = text.length > 30 ? text.slice(0, 30) + '...' : text;
    
    log.debug(`TTS request START: "${textPreview}" (${text.length} chars)`);
    
    const [response] = await client.synthesizeSpeech(request);
    
    const durationMs = Math.round(performance.now() - startTime);
    const audioBytes = response.audioContent ? (response.audioContent as Uint8Array).length : 0;
    const audioKB = Math.round(audioBytes / 1024);
    
    // Log with timing details - flag slow requests (>500ms)
    if (durationMs > 500) {
      log.warn(`TTS request SLOW: ${durationMs}ms for "${textPreview}" (${text.length} chars → ${audioKB}KB)`);
    } else {
      log.debug(`TTS request END: ${durationMs}ms for "${textPreview}" (${text.length} chars → ${audioKB}KB)`);
    }

    if (!response.audioContent) {
      throw new Error('No audio content in response');
    }

    // Convert to Buffer
    return Buffer.from(response.audioContent as Uint8Array);
  } catch (error: any) {
    log.error('Gemini-TTS error:', error?.message || error);
    throw new Error(`Gemini-TTS failed: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Synthesize speech and return as base64 string
 * Used for WebSocket transmission
 */
export async function synthesizeSpeechBase64(
  text: string,
  options: TTSOptions = {}
): Promise<string> {
  const audioBuffer = await synthesizeSpeech(text, options);
  return audioBuffer.toString('base64');
}

/**
 * Synthesize with custom prompt
 * Allows full control over the style instruction
 * 
 * NOTE: Custom prompts are intentionally ignored now — only pure text is sent.
 * Gemini TTS over-exaggerates pitch/rate when given style instructions.
 */
export async function synthesizeSpeechWithPrompt(
  text: string,
  _prompt: string,
  voice: 'female' | 'male' = 'female'
): Promise<Buffer> {
  const voiceName = GEMINI_VOICES[voice];

  const request = {
    input: {
      text,
      // prompt intentionally omitted — pure text only for smoother output
    },
    voice: {
      languageCode: 'ja-JP',
      name: voiceName,
      modelName: 'gemini-2.5-flash-tts',
    },
    audioConfig: {
      audioEncoding: 'MP3' as const,
      sampleRateHertz: 24000,
    },
  };

  try {
    const client = getClient();
    const [response] = await client.synthesizeSpeech(request);

    if (!response.audioContent) {
      throw new Error('No audio content in response');
    }

    return Buffer.from(response.audioContent as Uint8Array);
  } catch (error: any) {
    log.error('Gemini-TTS error:', error?.message || error);
    throw new Error(`Gemini-TTS failed: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Synthesize with markup tags for fine control
 * Examples: [sigh], [uhm], [whispering], [extremely fast]
 * 
 * NOTE: Emotion prompt intentionally omitted — pure text only.
 */
export async function synthesizeSpeechWithMarkup(
  text: string,
  _emotion: EmotionType = 'neutral',
  voice: 'female' | 'male' = 'female'
): Promise<Buffer> {
  const voiceName = GEMINI_VOICES[voice];

  const request = {
    input: {
      text, // Text can include markup tags like [uhm], [sigh], etc.
      // prompt intentionally omitted — pure text only for smoother output
    },
    voice: {
      languageCode: 'ja-JP',
      name: voiceName,
      modelName: 'gemini-2.5-flash-tts',
    },
    audioConfig: {
      audioEncoding: 'MP3' as const,
      sampleRateHertz: 24000,
    },
  };

  try {
    const client = getClient();
    const [response] = await client.synthesizeSpeech(request);

    if (!response.audioContent) {
      throw new Error('No audio content in response');
    }

    return Buffer.from(response.audioContent as Uint8Array);
  } catch (error: any) {
    log.error('Gemini-TTS error:', error?.message || error);
    throw new Error(`Gemini-TTS failed: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Test the Gemini-TTS service
 */
export async function testTTS(): Promise<boolean> {
  try {
    log.info('Testing Gemini-TTS...');
    const audio = await synthesizeSpeech('こんにちは', {
      voice: 'female',
      emotion: 'neutral',
    });
    log.info(`Test passed: Generated ${audio.length} bytes`);
    return true;
  } catch (error: any) {
    log.error('Test failed:', error?.message);
    return false;
  }
}

/**
 * Get emotion prompt for a given emotion
 * NOTE: Returns empty string — emotion prompts are no longer sent to TTS.
 * Kept for API compatibility.
 */
export function getEmotionPrompt(_emotion: EmotionType): string {
  return '';
}

/**
 * Get available voices
 */
export function getAvailableVoices(): typeof GEMINI_VOICES {
  return GEMINI_VOICES;
}
