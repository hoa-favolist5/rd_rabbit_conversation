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
  messageId?: string;
  domain?: DomainType;
  archiveItem?: ArchiveItemInfo;
  searchResults?: SearchResults;  // All search results (movies or gourmet)
}

// Movie data structure
export interface Movie {
  id: number | null;
  title_ja: string;
  title_en: string | null;
  description: string | null;
  release_year: number | null;
  rating: number | null;
  director: string | null;
  actors: string[];
}

// Gourmet restaurant data structure
export interface GourmetRestaurant {
  id: number | null;
  code: string | null;
  name: string;
  name_short: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  catch_copy: string | null;
  capacity: number | null;
  access: string | null;
  urls_pc: string | null;
  open_hours: string | null;
  close_days: string | null;
  budget_id: number | null;
}

// Search results for displaying all items found
export interface SearchResults {
  type: "movie" | "gourmet";
  movies?: Movie[];
  restaurants?: GourmetRestaurant[];
  total: number;
}

// Archive item information (for saving to archive)
export interface ArchiveItemInfo {
  itemId: string;       // Actual movie/gourmet ID (not messageId)
  itemTitle: string;    // Movie title or restaurant name
  itemDomain: DomainType;
  itemData?: Record<string, unknown>;  // Additional metadata
}

export interface AssistantDeltaMessage {
  type: "assistant_delta";
  text: string;
  messageId: string;
}

export interface AudioMessage {
  type: "audio";
  data: string; // base64 encoded
  format: string;
  responseId?: string; // Track which response this audio belongs to
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export interface TranscriptMessage {
  type: "transcript";
  text: string;
  isFinal: boolean;
}

export interface TimingMessage {
  type: "timing";
  timings: Array<{ action: string; durationMs: number }>;
  totalMs: number;
}

export interface LongWaitingMessage {
  type: "long_waiting";
  audio: string; // base64 encoded audio
  text: string;  // The waiting phrase text
  responseId?: string; // Track which response this waiting audio belongs to
}

export interface ConnectedMessage {
  type: "connected";
  sessionId: string;
  message: string;
}

// Domain types for conversation context
export type DomainType = "movie" | "gourmet" | "general";

// Save to archive message
export interface SaveArchiveMessage {
  type: "save_archive";
  userId: string;
  domain: DomainType;
  itemId: string;
  itemTitle?: string;
  itemData?: Record<string, unknown>;
}

// Friend match information
export interface FriendMatch {
  id: string;
  name: string;
}

// Archive saved response
export interface ArchiveSavedMessage {
  type: "archive_saved";
  success: boolean;
  message: string;
  itemId: string;
  domain: DomainType;
  friends_matched?: FriendMatch[];
}

// Load conversation history message
export interface LoadHistoryMessage {
  type: "load_history";
  userId: string;
  limit?: number;
}

// History loaded response
export interface HistoryLoadedMessage {
  type: "history_loaded";
  history: Array<{
    role: "user" | "assistant";
    content: string;
    domain?: DomainType;
    emotion?: EmotionType;
  }>;
}

// Request greeting message
export interface RequestGreetingMessage {
  type: "request_greeting";
}

// Chat message for UI
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  emotion?: EmotionType;
  timestamp: Date;
  domain?: DomainType;
  messageId?: string;
  archiveItem?: ArchiveItemInfo;  // Structured item info for archiving
  searchResults?: SearchResults;  // All search results (movies or gourmet)
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
