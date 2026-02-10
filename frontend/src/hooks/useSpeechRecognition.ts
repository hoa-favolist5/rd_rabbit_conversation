/**
 * Unified Speech Recognition Hook
 * Uses AWS Transcribe with automatic fallback to Web Speech API
 */

import { useState, useCallback, useEffect } from "react";
import { useAWSTranscribe, type TranscribeConfig } from "./useAWSTranscribe";
import { useWebSpeechFallback, isWebSpeechSupported } from "./useWebSpeechFallback";
import { createLogger } from "@/utils/logger";

const log = createLogger("SpeechRecognition");

export interface UseSpeechRecognitionOptions {
  config: TranscribeConfig;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onError?: (error: Error) => void;
  onStart?: () => void;
  onStop?: () => void;
  enableFallback?: boolean; // Enable Web Speech API fallback (default: true)
  inactivityTimeout?: number;
  stopOnTabHidden?: boolean;
}

export interface UseSpeechRecognitionReturn {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  startListening: () => Promise<void>;
  stopListening: () => void;
  error: Error | null;
  provider: "aws" | "webspeech" | "none";
  fallbackAvailable: boolean;
}

/**
 * Unified speech recognition hook with automatic fallback
 */
export function useSpeechRecognition({
  config,
  onTranscript,
  onError,
  onStart,
  onStop,
  enableFallback = true,
  inactivityTimeout,
  stopOnTabHidden,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionReturn {
  const [provider, setProvider] = useState<"aws" | "webspeech" | "none">("aws");
  const [awsFailed, setAwsFailed] = useState(false);

  // AWS Transcribe (primary)
  const awsTranscribe = useAWSTranscribe({
    config,
    onTranscript,
    onStart: () => {
      setProvider("aws");
      onStart?.();
    },
    onStop,
    onError: (error) => {
      log.error("AWS Transcribe error:", error);
      onError?.(error);
      
      // Mark AWS as failed for this session
      if (!awsFailed) {
        setAwsFailed(true);
        log.warn("AWS Transcribe failed, will attempt fallback on next start");
      }
    },
    inactivityTimeout,
    stopOnTabHidden,
  });

  // Web Speech API (fallback)
  const webSpeech = useWebSpeechFallback({
    languageCode: config.languageCode,
    onTranscript,
    onStart: () => {
      setProvider("webspeech");
      onStart?.();
    },
    onStop,
    onError: (error) => {
      log.error("Web Speech error:", error);
      onError?.(error);
    },
  });

  const fallbackAvailable = enableFallback && webSpeech.isSupported;

  // Unified start function with fallback logic
  const startListening = useCallback(async () => {
    // Try AWS Transcribe first (unless it previously failed)
    if (!awsFailed) {
      try {
        log.debug("🎯 Starting AWS Transcribe (primary)");
        await awsTranscribe.startListening();
        return;
      } catch (error) {
        log.error("AWS Transcribe failed to start:", error);
        setAwsFailed(true);
        
        // Continue to fallback if available
      }
    }

    // Fallback to Web Speech API
    if (fallbackAvailable) {
      log.warn("⚠️ AWS Transcribe unavailable, using Web Speech API fallback");
      webSpeech.startListening();
    } else {
      const error = new Error(
        "Speech recognition unavailable: AWS Transcribe failed and Web Speech API not supported"
      );
      log.error(error.message);
      onError?.(error);
    }
  }, [awsFailed, awsTranscribe, webSpeech, fallbackAvailable, onError]);

  // Unified stop function
  const stopListening = useCallback(() => {
    if (awsTranscribe.isListening) {
      awsTranscribe.stopListening();
    }
    if (webSpeech.isListening) {
      webSpeech.stopListening();
    }
  }, [awsTranscribe, webSpeech]);

  // Determine active provider and state
  const isListening = awsTranscribe.isListening || webSpeech.isListening;
  const transcript = awsTranscribe.isListening ? awsTranscribe.transcript : webSpeech.transcript;
  const interimTranscript = awsTranscribe.isListening 
    ? awsTranscribe.interimTranscript 
    : webSpeech.interimTranscript;
  const error = awsTranscribe.error || webSpeech.error;

  // Update provider state
  useEffect(() => {
    if (awsTranscribe.isListening) {
      setProvider("aws");
    } else if (webSpeech.isListening) {
      setProvider("webspeech");
    } else {
      setProvider("none");
    }
  }, [awsTranscribe.isListening, webSpeech.isListening]);

  return {
    isListening,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    error,
    provider,
    fallbackAvailable,
  };
}
