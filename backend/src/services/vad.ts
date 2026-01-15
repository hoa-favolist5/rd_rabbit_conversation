/**
 * Voice Activity Detection (VAD) Service
 * Inspired by TEN Framework's VAD implementation
 * 
 * Key benefits:
 * - Reduces unnecessary STT API calls
 * - Faster turn detection
 * - Lower latency for voice interactions
 */

export interface VADConfig {
  sampleRate: number;
  frameSize: number;
  energyThreshold: number;
  silenceThreshold: number;
  speechMinDurationMs: number;
  silenceMinDurationMs: number;
}

const DEFAULT_CONFIG: VADConfig = {
  sampleRate: 16000,
  frameSize: 512, // ~32ms at 16kHz
  energyThreshold: 0.01,
  silenceThreshold: 0.005,
  speechMinDurationMs: 100,
  silenceMinDurationMs: 300,
};

export type VADState = "silence" | "speech" | "uncertain";

export interface VADResult {
  state: VADState;
  energy: number;
  speechDurationMs: number;
  silenceDurationMs: number;
  isSpeechStart: boolean;
  isSpeechEnd: boolean;
}

export class VoiceActivityDetector {
  private config: VADConfig;
  private state: VADState = "silence";
  private speechStartTime: number | null = null;
  private silenceStartTime: number | null = null;
  private lastSpeechTime: number = 0;
  private frameCount: number = 0;

  constructor(config: Partial<VADConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Calculate RMS energy of audio frame
   */
  private calculateEnergy(samples: Float32Array | Int16Array): number {
    let sum = 0;
    const isInt16 = samples instanceof Int16Array;
    
    for (let i = 0; i < samples.length; i++) {
      // Normalize Int16 to Float32 range [-1, 1]
      const sample = isInt16 ? samples[i] / 32768 : samples[i];
      sum += sample * sample;
    }
    
    return Math.sqrt(sum / samples.length);
  }

  /**
   * Process an audio frame and detect voice activity
   */
  processFrame(samples: Float32Array | Int16Array): VADResult {
    const now = performance.now();
    const energy = this.calculateEnergy(samples);
    this.frameCount++;

    const frameDurationMs = (samples.length / this.config.sampleRate) * 1000;
    
    let isSpeechStart = false;
    let isSpeechEnd = false;
    const previousState = this.state;

    if (energy > this.config.energyThreshold) {
      // Voice activity detected
      if (this.state !== "speech") {
        if (this.speechStartTime === null) {
          this.speechStartTime = now;
        }
        
        const speechDuration = now - this.speechStartTime;
        if (speechDuration >= this.config.speechMinDurationMs) {
          if (previousState === "silence") {
            isSpeechStart = true;
          }
          this.state = "speech";
          this.lastSpeechTime = now;
          this.silenceStartTime = null;
        } else {
          this.state = "uncertain";
        }
      } else {
        this.lastSpeechTime = now;
        this.silenceStartTime = null;
      }
    } else if (energy < this.config.silenceThreshold) {
      // Silence detected
      if (this.state === "speech" || this.state === "uncertain") {
        if (this.silenceStartTime === null) {
          this.silenceStartTime = now;
        }
        
        const silenceDuration = now - this.silenceStartTime;
        if (silenceDuration >= this.config.silenceMinDurationMs) {
          if (previousState === "speech") {
            isSpeechEnd = true;
          }
          this.state = "silence";
          this.speechStartTime = null;
        }
      }
    }

    const speechDurationMs = this.speechStartTime 
      ? now - this.speechStartTime 
      : 0;
    const silenceDurationMs = this.silenceStartTime 
      ? now - this.silenceStartTime 
      : 0;

    return {
      state: this.state,
      energy,
      speechDurationMs,
      silenceDurationMs,
      isSpeechStart,
      isSpeechEnd,
    };
  }

  /**
   * Reset VAD state
   */
  reset(): void {
    this.state = "silence";
    this.speechStartTime = null;
    this.silenceStartTime = null;
    this.lastSpeechTime = 0;
    this.frameCount = 0;
  }

  /**
   * Get current state
   */
  getState(): VADState {
    return this.state;
  }
}

/**
 * Simple energy-based VAD for quick speech detection
 * Useful for determining if audio buffer contains speech before sending to STT
 */
export function hasVoiceActivity(
  samples: Float32Array | Int16Array,
  threshold: number = 0.01
): boolean {
  let sum = 0;
  const isInt16 = samples instanceof Int16Array;
  
  for (let i = 0; i < samples.length; i++) {
    const sample = isInt16 ? samples[i] / 32768 : samples[i];
    sum += sample * sample;
  }
  
  const rms = Math.sqrt(sum / samples.length);
  return rms > threshold;
}

export default VoiceActivityDetector;
