// Emotion types for Rabbit avatar
export type EmotionType =
  | "neutral"
  | "happy"
  | "excited"
  | "thinking"
  | "sad"
  | "surprised"
  | "confused"
  | "listening"
  | "speaking";

// Conversation status
export type ConversationStatus = "idle" | "listening" | "thinking" | "speaking";

// WebSocket message types
export interface WSMessage {
  type: string;
  [key: string]: unknown;
}

export interface StatusMessage {
  type: "status";
  status: ConversationStatus;
  emotion: EmotionType;
  statusText: string;
}

export interface UserMessage {
  type: "user_message";
  text: string;
}

export interface AssistantMessage {
  type: "assistant_message";
  text: string;
  emotion: EmotionType;
}

export interface AudioMessage {
  type: "audio";
  data: string; // base64 encoded
  format: string;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export interface TimingMessage {
  type: "timing";
  timings: Array<{ action: string; durationMs: number }>;
  totalMs: number;
}

export interface ConnectedMessage {
  type: "connected";
  sessionId: string;
  message: string;
}

// Chat message for UI
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  emotion?: EmotionType;
  timestamp: Date;
}

// Emotion display data
export interface EmotionDisplay {
  face: string;
  label: string;
  color: string;
}

export const EMOTIONS: Record<EmotionType, EmotionDisplay> = {
  neutral: { face: "(・ω・)", label: "普通", color: "#6B7280" },
  happy: { face: "(◕‿◕)", label: "嬉しい", color: "#F59E0B" },
  excited: { face: "(★▽★)", label: "ワクワク", color: "#EF4444" },
  thinking: { face: "(・_・?)", label: "考え中", color: "#06B6D4" },
  sad: { face: "(´・ω・`)", label: "悲しい", color: "#6B7280" },
  surprised: { face: "(°o°)", label: "驚き", color: "#F59E0B" },
  confused: { face: "(・・?)", label: "困惑", color: "#8B5CF6" },
  listening: { face: "(・ω・)🎤", label: "聞いています", color: "#10B981" },
  speaking: { face: "(・ω・)♪", label: "話しています", color: "#3B82F6" },
};
