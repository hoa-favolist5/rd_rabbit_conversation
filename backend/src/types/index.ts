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

export interface EmotionState {
  emotion: EmotionType;
  label: string;
  color: string;
}

// Conversation status
export type ConversationStatus = "idle" | "listening" | "thinking" | "speaking";

// WebSocket message types
export interface WSMessage {
  type: string;
  [key: string]: unknown;
}

export interface StatusMessage extends WSMessage {
  type: "status";
  status: ConversationStatus;
  emotion: EmotionType;
  statusText: string;
}

export interface UserMessage extends WSMessage {
  type: "user_message";
  text: string;
}

export interface AssistantMessage extends WSMessage {
  type: "assistant_message";
  text: string;
  emotion: EmotionType;
}

export interface ErrorMessage extends WSMessage {
  type: "error";
  message: string;
}

export interface TranscriptMessage extends WSMessage {
  type: "transcript";
  text: string;
  isFinal: boolean;
}

export interface AudioDataMessage extends WSMessage {
  type: "audio_data";
  data: string; // base64 encoded audio
}

// Chunked audio for parallel TTS streaming
export interface AudioChunkMessage extends WSMessage {
  type: "audio_chunk";
  data: string; // base64 encoded audio chunk
  format: string;
  index: number;
  total: number;
  isLast: boolean;
  responseId?: string; // Track which response this chunk belongs to
}

// Long waiting audio - streamed during database operations
export interface LongWaitingMessage extends WSMessage {
  type: "long_waiting";
  audio: string; // base64 encoded audio
  text: string;  // The waiting phrase text
  responseId?: string; // Track which response this waiting audio belongs to
}

// Control messages from client
export interface StartListeningMessage extends WSMessage {
  type: "start_listening";
}

export interface StopListeningMessage extends WSMessage {
  type: "stop_listening";
}

export interface TextInputMessage extends WSMessage {
  type: "text_input";
  text: string;
}

// Conversation history
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

// Movie database types
export interface Movie {
  id: number;
  title_ja: string;
  title_en: string | null;
  description: string | null;
  // genre: string[];
  release_year: number | null;
  rating: number | null;
  director: string | null;
  actors: string[];
}

export interface MovieSearchResult {
  movies: Movie[];
  total: number;
}

// Claude tool types
export interface MovieSearchInput {
  query: string;
  genre?: string;
  year?: number;
}

// Azure TTS types
export interface TTSOptions {
  voice?: "female" | "male";
  emotion?: EmotionType;
  speed?: number;
}
