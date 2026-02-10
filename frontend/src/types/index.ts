/**
 * Frontend Types
 * 
 * Re-exports shared types and adds frontend-specific types.
 * This ensures type consistency between frontend and backend.
 */

// Re-export all shared types
export * from "@rabbit/shared";

// Import for local use
import type {
  EmotionType,
  DomainType,
  ArchiveItemInfo,
  SearchResults,
  FriendMatch,
  WSBaseMessage,
} from "@rabbit/shared";

// Re-export EMOTIONS constant
export { EMOTIONS } from "@rabbit/shared";

// ============================================================================
// Frontend-Specific Types
// ============================================================================

/**
 * Audio chunk received from backend
 */
export interface AudioChunk {
  data: string;
  format: string;
  index: number;
  total: number;
  isLast: boolean;
  responseId?: string;
  sentence?: string;  // Sentence text for synchronized text+audio display
}

/**
 * Workflow step timing
 */
export interface WorkflowStep {
  step: string;
  name: string;
  nameJa: string;
  durationMs: number;
}

/**
 * Workflow timing with frontend-measured timings
 */
export interface WorkflowTimingWithFrontend {
  steps: WorkflowStep[];
  hasDbSearch: boolean;
  dbSearchTime: number;
  usedTool: boolean;
  totalMs: number;
  // Frontend-measured timings (actual perceived latency)
  timeToFirstResponse?: number;  // Time from send to first text delta
  timeToFirstAudio?: number;     // Time from send to first audio chunk
}

/**
 * Legacy timing format (for backwards compatibility)
 */
export interface TimingInfo {
  timings: Array<{ action: string; durationMs: number }>;
  totalMs: number;
}

/**
 * Archive item with save status
 */
export interface ArchiveItemWithStatus {
  itemId: string;
  domain: DomainType;
  savedAt?: Date;
  friendsMatched?: FriendMatch[];
}

// ============================================================================
// WebSocket Hook Options
// ============================================================================

/**
 * Options for useWebSocket hook
 */
export interface UseWebSocketOptions {
  url: string;
  onAudio?: (audioData: string, format: string, responseId?: string, isProtected?: boolean) => void;
  onAudioChunk?: (chunk: AudioChunk) => void;
  onWaiting?: (index: number) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onBackendResponse?: () => void;
}

/**
 * Return type for useWebSocket hook
 */
export interface UseWebSocketReturn {
  isConnected: boolean;
  status: import("@rabbit/shared").ConversationStatus;
  emotion: EmotionType;
  statusText: string;
  messages: import("@rabbit/shared").ChatMessage[];
  error: string | null;
  lastTiming: TimingInfo | null;
  workflowTiming: WorkflowTimingWithFrontend | null;
  userId: string | null;
  historyLoaded: boolean;
  sendMessage: (text: string) => void;
  sendAudioData: (data: ArrayBuffer) => void;
  startListening: () => void;
  stopListening: () => void;
  requestRandomUser: () => void;
  loadHistory: (userId: string, limit?: number) => void;
  requestGreeting: () => void;
  saveToArchive: (userId: string, domain: DomainType, itemId: string, itemTitle?: string, itemData?: Record<string, unknown>) => void;
}
