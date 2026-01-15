"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  WSMessage,
  ConversationStatus,
  EmotionType,
  ChatMessage,
} from "@/types";

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
}

// Legacy timing format (for backwards compatibility)
export interface TimingInfo {
  timings: Array<{ action: string; durationMs: number }>;
  totalMs: number;
}

interface UseWebSocketOptions {
  url: string;
  onAudio?: (audioData: string, format: string) => void;
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
  startListening: () => void;
  stopListening: () => void;
}

export function useWebSocket({
  url,
  onAudio,
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

    console.log("Connecting to WebSocket:", url);
    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log("WebSocket connected");
      setIsConnected(true);
      setError(null);
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setIsConnected(false);
      wsRef.current = null;

      // Attempt to reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log("Attempting to reconnect...");
        connect();
      }, 3000);
    };

    ws.onerror = (event) => {
      console.error("WebSocket error:", event);
      setError("接続エラーが発生しました");
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WSMessage;
        handleMessage(message);
      } catch (err) {
        console.error("Failed to parse message:", err);
      }
    };

    wsRef.current = ws;
  }, [url]);

  // Handle incoming messages
  const handleMessage = useCallback(
    (message: WSMessage) => {
      switch (message.type) {
        case "connected":
          console.log("Connected:", message.message);
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
          onAudio?.(message.data as string, message.format as string);
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

        case "workflow_timing":
          setWorkflowTiming({
            steps: message.steps as WorkflowStep[],
            hasDbSearch: message.hasDbSearch as boolean,
            dbSearchTime: message.dbSearchTime as number,
            usedTool: message.usedTool as boolean,
            totalMs: message.totalMs as number,
          });
          // Also set legacy timing for backwards compatibility
          setLastTiming({
            timings: (message.steps as WorkflowStep[]).map((s) => ({
              action: s.nameJa,
              durationMs: s.durationMs,
            })),
            totalMs: message.totalMs as number,
          });
          break;

        case "pong":
          // Heartbeat response
          break;

        default:
          console.log("Unknown message type:", message.type);
      }
    },
    [generateId, onAudio]
  );

  // Send message to server
  const sendMessage = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "text_input",
          text,
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
    startListening,
    stopListening,
  };
}
