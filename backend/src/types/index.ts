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
  messageId?: string;
  domain?: DomainType;
  archiveItem?: ArchiveItemInfo;  // Structured item info for archiving
  searchResults?: SearchResults;  // All search results (movies or gourmet)
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

export interface SetUserInfoMessage extends WSMessage {
  type: "set_user_info";
  userId?: string;
  userName?: string;
  userToken?: string;
}

// Save to archive message
export interface SaveArchiveMessage extends WSMessage {
  type: "save_archive";
  userId: string;
  domain: DomainType;
  itemId: string;
  itemTitle?: string;
  itemData?: Record<string, unknown>;
}

// Load conversation history message
export interface LoadHistoryMessage extends WSMessage {
  type: "load_history";
  userId: string;
  limit?: number;
}

// History loaded response
export interface HistoryLoadedMessage extends WSMessage {
  type: "history_loaded";
  history: ConversationTurn[];
}

// Request greeting message
export interface RequestGreetingMessage extends WSMessage {
  type: "request_greeting";
}

// Domain types for conversation context
export type DomainType = "movie" | "gourmet" | "general";

// Conversation history
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  domain?: DomainType;
  emotion?: EmotionType;
}

// Database conversation history record
export interface ConversationHistoryRecord {
  id: number;
  session_id: string;
  user_id?: string;
  user_name?: string;
  user_token?: string;
  role: "user" | "assistant";
  content: string;
  domain: DomainType;
  emotion?: string;
  created_at: Date;
}

// Movie database types
export interface Movie {
  id: number | null;
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

// Gourmet restaurant database types
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

export interface GourmetSearchResult {
  restaurants: GourmetRestaurant[];
  total: number;
}

// Claude tool types
export interface MovieSearchInput {
  query: string;
  genre?: string;
  year?: number;
}

export interface GourmetSearchInput {
  query: string;
  area?: string;
  cuisine?: string;
}

// Azure TTS types
export interface TTSOptions {
  voice?: "female" | "male";
  emotion?: EmotionType;
  speed?: number;
}
