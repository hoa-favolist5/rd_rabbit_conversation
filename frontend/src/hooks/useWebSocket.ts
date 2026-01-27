"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createLogger } from "@/utils/logger";
import type {
  WSMessage,
  ConversationStatus,
  EmotionType,
  ChatMessage,
} from "@/types";

const log = createLogger("WebSocket");

// Workflow step timing
export interface WorkflowStep {
  step: string;
  name: string;
  nameJa: string;
  durationMs: number;
}

export interface WorkflowTiming {
  steps: WorkflowStep[];
  hasDbSearch: boolean;
  dbSearchTime: number;
  usedTool: boolean;
  totalMs: number;
  // Frontend-measured timings (actual perceived latency)
  timeToFirstResponse?: number;  // Time from send to first text delta
  timeToFirstAudio?: number;     // Time from send to first audio chunk
}

// Legacy timing format (for backwards compatibility)
export interface TimingInfo {
  timings: Array<{ action: string; durationMs: number }>;
  totalMs: number;
}

interface AudioChunk {
  data: string;
  format: string;
  index: number;
  total: number;
  isLast: boolean;
  responseId?: string;  // Used to identify which response this chunk belongs to
}

interface UseWebSocketOptions {
  url: string;
  onAudio?: (audioData: string, format: string, responseId?: string, isProtected?: boolean) => void;
  onAudioChunk?: (chunk: AudioChunk) => void;
  onWaiting?: (index: number) => void;  // Play waiting audio before DB search
  onTranscript?: (text: string, isFinal: boolean) => void;  // Real-time transcription
  onBackendResponse?: () => void;  // Called when any backend response arrives (text or audio)
}

interface UseWebSocketReturn {
  isConnected: boolean;
  status: ConversationStatus;
  emotion: EmotionType;
  statusText: string;
  messages: ChatMessage[];
  error: string | null;
  lastTiming: TimingInfo | null;
  workflowTiming: WorkflowTiming | null;
  sendMessage: (text: string) => void;
  sendAudioData: (data: ArrayBuffer) => void;
  startListening: () => void;
  stopListening: () => void;
}

export function useWebSocket({
  url,
  onAudio,
  onAudioChunk,
  onWaiting,
  onTranscript,
  onBackendResponse,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState<ConversationStatus>("idle");
  const [emotion, setEmotion] = useState<EmotionType>("neutral");
  const [statusText, setStatusText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastTiming, setLastTiming] = useState<TimingInfo | null>(null);
  const [workflowTiming, setWorkflowTiming] = useState<WorkflowTiming | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messageIdRef = useRef(0);
  
  // Timing refs for measuring actual perceived latency
  const requestStartTimeRef = useRef<number | null>(null);
  const firstResponseTimeRef = useRef<number | null>(null);
  const firstAudioTimeRef = useRef<number | null>(null);

  // Generate unique message ID
  const generateId = useCallback(() => {
    messageIdRef.current += 1;
    return `msg-${messageIdRef.current}-${Date.now()}`;
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    log.debug("Connecting to WebSocket:", url);
    const ws = new WebSocket(url);

    ws.onopen = () => {
      log.debug("WebSocket connected");
      setIsConnected(true);
      setError(null);
    };

    ws.onclose = () => {
      log.debug("WebSocket disconnected");
      setIsConnected(false);
      wsRef.current = null;

      // Attempt to reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        log.debug("Attempting to reconnect...");
        connect();
      }, 3000);
    };

    ws.onerror = (event) => {
      log.error("WebSocket error:", event);
      setError("接続エラーが発生しました");
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WSMessage;
        handleMessage(message);
      } catch (err) {
        log.error("Failed to parse message:", err);
      }
    };

    wsRef.current = ws;
  }, [url]);

  // Handle incoming messages
  const handleMessage = useCallback(
    (message: WSMessage) => {
      switch (message.type) {
        case "connected":
          log.debug("Connected:", message.message);
          break;

        case "status":
          setStatus(message.status as ConversationStatus);
          setEmotion(message.emotion as EmotionType);
          setStatusText(message.statusText as string);
          break;

        case "user_message":
          setMessages((prev) => [
            ...prev,
            {
              id: generateId(),
              role: "user",
              content: message.text as string,
              timestamp: new Date(),
            },
          ]);
          break;

        case "assistant_message": {
          const messageId = message.messageId as string | undefined;
          if (messageId) {
            setMessages((prev) => {
              const index = prev.findIndex((m) => m.id === messageId);
              if (index >= 0) {
                const updated = [...prev];
                updated[index] = {
                  ...updated[index],
                  content: message.text as string,
                  emotion: message.emotion as EmotionType,
                };
                return updated;
              }
              return [
                ...prev,
                {
                  id: messageId,
                  role: "assistant",
                  content: message.text as string,
                  emotion: message.emotion as EmotionType,
                  timestamp: new Date(),
                },
              ];
            });
            break;
          }

          setMessages((prev) => [
            ...prev,
            {
              id: generateId(),
              role: "assistant",
              content: message.text as string,
              emotion: message.emotion as EmotionType,
              timestamp: new Date(),
            },
          ]);
          break;
        }

        case "assistant_delta": {
          const messageId = message.messageId as string;
          const delta = message.text as string;
          if (!messageId || !delta) break;

          // Record time to first response (first text delta)
          if (requestStartTimeRef.current && !firstResponseTimeRef.current) {
            firstResponseTimeRef.current = performance.now();
            const ttfr = Math.round(firstResponseTimeRef.current - requestStartTimeRef.current);
            log.debug(`⚡ Time to First Response: ${ttfr}ms`);
            // Notify that backend responded (cancel waiting timer)
            onBackendResponse?.();
          }

          setMessages((prev) => {
            const index = prev.findIndex((m) => m.id === messageId);
            if (index >= 0) {
              const updated = [...prev];
              updated[index] = {
                ...updated[index],
                content: `${updated[index].content}${delta}`,
              };
              return updated;
            }
            return [
              ...prev,
              {
                id: messageId,
                role: "assistant",
                content: delta,
                timestamp: new Date(),
              },
            ];
          });
          break;
        }

        case "audio":
          // Record time to first audio
          if (requestStartTimeRef.current && !firstAudioTimeRef.current) {
            firstAudioTimeRef.current = performance.now();
            const ttfa = Math.round(firstAudioTimeRef.current - requestStartTimeRef.current);
            log.debug(`🔊 Time to First Audio: ${ttfa}ms`);
          }
          // Log audio arrival with responseId
          const audioResponseId = message.responseId as string | undefined;
          log.debug(`📨 Received full audio message (responseId: ${audioResponseId ? audioResponseId.slice(-8) : 'none'})`);
          // Pass audio with responseId for validation
          onAudio?.(message.data as string, message.format as string, audioResponseId);
          break;

        case "audio_chunk":
          // Record time to first audio chunk
          if (requestStartTimeRef.current && !firstAudioTimeRef.current) {
            firstAudioTimeRef.current = performance.now();
            const ttfa = Math.round(firstAudioTimeRef.current - requestStartTimeRef.current);
            log.debug(`🔊 Time to First Audio Chunk: ${ttfa}ms`);
            // Notify that backend responded (cancel waiting timer if not already cancelled)
            onBackendResponse?.();
          }
          onAudioChunk?.({
            data: message.data as string,
            format: message.format as string,
            index: message.index as number,
            total: message.total as number,
            isLast: message.isLast as boolean,
            responseId: message.responseId as string | undefined,
          });
          break;

        case "waiting":
          // Play pre-recorded waiting audio before DB search (DEPRECATED)
          log.debug(`⏳ Waiting signal received: #${message.index}`);
          onWaiting?.(message.index as number);
          break;

        case "long_waiting":
          // Server-streamed long waiting audio (for database queries)
          const longWaitingResponseId = message.responseId as string | undefined;
          log.debug(`⏳ Long waiting received: "${message.text}" (responseId: ${longWaitingResponseId ? longWaitingResponseId.slice(-8) : 'none'})`);
          // Record time to first audio (this counts as audio response)
          if (requestStartTimeRef.current && !firstAudioTimeRef.current) {
            firstAudioTimeRef.current = performance.now();
            const ttfa = Math.round(firstAudioTimeRef.current - requestStartTimeRef.current);
            log.debug(`🔊 Time to Long Waiting Audio: ${ttfa}ms`);
            // Notify that backend responded
            onBackendResponse?.();
          }
          // Play the long waiting audio immediately with responseId and PROTECTED flag
          onAudio?.(message.audio as string, "mp3", longWaitingResponseId, true);
          break;

        case "transcript":
          // Real-time transcription from AWS Transcribe
          onTranscript?.(
            message.text as string,
            message.isFinal as boolean
          );
          break;

        case "processing_voice":
          // Backend started processing voice input - start TTFR timer
          log.debug("🎤 Voice processing started, starting TTFR timer");
          requestStartTimeRef.current = performance.now();
          firstResponseTimeRef.current = null;
          firstAudioTimeRef.current = null;
          break;

        case "error":
          setError(message.message as string);
          break;

        case "timing":
          setLastTiming({
            timings: message.timings as Array<{ action: string; durationMs: number }>,
            totalMs: message.totalMs as number,
          });
          break;

        case "workflow_timing": {
          // Calculate frontend-measured timings
          const timeToFirstResponse = (requestStartTimeRef.current && firstResponseTimeRef.current)
            ? Math.round(firstResponseTimeRef.current - requestStartTimeRef.current)
            : undefined;
          const timeToFirstAudio = (requestStartTimeRef.current && firstAudioTimeRef.current)
            ? Math.round(firstAudioTimeRef.current - requestStartTimeRef.current)
            : undefined;
          
          setWorkflowTiming({
            steps: message.steps as WorkflowStep[],
            hasDbSearch: message.hasDbSearch as boolean,
            dbSearchTime: message.dbSearchTime as number,
            usedTool: message.usedTool as boolean,
            totalMs: message.totalMs as number,
            timeToFirstResponse,
            timeToFirstAudio,
          });
          // Also set legacy timing for backwards compatibility
          setLastTiming({
            timings: (message.steps as WorkflowStep[]).map((s) => ({
              action: s.nameJa,
              durationMs: s.durationMs,
            })),
            totalMs: message.totalMs as number,
          });
          
          // Reset timing refs for next request
          requestStartTimeRef.current = null;
          firstResponseTimeRef.current = null;
          firstAudioTimeRef.current = null;
          break;
        }

        case "pong":
          // Heartbeat response
          break;

        default:
          log.debug("Unknown message type:", message.type);
      }
    },
    [generateId, onAudio, onAudioChunk, onWaiting, onTranscript, onBackendResponse]
  );

  // Send message to server
  const sendMessage = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Start timing for TTFR measurement
      requestStartTimeRef.current = performance.now();
      firstResponseTimeRef.current = null;
      firstAudioTimeRef.current = null;
      
      wsRef.current.send(
        JSON.stringify({
          type: "text_input",
          text,
        })
      );
    }
  }, []);

  // Send audio data (for voice input)
  const sendAudioData = useCallback((data: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Convert ArrayBuffer to base64
      const uint8Array = new Uint8Array(data);
      let binary = "";
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64 = btoa(binary);
      
      wsRef.current.send(
        JSON.stringify({
          type: "audio_data",
          data: base64,
        })
      );
    }
  }, []);

  // Start listening (for voice input)
  const startListening = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "start_listening" }));
    }
  }, []);

  // Stop listening
  const stopListening = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "stop_listening" }));
    }
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Heartbeat to keep connection alive
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return {
    isConnected,
    status,
    emotion,
    statusText,
    messages,
    error,
    lastTiming,
    workflowTiming,
    sendMessage,
    sendAudioData,
    startListening,
    stopListening,
  };
}
