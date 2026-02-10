/**
 * Google Cloud Speech-to-Text Streaming Service
 * 
 * Handles real-time audio streaming from WebSocket clients to Google Cloud STT.
 * Each session manages a single streaming recognize request with auto-reconnect
 * for the 5-minute Google streaming limit.
 * 
 * Protocol:
 *   1. First write to stream: { streamingConfig: { config, interimResults } }
 *   2. Subsequent writes:     { audioContent: <Buffer> }
 */

import { SpeechClient } from "@google-cloud/speech";
import type { google } from "@google-cloud/speech/build/protos/protos.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("GoogleSTT");

// Google STT streaming has a ~5 minute limit; reconnect before that
const STREAM_TIMEOUT_MS = 4.5 * 60 * 1000; // 4.5 minutes (with buffer)

/**
 * Configuration for Google STT streaming
 */
export interface GoogleSTTConfig {
  languageCode: string;       // e.g. "ja-JP"
  sampleRateHertz: number;    // e.g. 16000
  encoding?: string;          // e.g. "LINEAR16" (default)
  enableInterimResults?: boolean;  // default: true
  model?: string;             // e.g. "latest_long", "latest_short", "default"
  useEnhanced?: boolean;      // Use enhanced model (better accuracy, higher cost)
  singleUtterance?: boolean;  // Stop after first utterance (default: false)
}

/**
 * Callbacks for STT events
 */
export interface GoogleSTTCallbacks {
  onTranscript: (text: string, isFinal: boolean, confidence?: number) => void;
  onError: (error: Error) => void;
  onStarted?: () => void;
  onStopped?: () => void;
}

/**
 * Google Cloud STT Streaming Session
 * Manages a single streaming recognize connection
 */
export class GoogleSTTSession {
  private client: SpeechClient;
  private recognizeStream: ReturnType<SpeechClient["streamingRecognize"]> | null = null;
  private config: GoogleSTTConfig;
  private callbacks: GoogleSTTCallbacks;
  private isActive = false;
  private streamDestroyed = false; // Prevent writes after stream error/destroy
  private streamTimer: NodeJS.Timeout | null = null;
  private restartPending = false;

  constructor(config: GoogleSTTConfig, callbacks: GoogleSTTCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
    
    // Create Speech client using GOOGLE_APPLICATION_CREDENTIALS env var
    this.client = new SpeechClient();
  }

  /**
   * Start the streaming recognition session
   */
  async start(): Promise<void> {
    if (this.isActive) {
      log.warn("STT session already active, stopping first");
      this.stopStream();
    }

    try {
      log.debug("🎙️ Starting Google STT stream...", {
        languageCode: this.config.languageCode,
        sampleRate: this.config.sampleRateHertz,
        model: this.config.model || "default",
      });

      this.startStream();
      this.isActive = true;
      this.callbacks.onStarted?.();
      
      log.debug("✅ Google STT stream started");
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error("❌ Failed to start Google STT stream:", err);
      this.callbacks.onError(err);
      throw err;
    }
  }

  /**
   * Write audio data to the stream
   * @param audioData PCM16 audio data as Buffer or Uint8Array
   */
  writeAudio(audioData: Buffer | Uint8Array): void {
    if (!this.recognizeStream || !this.isActive || this.streamDestroyed) {
      // Silently drop audio if not active or stream is destroyed
      return;
    }

    try {
      // Write raw audio buffer — the library's helper PassThrough
      // automatically wraps it as { audioContent: buffer }
      this.recognizeStream.write(audioData);
    } catch (error) {
      // Mark stream as destroyed to prevent further write attempts
      this.streamDestroyed = true;
      
      // Stream might have ended due to timeout - try restart
      if (this.isActive && !this.restartPending) {
        log.debug("🔄 Stream write failed, restarting...");
        this.restartStream();
      }
    }
  }

  /**
   * Stop the streaming session
   */
  stop(): void {
    log.debug("🛑 Stopping Google STT session...");
    this.isActive = false;
    this.restartPending = false;
    this.stopStream();
    this.callbacks.onStopped?.();
  }

  /**
   * Check if the session is currently active
   */
  getIsActive(): boolean {
    return this.isActive;
  }

  /**
   * Destroy the session and release resources
   */
  destroy(): void {
    this.stop();
  }

  // ─── Private Methods ───

  private startStream(): void {
    this.streamDestroyed = false;

    // Build recognition config
    const recognitionConfig: google.cloud.speech.v1.IRecognitionConfig = {
      encoding: (this.config.encoding as any) || "LINEAR16",
      sampleRateHertz: this.config.sampleRateHertz,
      languageCode: this.config.languageCode,
      // Optimizations for Japanese real-time transcription
      enableAutomaticPunctuation: true,
      // Model selection
      model: this.config.model || "default",
      useEnhanced: this.config.useEnhanced ?? false,
    };

    // The @google-cloud/speech helper's streamingRecognize(config):
    //   1. Accepts StreamingRecognitionConfig as parameter
    //   2. Automatically sends { streamingConfig } as the first gRPC message
    //   3. Wraps each write(rawBuffer) into { audioContent: rawBuffer } automatically
    // So we MUST write raw audio Buffers, NOT { audioContent: ... } objects.
    const streamingConfig = {
      config: recognitionConfig,
      interimResults: this.config.enableInterimResults ?? true,
      singleUtterance: this.config.singleUtterance ?? false,
    };

    this.recognizeStream = this.client.streamingRecognize(streamingConfig);

    // Handle transcript results
    this.recognizeStream.on("data", (response: google.cloud.speech.v1.IStreamingRecognizeResponse) => {
      if (!response.results || response.results.length === 0) return;

      for (const result of response.results) {
        if (!result.alternatives || result.alternatives.length === 0) continue;

        const transcript = result.alternatives[0].transcript || "";
        const isFinal = result.isFinal || false;
        const confidence = result.alternatives[0].confidence || undefined;

        if (transcript) {
          log.debug(`📝 Transcript ${isFinal ? "(final)" : "(interim)"}:`, transcript);
          this.callbacks.onTranscript(transcript, isFinal, confidence);
        }
      }
    });

    // Handle errors
    this.recognizeStream.on("error", (error: Error) => {
      // Mark stream as destroyed immediately to stop further writes
      this.streamDestroyed = true;

      // Ignore errors during intentional shutdown
      if (!this.isActive) return;
      
      // Some errors are recoverable (stream timeout, etc.)
      const errorMsg = error.message || "";
      const isRecoverable = 
        errorMsg.includes("DEADLINE_EXCEEDED") ||
        errorMsg.includes("RST_STREAM") ||
        errorMsg.includes("Stream duration") ||
        errorMsg.includes("exceeded") ||
        errorMsg.includes("write after");

      if (isRecoverable) {
        log.debug("🔄 Recoverable STT error, restarting stream:", errorMsg);
        this.restartStream();
      } else {
        log.error("❌ Google STT stream error:", error);
        this.callbacks.onError(error);
      }
    });

    // Handle stream end
    this.recognizeStream.on("end", () => {
      log.debug("📡 Google STT stream ended");
      this.streamDestroyed = true;
      // If still active, this might be a timeout - try restart
      if (this.isActive && !this.restartPending) {
        log.debug("🔄 Stream ended while active, restarting...");
        this.restartStream();
      }
    });

    log.debug("📤 Streaming config sent to Google STT");

    // Set auto-restart timer for the 5-minute limit
    this.clearStreamTimer();
    this.streamTimer = setTimeout(() => {
      if (this.isActive) {
        log.debug("⏰ Stream timeout approaching, restarting...");
        this.restartStream();
      }
    }, STREAM_TIMEOUT_MS);
  }

  private stopStream(): void {
    this.clearStreamTimer();
    this.streamDestroyed = true;

    if (this.recognizeStream) {
      try {
        this.recognizeStream.end();
      } catch (error) {
        // Ignore errors during cleanup
      }
      // Remove all listeners to prevent memory leaks
      this.recognizeStream.removeAllListeners();
      this.recognizeStream = null;
    }
  }

  private restartStream(): void {
    if (this.restartPending || !this.isActive) return;
    
    this.restartPending = true;
    log.debug("🔄 Restarting STT stream...");
    
    this.stopStream();
    
    // Small delay to avoid rapid reconnection
    setTimeout(() => {
      if (this.isActive) {
        try {
          this.startStream();
          this.restartPending = false;
          log.debug("✅ STT stream restarted successfully");
        } catch (error) {
          this.restartPending = false;
          const err = error instanceof Error ? error : new Error(String(error));
          log.error("❌ Failed to restart STT stream:", err);
          this.callbacks.onError(err);
        }
      } else {
        this.restartPending = false;
      }
    }, 100);
  }

  private clearStreamTimer(): void {
    if (this.streamTimer) {
      clearTimeout(this.streamTimer);
      this.streamTimer = null;
    }
  }
}

/**
 * Create a new Google STT session
 */
export function createGoogleSTTSession(
  config: GoogleSTTConfig,
  callbacks: GoogleSTTCallbacks
): GoogleSTTSession {
  return new GoogleSTTSession(config, callbacks);
}
