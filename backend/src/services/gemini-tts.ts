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
  female: 'Kore',      // Female voice
  male: 'Charon',      // Male voice
} as const;

// Emotion to natural language prompt mapping
const EMOTION_PROMPTS: Record<EmotionType, string> = {
  neutral: 'Say the following in a calm and natural way',
  happy: 'Say the following in a cheerful and upbeat way, with a smile in your voice',
  excited: 'Say the following with excitement and energy, showing enthusiasm',
  thinking: 'Say the following thoughtfully, as if carefully considering each word',
  sad: 'Say the following in a somber and melancholic tone, with a touch of sadness',
  surprised: 'Say the following with surprise and wonder, showing amazement',
  confused: 'Say the following in a confused manner, as if uncertain or puzzled',
  listening: 'Say the following in an attentive and engaged way, showing you\'re listening',
  speaking: 'Say the following in a conversational and natural speaking tone',
};

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
  const { voice = 'female', emotion = 'neutral' } = options;

  // Validate emotion
  const validEmotion: EmotionType = 
    emotion in EMOTION_PROMPTS ? emotion : 'neutral';

  // Get voice name and prompt
  const voiceName = GEMINI_VOICES[voice];
  const prompt = EMOTION_PROMPTS[validEmotion];

  // Construct the Gemini-TTS request
  const request = {
    input: {
      text,
      prompt,
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
    const [response] = await client.synthesizeSpeech(request);

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
 */
export async function synthesizeSpeechWithPrompt(
  text: string,
  prompt: string,
  voice: 'female' | 'male' = 'female'
): Promise<Buffer> {
  const voiceName = GEMINI_VOICES[voice];

  const request = {
    input: {
      text,
      prompt,
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
 */
export async function synthesizeSpeechWithMarkup(
  text: string,
  emotion: EmotionType = 'neutral',
  voice: 'female' | 'male' = 'female'
): Promise<Buffer> {
  const voiceName = GEMINI_VOICES[voice];
  const prompt = EMOTION_PROMPTS[emotion];

  const request = {
    input: {
      text, // Text can include markup tags like [uhm], [sigh], etc.
      prompt,
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
 * Useful for debugging or custom implementations
 */
export function getEmotionPrompt(emotion: EmotionType): string {
  return EMOTION_PROMPTS[emotion] || EMOTION_PROMPTS.neutral;
}

/**
 * Get available voices
 */
export function getAvailableVoices(): typeof GEMINI_VOICES {
  return GEMINI_VOICES;
}
