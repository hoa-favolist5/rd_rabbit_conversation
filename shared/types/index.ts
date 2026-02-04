/**
 * Shared Types for Rabbit AI Communication Protocol
 * 
 * This file defines the contract between frontend and backend.
 * Both sides import from this file to ensure type safety.
 * 
 * Pattern Overview:
 * ================
 * 
 * Backend → Frontend:
 *   - ResponseMessage: Main content (rabbit state, text, component, context)
 *   - StatusMessage: State updates only (rabbit emotion/status)
 *   - AudioMessage: Voice output (full or chunked)
 *   - ErrorMessage: Structured errors with recovery info
 * 
 * Frontend → Backend:
 *   - VoiceEventMessage: All user interactions (text, voice, archive, etc.)
 */

// ============================================================================
// Base Types
// ============================================================================

/**
 * Emotion types for Rabbit avatar
 */
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

/**
 * Conversation status (what rabbit is doing)
 */
export type ConversationStatus = "idle" | "listening" | "thinking" | "speaking";

/**
 * Domain types for conversation context
 */
export type DomainType = "movie" | "gourmet" | "general";

/**
 * Component types that can be rendered
 */
export type ComponentType = 
  | "movie_list" 
  | "gourmet_list" 
  | "archive_confirm" 
  | "friend_match"
  | null;

/**
 * Error codes for structured error handling
 */
export type ErrorCode = 
  | "NETWORK_ERROR"
  | "AUTH_ERROR" 
  | "TTS_ERROR"
  | "DB_ERROR"
  | "RATE_LIMIT"
  | "VALIDATION_ERROR"
  | "UNKNOWN_ERROR";

/**
 * Event names for frontend → backend messages
 */
export type EventName = 
  | "text_input"
  | "start_listening"
  | "stop_listening"
  | "save_archive"
  | "load_history"
  | "request_greeting"
  | "set_user_info"
  | "ping";

/**
 * Action types for events
 */
export type EventAction = "send" | "start" | "stop" | "save" | "load" | "request";

// ============================================================================
// Base Message Interface
// ============================================================================

/**
 * Base interface for all WebSocket messages
 */
export interface WSBaseMessage {
  type: string;
  timestamp?: number;      // Unix timestamp (optional for tracking)
  responseId?: string;     // For tracking related messages (barge-in, audio)
}

// ============================================================================
// Data Structures
// ============================================================================

/**
 * Movie data structure
 */
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

/**
 * Gourmet restaurant data structure
 */
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

/**
 * Friend match information
 */
export interface FriendMatch {
  id: string;
  name: string;
}

/**
 * Archive item information (for saving to archive)
 */
export interface ArchiveItemInfo {
  itemId: string;
  itemTitle: string;
  itemDomain: DomainType;
  itemData?: Record<string, unknown>;
}

/**
 * User context for personalization
 */
export interface UserContext {
  userId: number;
  nickName: string;
  age?: number;
  gender?: string;
  province?: string;
  introduction?: string;
  interests?: string[];
}

/**
 * Conversation turn for history
 */
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  domain?: DomainType;
  emotion?: EmotionType;
}

// ============================================================================
// Component Data Structures
// ============================================================================

/**
 * Movie list component data
 */
export interface MovieListData {
  movies: Movie[];
  total: number;
  query?: string;
}

/**
 * Gourmet list component data
 */
export interface GourmetListData {
  restaurants: GourmetRestaurant[];
  total: number;
  query?: string;
  area?: string;
}

/**
 * Archive confirm component data
 */
export interface ArchiveConfirmData {
  itemId: string;
  itemTitle: string;
  domain: DomainType;
  saved: boolean;
  message: string;
}

/**
 * Friend match component data
 */
export interface FriendMatchData {
  friends: FriendMatch[];
  itemTitle: string;
  domain: DomainType;
}

/**
 * Search results (union of movie/gourmet)
 */
export interface SearchResults {
  type: "movie" | "gourmet";
  movies?: Movie[];
  restaurants?: GourmetRestaurant[];
  total: number;
}

// ============================================================================
// Backend → Frontend Messages
// ============================================================================

/**
 * Response message - Main content from backend
 * 
 * This is the primary message type for assistant responses.
 * It contains:
 * - rabbit: Character state (emotion, status)
 * - text: Response content (supports streaming)
 * - component: Optional UI component to render
 * - context: Conversation context
 * - extra: Additional metadata
 */
export interface ResponseMessage extends WSBaseMessage {
  type: "response";
  
  /** Rabbit character state */
  rabbit: {
    emotion: EmotionType;
    status: ConversationStatus;
  };
  
  /** Text content */
  text: {
    content: string;
    isStreaming: boolean;  // true = delta update, false = complete
    messageId: string;     // For tracking streaming updates
  };
  
  /** Component to render (optional) */
  component?: {
    type: ComponentType;
    data: MovieListData | GourmetListData | ArchiveConfirmData | FriendMatchData | null;
  };
  
  /** Conversation context (optional) */
  context?: {
    domain: DomainType;
    intent?: string;  // What user wanted (for debugging)
  };
  
  /** Extra metadata (optional, extensible) */
  extra?: {
    archiveItem?: ArchiveItemInfo;
    timing?: WorkflowTiming;
    [key: string]: unknown;
  };
}

/**
 * Status message - State updates only
 * 
 * Used for lightweight status updates without full response data.
 */
export interface StatusMessage extends WSBaseMessage {
  type: "status";
  
  /** Rabbit character state */
  rabbit: {
    emotion: EmotionType;
    status: ConversationStatus;
  };
  
  /** Human-readable status (for debugging UI) */
  statusText?: string;
}

/**
 * Audio message - Voice output
 * 
 * Supports both full audio and chunked streaming.
 */
export interface AudioMessage extends WSBaseMessage {
  type: "audio";
  
  /** Audio data */
  audio: {
    data: string;           // base64 encoded
    format: "mp3" | "wav";
    isChunked: boolean;     // true = use chunk info
    chunk?: {
      index: number;
      total: number;
      isLast: boolean;
    };
    isProtected: boolean;   // true = cannot be interrupted (waiting audio)
  };
  
  /** Text being spoken (optional, for captions) */
  text?: string;
}

/**
 * Error message - Structured error
 */
export interface ErrorMessage extends WSBaseMessage {
  type: "error";
  
  /** Error details */
  error: {
    code: ErrorCode;
    message: string;
    recoverable: boolean;  // Can user retry?
  };
}

/**
 * Connected message - Initial connection confirmation
 */
export interface ConnectedMessage extends WSBaseMessage {
  type: "connected";
  sessionId: string;
  message: string;
}

/**
 * User message echo - Echo of user input
 */
export interface UserMessageEcho extends WSBaseMessage {
  type: "user_message";
  text: string;
  domain?: DomainType;
}

/**
 * History loaded response
 */
export interface HistoryLoadedMessage extends WSBaseMessage {
  type: "history_loaded";
  history: ConversationTurn[];
}

/**
 * Archive saved response
 */
export interface ArchiveSavedMessage extends WSBaseMessage {
  type: "archive_saved";
  success: boolean;
  message: string;
  itemId: string;
  domain: DomainType;
  friends_matched?: FriendMatch[];
}

/**
 * User info set response
 */
export interface UserInfoSetMessage extends WSBaseMessage {
  type: "user_info_set";
  success: boolean;
  user?: UserContext;
  error?: string;
}

/**
 * Workflow timing information
 */
export interface WorkflowTiming {
  steps: Array<{
    step: string;
    name: string;
    nameJa: string;
    durationMs: number;
  }>;
  hasDbSearch: boolean;
  dbSearchTime: number;
  usedTool: boolean;
  totalMs: number;
}

/**
 * Workflow timing message
 */
export interface WorkflowTimingMessage extends WSBaseMessage {
  type: "workflow_timing";
  steps: WorkflowTiming["steps"];
  hasDbSearch: boolean;
  dbSearchTime: number;
  usedTool: boolean;
  totalMs: number;
}

/**
 * Pong message - Heartbeat response
 */
export interface PongMessage extends WSBaseMessage {
  type: "pong";
}

// ============================================================================
// Frontend → Backend Messages
// ============================================================================

/**
 * Voice event message - All user interactions
 * 
 * This is the unified message type for all frontend → backend communication.
 * Using a single message type simplifies the protocol and makes it easier
 * to add new event types.
 */
export interface VoiceEventMessage extends WSBaseMessage {
  type: "voice_event";
  
  /** Context information */
  context: {
    userId?: string;
    sessionId?: string;
    domain?: DomainType;
  };
  
  /** Event information */
  event: {
    name: EventName;
    action: EventAction;
  };
  
  /** Text content (for text_input) */
  text?: string;
  
  /** Parameters (for specific events) */
  params?: {
    // For save_archive
    itemId?: string;
    itemTitle?: string;
    itemData?: Record<string, unknown>;
    domain?: DomainType;
    
    // For load_history
    limit?: number;
    
    [key: string]: unknown;
  };
  
  /** Extra metadata (extensible) */
  extra?: Record<string, unknown>;
}

// ============================================================================
// Legacy Message Types (for backward compatibility)
// ============================================================================

/**
 * Legacy WSMessage interface
 * @deprecated Use specific message types instead
 */
export interface WSMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Legacy assistant message
 * @deprecated Use ResponseMessage instead
 */
export interface AssistantMessage extends WSMessage {
  type: "assistant_message";
  text: string;
  emotion: EmotionType;
  messageId?: string;
  domain?: DomainType;
  archiveItem?: ArchiveItemInfo;
  searchResults?: SearchResults;
}

/**
 * Legacy assistant delta (streaming)
 * @deprecated Use ResponseMessage with text.isStreaming=true instead
 */
export interface AssistantDeltaMessage extends WSMessage {
  type: "assistant_delta";
  text: string;
  messageId: string;
}

/**
 * Legacy audio chunk message
 * @deprecated Use AudioMessage with audio.isChunked=true instead
 */
export interface AudioChunkMessage extends WSMessage {
  type: "audio_chunk";
  data: string;
  format: string;
  index: number;
  total: number;
  isLast: boolean;
  responseId?: string;
}

/**
 * Legacy long waiting message
 * @deprecated Use AudioMessage with audio.isProtected=true instead
 */
export interface LongWaitingMessage extends WSMessage {
  type: "long_waiting";
  audio: string;
  text: string;
  responseId?: string;
}

/**
 * Legacy text input message
 * @deprecated Use VoiceEventMessage instead
 */
export interface TextInputMessage extends WSMessage {
  type: "text_input";
  text: string;
}

/**
 * Legacy set user info message
 * @deprecated Use VoiceEventMessage instead
 */
export interface SetUserInfoMessage extends WSMessage {
  type: "set_user_info";
  userId?: string;
  userName?: string;
  userToken?: string;
}

/**
 * Legacy save archive message
 * @deprecated Use VoiceEventMessage instead
 */
export interface SaveArchiveMessage extends WSMessage {
  type: "save_archive";
  userId: string;
  domain: DomainType;
  itemId: string;
  itemTitle?: string;
  itemData?: Record<string, unknown>;
}

/**
 * Legacy load history message
 * @deprecated Use VoiceEventMessage instead
 */
export interface LoadHistoryMessage extends WSMessage {
  type: "load_history";
  userId: string;
  limit?: number;
}

/**
 * Legacy request greeting message
 * @deprecated Use VoiceEventMessage instead
 */
export interface RequestGreetingMessage extends WSMessage {
  type: "request_greeting";
}

// ============================================================================
// Chat Message (Frontend UI)
// ============================================================================

/**
 * Chat message for UI display
 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  emotion?: EmotionType;
  timestamp: Date;
  domain?: DomainType;
  messageId?: string;
  archiveItem?: ArchiveItemInfo;
  searchResults?: SearchResults;
}

// ============================================================================
// Emotion Display (Frontend UI)
// ============================================================================

/**
 * Emotion display data for UI
 */
export interface EmotionDisplay {
  face: string;
  label: string;
  color: string;
}

/**
 * Emotion display mapping
 */
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

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if message is a ResponseMessage
 */
export function isResponseMessage(msg: WSBaseMessage): msg is ResponseMessage {
  return msg.type === "response";
}

/**
 * Check if message is a StatusMessage
 */
export function isStatusMessage(msg: WSBaseMessage): msg is StatusMessage {
  return msg.type === "status";
}

/**
 * Check if message is an AudioMessage
 */
export function isAudioMessage(msg: WSBaseMessage): msg is AudioMessage {
  return msg.type === "audio";
}

/**
 * Check if message is an ErrorMessage
 */
export function isErrorMessage(msg: WSBaseMessage): msg is ErrorMessage {
  return msg.type === "error";
}

/**
 * Check if message is a VoiceEventMessage
 */
export function isVoiceEventMessage(msg: WSBaseMessage): msg is VoiceEventMessage {
  return msg.type === "voice_event";
}

// ============================================================================
// Message Builders (Helper functions)
// ============================================================================

/**
 * Create a ResponseMessage
 */
export function createResponseMessage(
  emotion: EmotionType,
  status: ConversationStatus,
  content: string,
  messageId: string,
  isStreaming: boolean = false,
  options?: {
    component?: ResponseMessage["component"];
    context?: ResponseMessage["context"];
    extra?: ResponseMessage["extra"];
    responseId?: string;
  }
): ResponseMessage {
  return {
    type: "response",
    timestamp: Date.now(),
    responseId: options?.responseId,
    rabbit: { emotion, status },
    text: { content, isStreaming, messageId },
    component: options?.component,
    context: options?.context,
    extra: options?.extra,
  };
}

/**
 * Create a StatusMessage
 */
export function createStatusMessage(
  emotion: EmotionType,
  status: ConversationStatus,
  statusText?: string
): StatusMessage {
  return {
    type: "status",
    timestamp: Date.now(),
    rabbit: { emotion, status },
    statusText,
  };
}

/**
 * Create an AudioMessage
 */
export function createAudioMessage(
  data: string,
  format: "mp3" | "wav",
  options?: {
    isChunked?: boolean;
    chunk?: { index: number; total: number; isLast: boolean };
    isProtected?: boolean;
    text?: string;
    responseId?: string;
  }
): AudioMessage {
  return {
    type: "audio",
    timestamp: Date.now(),
    responseId: options?.responseId,
    audio: {
      data,
      format,
      isChunked: options?.isChunked ?? false,
      chunk: options?.chunk,
      isProtected: options?.isProtected ?? false,
    },
    text: options?.text,
  };
}

/**
 * Create an ErrorMessage
 */
export function createErrorMessage(
  code: ErrorCode,
  message: string,
  recoverable: boolean = true
): ErrorMessage {
  return {
    type: "error",
    timestamp: Date.now(),
    error: { code, message, recoverable },
  };
}

/**
 * Create a VoiceEventMessage
 */
export function createVoiceEventMessage(
  name: EventName,
  action: EventAction,
  options?: {
    userId?: string;
    sessionId?: string;
    domain?: DomainType;
    text?: string;
    params?: VoiceEventMessage["params"];
    extra?: Record<string, unknown>;
  }
): VoiceEventMessage {
  return {
    type: "voice_event",
    timestamp: Date.now(),
    context: {
      userId: options?.userId,
      sessionId: options?.sessionId,
      domain: options?.domain,
    },
    event: { name, action },
    text: options?.text,
    params: options?.params,
    extra: options?.extra,
  };
}
