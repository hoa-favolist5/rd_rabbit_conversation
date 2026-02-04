"use client";

import React, { useEffect, useRef, memo, useCallback, useMemo } from "react";
import type { ChatMessage, EmotionType, DomainType, ArchiveItemInfo, FriendMatch, SearchResults as SearchResultsType } from "@/types";
import { useArchiveStorage } from "@/hooks/useArchiveStorage";
import styles from "./ChatHistory.module.css";

interface ChatHistoryProps {
  messages: ChatMessage[];
  userId: string | null;
  onSaveToArchive?: (userId: string, domain: DomainType, itemId: string, itemTitle?: string, itemData?: Record<string, unknown>) => void;
  /** If true, show only text messages (hide search results) */
  textOnly?: boolean;
}

// Move constant outside component to avoid recreation on each render
const EMOJI_MAP: Record<EmotionType, string> = {
  neutral: "😐",
  happy: "😊",
  excited: "🤩",
  thinking: "🤔",
  sad: "😢",
  surprised: "😲",
  confused: "😕",
  listening: "👂",
  speaking: "🗣️",
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Memoized message item - only re-renders when content/isSaved changes
interface MessageItemProps {
  messageId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isSaved: boolean;
  canSave: boolean;
  onSave: () => void;
  archiveItem?: ArchiveItemInfo;
  friendsMatched: FriendMatch[];
  searchResults?: SearchResultsType;
  userId: string | null;
  onSaveToArchive?: (userId: string, domain: DomainType, itemId: string, itemTitle?: string, itemData?: Record<string, unknown>) => void;
  isSavedFn: (itemId: string, domain: DomainType) => boolean;
  getFriendsMatchedFn: (itemId: string, domain: DomainType) => FriendMatch[];
  archiveVersion: number; // Version number to force re-renders when archive changes
  textOnly?: boolean; // If true, render only text (no search results)
}

const MessageItem = memo(
  function MessageItem({ 
    role, 
    content, 
    timestamp, 
    isSaved, 
    canSave, 
    onSave, 
    archiveItem, 
    friendsMatched,
    searchResults,
    userId,
    onSaveToArchive,
    isSavedFn,
    getFriendsMatchedFn,
    archiveVersion, // Used to detect archive changes
    textOnly = false, // Default to showing all content
  }: MessageItemProps) {
    // Check if this is a movie/gourmet message with search results
    const hasSearchResults = role === "assistant" && searchResults && searchResults.total > 0;

    // In textOnly mode, always render as text bubble (no search results cards)
    // Show indicator that results are in the side panel
    if (textOnly && hasSearchResults) {
      return (
        <div
          className={`${styles.message} ${styles.assistant}`}
        >
          <div className={styles.bubble}>
            <span className={styles.content}>
              {content || (searchResults.type === "movie" ? "🎬 映画の検索結果があります →" : "🍽️ グルメの検索結果があります →")}
            </span>
          </div>
          <div className={styles.timestamp}>{formatTime(timestamp)}</div>
        </div>
      );
    }

    return (
      <div
        className={`${styles.message} ${
          role === "user" ? styles.user : styles.assistant
        }`}
      >
        {/* Regular text bubble */}
        <div className={styles.bubble}>
          <span className={styles.content}>{content}</span>
          {(canSave || isSaved) && (
            <button
              className={styles.saveButton}
              onClick={onSave}
              title={isSaved ? "保存済み" : "アーカイブに保存"}
              disabled={isSaved}
            >
              {isSaved ? "✓" : "📚"}
            </button>
          )}
        </div>
        <div className={styles.timestamp}>{formatTime(timestamp)}</div>
      </div>
    );
  },
  // Custom comparison - skip onSave comparison since it's stable per itemId
  (prev, next) => {
    // Check if friendsMatched array changed
    const friendsChanged = prev.friendsMatched.length !== next.friendsMatched.length ||
      prev.friendsMatched.some((f, i) => f.id !== next.friendsMatched[i]?.id);
    
    // Check if search results changed (simplified - just check total and type)
    const searchResultsChanged = 
      prev.searchResults?.total !== next.searchResults?.total ||
      prev.searchResults?.type !== next.searchResults?.type;
    
    // Check if archive changed (this will force re-render of all MovieCards)
    const archiveChanged = prev.archiveVersion !== next.archiveVersion;
    
    return (
      prev.messageId === next.messageId &&
      prev.content === next.content &&
      prev.isSaved === next.isSaved &&
      prev.canSave === next.canSave &&
      prev.role === next.role &&
      prev.textOnly === next.textOnly &&
      prev.archiveItem?.itemId === next.archiveItem?.itemId &&
      !friendsChanged &&  // Re-render if friends changed
      !searchResultsChanged &&  // Re-render if search results changed
      !archiveChanged  // Re-render if archive changed (for multiple MovieCards)
      // Intentionally skip onSave, timestamp, and function comparisons
    );
  }
);

// Empty handler for messages without archive capability
const noopHandler = () => {};

export function ChatHistory({ messages, userId, onSaveToArchive, textOnly = false }: ChatHistoryProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  // Cache handlers by itemId to maintain referential stability
  const handlerCacheRef = useRef<Map<string, () => void>>(new Map());

  // SINGLE SOURCE OF TRUTH: Use archiveStorage hook for saved state and friends
  // items array is used as dependency to trigger re-renders when storage changes
  const { items: archiveItems, isSaved, getFriendsMatched } = useArchiveStorage();

  // Auto-scroll to bottom on new messages only
  const prevMessagesLengthRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length]);

  // Create or get cached handler for an item
  const getHandler = useCallback((
    itemId: string,
    itemTitle: string | undefined,
    itemDomain: DomainType,
    itemData: Record<string, unknown> | undefined,
    content: string,
    emotion: EmotionType | undefined,
    timestamp: Date
  ): (() => void) => {
    // Return cached handler if exists
    const cached = handlerCacheRef.current.get(itemId);
    if (cached) return cached;

    // Create new handler and cache it
    const handler = () => {
      if (!userId || isSaved(itemId, itemDomain)) return;

      if (onSaveToArchive) {
        onSaveToArchive(userId, itemDomain, itemId, itemTitle, {
          ...itemData,
          content,
          emotion,
          timestamp: timestamp.toISOString(),
        });
      }
    };

    handlerCacheRef.current.set(itemId, handler);
    return handler;
  }, [userId, onSaveToArchive, isSaved]);

  // Clean up stale handlers when messages change significantly
  useEffect(() => {
    const currentItemIds = new Set(
      messages
        .filter(m => m.archiveItem?.itemId)
        .map(m => m.archiveItem!.itemId)
    );

    // Remove handlers for items no longer in messages
    for (const itemId of handlerCacheRef.current.keys()) {
      if (!currentItemIds.has(itemId)) {
        handlerCacheRef.current.delete(itemId);
      }
    }
  }, [messages]);

  // Deduplicate messages by ID to prevent echo/repeat rendering
  // MUST be before early return to maintain hook order
  const uniqueMessages = useMemo(() => {
    const seen = new Set<string>();
    const unique: typeof messages = [];
    
    for (const message of messages) {
      if (!seen.has(message.id)) {
        seen.add(message.id);
        unique.push(message);
      } else {
        console.warn(`⚠️ Duplicate message detected and removed: ${message.id}`);
      }
    }
    
    return unique;
  }, [messages]);

  // Create a version number based on archive items to trigger re-renders
  // This ensures all MovieCards update when any item is saved
  // MUST be before early return to maintain hook order
  const archiveVersion = useMemo(() => {
    return archiveItems.length + archiveItems.filter(item => item.savedAt).length;
  }, [archiveItems]);

  // Debug: Log if we have duplicates
  useEffect(() => {
    if (uniqueMessages.length !== messages.length) {
      console.error(`🚨 Message duplication detected! Total: ${messages.length}, Unique: ${uniqueMessages.length}`);
    }
  }, [messages.length, uniqueMessages.length]);

  if (messages.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          会話を開始してください...
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {uniqueMessages.map((message) => {
        const archiveItem = message.archiveItem;
        const itemId = archiveItem?.itemId;
        const itemDomain = archiveItem?.itemDomain;

        // Get state from archiveStorage (single source of truth)
        const itemIsSaved = itemId && itemDomain ? isSaved(itemId, itemDomain) : false;
        const friendsMatched = itemId && itemDomain ? getFriendsMatched(itemId, itemDomain) : [];

        const canSave = message.role === "assistant" &&
                        !!archiveItem &&
                        !!userId &&
                        !!onSaveToArchive &&
                        !itemIsSaved;

        const handleSave = archiveItem
          ? getHandler(
              archiveItem.itemId,
              archiveItem.itemTitle,
              archiveItem.itemDomain,
              archiveItem.itemData,
              message.content,
              message.emotion,
              message.timestamp
            )
          : noopHandler;

        return (
          <MessageItem
            key={message.id}
            messageId={message.id}
            role={message.role}
            content={message.content}
            timestamp={message.timestamp}
            isSaved={itemIsSaved}
            canSave={canSave}
            onSave={handleSave}
            archiveItem={archiveItem}
            friendsMatched={friendsMatched}
            searchResults={message.searchResults}
            userId={userId}
            onSaveToArchive={onSaveToArchive}
            isSavedFn={isSaved}
            getFriendsMatchedFn={getFriendsMatched}
            archiveVersion={archiveVersion}
            textOnly={textOnly}
          />
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
