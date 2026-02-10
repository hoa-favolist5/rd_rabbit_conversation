/**
 * Backend Types
 * 
 * Re-exports shared types and adds backend-specific types.
 * This ensures type consistency between frontend and backend.
 */

// Re-export all shared types
export * from "@rabbit/shared";

// Import specific types for extending
import type {
  EmotionType,
  DomainType,
  ConversationTurn,
  Movie,
  GourmetRestaurant,
  WSBaseMessage,
  ResponseMessage,
  StatusMessage,
  AudioMessage,
  ErrorMessage,
  VoiceEventMessage,
} from "@rabbit/shared";

// ============================================================================
// Backend-Specific Types
// ============================================================================

/**
 * Database conversation history record
 */
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

/**
 * Movie search result
 */
export interface MovieSearchResult {
  movies: Movie[];
  total: number;
}

/**
 * Gourmet search result
 */
export interface GourmetSearchResult {
  restaurants: GourmetRestaurant[];
  total: number;
}

/**
 * Claude tool types - Movie search input
 */
export interface MovieSearchInput {
  query: string;
  genre?: string;
  year?: number;
}

/**
 * Claude tool types - Gourmet search input
 */
export interface GourmetSearchInput {
  query: string;
  area?: string;
  cuisine?: string;
}

/**
 * Azure TTS options
 */
export interface TTSOptions {
  voice?: "female" | "male";
  emotion?: EmotionType;
  speed?: number;
}

/**
 * Emotion state (with color)
 */
export interface EmotionState {
  emotion: EmotionType;
  label: string;
  color: string;
}

// ============================================================================
// Legacy Type Aliases (for backward compatibility during migration)
// ============================================================================

// These aliases allow gradual migration without breaking existing code

/** @deprecated Use WSBaseMessage from @rabbit/shared */
export type WSMessage = WSBaseMessage & { [key: string]: unknown };

/** @deprecated Use StatusMessage from @rabbit/shared */
export interface LegacyStatusMessage extends WSBaseMessage {
  type: "status";
  status: import("@rabbit/shared").ConversationStatus;
  emotion: EmotionType;
  statusText: string;
}

/** @deprecated Use ResponseMessage from @rabbit/shared */
export interface LegacyAssistantMessage extends WSBaseMessage {
  type: "assistant_message";
  text: string;
  emotion: EmotionType;
  messageId?: string;
  domain?: DomainType;
  archiveItem?: import("@rabbit/shared").ArchiveItemInfo;
  searchResults?: import("@rabbit/shared").SearchResults;
}

/** @deprecated Use AudioMessage from @rabbit/shared */
export interface LegacyAudioChunkMessage extends WSBaseMessage {
  type: "audio_chunk";
  data: string;
  format: string;
  index: number;
  total: number;
  isLast: boolean;
  responseId?: string;
}

/** @deprecated Use AudioMessage with isProtected=true from @rabbit/shared */
export interface LegacyLongWaitingMessage extends WSBaseMessage {
  type: "long_waiting";
  audio: string;
  text: string;
  responseId?: string;
}

/** @deprecated Use ErrorMessage from @rabbit/shared */
export interface LegacyErrorMessage extends WSBaseMessage {
  type: "error";
  message: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert legacy status message to new format
 */
export function toLegacyStatusMessage(
  status: import("@rabbit/shared").ConversationStatus,
  emotion: EmotionType,
  statusText: string
): LegacyStatusMessage {
  return {
    type: "status",
    status,
    emotion,
    statusText,
  };
}

/**
 * Convert legacy assistant message to new format
 */
export function toLegacyAssistantMessage(
  text: string,
  emotion: EmotionType,
  options?: {
    messageId?: string;
    domain?: DomainType;
    archiveItem?: import("@rabbit/shared").ArchiveItemInfo;
    searchResults?: import("@rabbit/shared").SearchResults;
  }
): LegacyAssistantMessage {
  return {
    type: "assistant_message",
    text,
    emotion,
    ...(options?.messageId && { messageId: options.messageId }),
    ...(options?.domain && { domain: options.domain }),
    ...(options?.archiveItem && { archiveItem: options.archiveItem }),
    ...(options?.searchResults && { searchResults: options.searchResults }),
  };
}
