/**
 * AWS Transcribe hook - Frontend direct integration
 * Handles real-time speech-to-text with AWS Transcribe Streaming
 */

import { useState, useRef, useCallback, useEffect } from "react";
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} from "@aws-sdk/client-transcribe-streaming";
import {
  AudioCaptureManager,
  AudioStreamGenerator,
} from "@/utils/audioUtils";
import { createLogger } from "@/utils/logger";

const log = createLogger("AWSTranscribe");

export interface TranscribeConfig {
  region: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  languageCode: string;
  sampleRate: number;
}

export interface UseAWSTranscribeOptions {
  config: TranscribeConfig;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onError?: (error: Error) => void;
  onStart?: () => void;
  onStop?: () => void;
}

export interface UseAWSTranscribeReturn {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  startListening: () => Promise<void>;
  stopListening: () => void;
  error: Error | null;
}

export function useAWSTranscribe({
  config,
  onTranscript,
  onError,
  onStart,
  onStop,
}: UseAWSTranscribeOptions): UseAWSTranscribeReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<Error | null>(null);

  const audioCapture = useRef<AudioCaptureManager | null>(null);
  const audioStream = useRef<AudioStreamGenerator | null>(null);
  const transcribeClient = useRef<TranscribeStreamingClient | null>(null);
  const abortController = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  // Stop listening function - defined first to avoid circular dependency
  const stopListening = useCallback(() => {
    log.debug("🛑 Stopping AWS Transcribe...");

    // Abort ongoing transcription
    if (abortController.current) {
      abortController.current.abort();
      abortController.current = null;
    }

    // Stop audio capture
    if (audioCapture.current) {
      audioCapture.current.stop();
      audioCapture.current = null;
    }

    // Close audio stream
    if (audioStream.current) {
      audioStream.current.close();
      audioStream.current = null;
    }

    // Destroy transcribe client
    if (transcribeClient.current) {
      transcribeClient.current.destroy();
      transcribeClient.current = null;
    }

    setIsListening(false);
    onStop?.();
  }, [onStop]);

  const startListening = useCallback(async () => {
    if (isListening) return;

    try {
      log.debug("🎙️ Starting AWS Transcribe (frontend-direct)...");
      setError(null);
      setTranscript("");
      setInterimTranscript("");

      // Validate configuration
      if (!config.credentials.accessKeyId || !config.credentials.secretAccessKey) {
        throw new Error(
          "AWS credentials not configured. Please set NEXT_PUBLIC_AWS_ACCESS_KEY_ID and NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY in .env.local"
        );
      }

      if (config.credentials.accessKeyId === "your_access_key_here" ||
          config.credentials.accessKeyId === "YOUR_ACCESS_KEY_HERE") {
        throw new Error(
          "AWS credentials are placeholder values. Please replace with actual credentials in .env.local"
        );
      }

      log.debug("📋 AWS Config:", {
        region: config.region,
        languageCode: config.languageCode,
        sampleRate: config.sampleRate,
        hasCredentials: !!(config.credentials.accessKeyId && config.credentials.secretAccessKey),
      });

      // Create abort controller for cleanup
      abortController.current = new AbortController();

      // Create Transcribe client
      transcribeClient.current = new TranscribeStreamingClient({
        region: config.region,
        credentials: {
          accessKeyId: config.credentials.accessKeyId,
          secretAccessKey: config.credentials.secretAccessKey,
        },
      });

      // Create audio stream generator
      audioStream.current = new AudioStreamGenerator();

      // Create audio capture manager
      audioCapture.current = new AudioCaptureManager({
        sampleRate: config.sampleRate,
        channelCount: 1,
      });

      // Start audio capture
      await audioCapture.current.start((audioData) => {
        // Push audio data to stream
        audioStream.current?.push(audioData);
      });

      setIsListening(true);
      onStart?.();

      // Start transcription stream
      const command = new StartStreamTranscriptionCommand({
        LanguageCode: config.languageCode as any,
        MediaEncoding: "pcm",
        MediaSampleRateHertz: config.sampleRate,
        AudioStream: audioStream.current,
        EnablePartialResultsStabilization: true,
        PartialResultsStability: "low",
      });

      log.debug("🎙️ AWS Transcribe stream starting...");
      const response = await transcribeClient.current.send(command);

      if (!response.TranscriptResultStream) {
        throw new Error("No transcript stream returned");
      }

      log.debug("✅ AWS Transcribe connected, SessionId:", response.SessionId);

      // Process transcription results
      for await (const event of response.TranscriptResultStream) {
        // Check if aborted
        if (abortController.current?.signal.aborted) {
          log.debug("🛑 Transcription aborted");
          break;
        }

        if (event.TranscriptEvent?.Transcript?.Results) {
          for (const result of event.TranscriptEvent.Transcript.Results) {
            if (result.Alternatives && result.Alternatives.length > 0) {
              const text = result.Alternatives[0].Transcript || "";
              const isFinal = !result.IsPartial;

              if (text) {
                log.debug(
                  `📝 Transcript ${isFinal ? "(final)" : "(interim)"}:`,
                  text
                );

                if (isFinal) {
                  setTranscript(text);
                  setInterimTranscript("");
                  onTranscript?.(text, true);
                } else {
                  setInterimTranscript(text);
                  onTranscript?.(text, false);
                }
              }
            }
          }
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      log.error("❌ AWS Transcribe error:", error);
      
      // Enhanced error messages for common issues
      let userMessage = error.message;
      
      if (error.message.includes("credentials") || error.message.includes("InvalidSignatureException")) {
        userMessage = "AWS credentials are invalid. Please check your NEXT_PUBLIC_AWS_ACCESS_KEY_ID and NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY in .env.local";
      } else if (error.message.includes("UnrecognizedClientException")) {
        userMessage = "AWS credentials not recognized. Please verify your AWS Access Key ID and Secret Access Key are correct.";
      } else if (error.message.includes("BadRequestException")) {
        userMessage = "AWS Transcribe rejected the request. Check that your region supports Japanese (use us-west-2 or ap-northeast-1).";
      } else if (error.message.includes("throttl") || error.message.includes("rate")) {
        userMessage = "AWS rate limit exceeded. Please wait a moment and try again.";
      } else if (error.message.includes("network") || error.message.includes("fetch")) {
        userMessage = "Network error connecting to AWS. Check your internet connection.";
      }
      
      const enhancedError = new Error(userMessage);
      enhancedError.stack = error.stack;
      
      log.error("📋 Debug Info:", {
        originalError: error.message,
        errorName: error.name,
        errorStack: error.stack,
        region: config.region,
        languageCode: config.languageCode,
      });
      
      setError(enhancedError);
      onError?.(enhancedError);
    } finally {
      // Cleanup
      stopListening();
    }
  }, [isListening, config, onTranscript, onError, onStart, stopListening]);

  return {
    isListening,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    error,
  };
}
