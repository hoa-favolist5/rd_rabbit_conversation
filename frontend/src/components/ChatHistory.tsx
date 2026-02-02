"use client";

import React, { useEffect, useRef, memo, useCallback, useMemo } from "react";
import type { ChatMessage, EmotionType, DomainType, ArchiveItemInfo, FriendMatch, SearchResults as SearchResultsType } from "@/types";
import { MovieCard } from "./MovieCard";
import { GourmetCard } from "./GourmetCard";
import { useArchiveStorage } from "@/hooks/useArchiveStorage";
import styles from "./ChatHistory.module.css";

interface ChatHistoryProps {
  messages: ChatMessage[];
  userId: string | null;
  onSaveToArchive?: (userId: string, domain: DomainType, itemId: string, itemTitle?: string, itemData?: Record<string, unknown>) => void;
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
  }: MessageItemProps) {
    // Check if this is a movie/gourmet message with search results
    const hasSearchResults = role === "assistant" && searchResults && searchResults.total > 0;

    return (
      <div
        className={`${styles.message} ${
          role === "user" ? styles.user : styles.assistant
        }`}
      >
        {hasSearchResults ? (
          // Render all search results as MovieCards
          <div className={styles.searchResultsWrapper}>
            {content && (
              <div className={styles.assistantComment}>
                <span className={styles.commentIcon}>💬</span>
                <span>{content}</span>
              </div>
            )}
            
            <div className={styles.resultsHeader}>
              <h3 className={styles.resultsTitle}>
                {searchResults.type === "movie" ? "🎬 検索結果" : "🍽️ 検索結果"}
              </h3>
              <span className={styles.resultsCount}>{searchResults.total}件</span>
            </div>
            
            <div className={styles.resultsGrid}>
              {searchResults.type === "movie" && searchResults.movies?.map((movie) => {
                const itemId = movie.id?.toString() || `movie-${Date.now()}-${Math.random()}`;
                const itemIsSaved = isSavedFn(itemId, "movie");
                const itemFriendsMatched = itemIsSaved ? getFriendsMatchedFn(itemId, "movie") : [];
                
                const movieArchiveItem: ArchiveItemInfo = {
                  itemId,
                  itemTitle: movie.title_ja,
                  itemDomain: "movie",
                  itemData: {
                    title_en: movie.title_en,
                    description: movie.description,
                    release_year: movie.release_year,
                    rating: movie.rating,
                    director: movie.director,
                    actors: movie.actors,
                  },
                };
                
                return (
                  <MovieCard
                    key={itemId}
                    archiveItem={movieArchiveItem}
                    isSaved={itemIsSaved}
                    onSave={() => {
                      if (userId && onSaveToArchive && !itemIsSaved) {
                        onSaveToArchive(userId, "movie", itemId, movie.title_ja, movieArchiveItem.itemData);
                      }
                    }}
                    friendsMatched={itemFriendsMatched}
                  />
                );
              })}
              
              {searchResults.type === "gourmet" && searchResults.restaurants?.map((restaurant) => {
                const itemId = restaurant.id?.toString() || `gourmet-${Date.now()}-${Math.random()}`;
                const itemIsSaved = isSavedFn(itemId, "gourmet");
                const itemFriendsMatched = itemIsSaved ? getFriendsMatchedFn(itemId, "gourmet") : [];
                
                const gourmetArchiveItem: ArchiveItemInfo = {
                  itemId,
                  itemTitle: restaurant.name,
                  itemDomain: "gourmet",
                  itemData: {
                    code: restaurant.code,
                    name_short: restaurant.name_short,
                    address: restaurant.address,
                    catch_copy: restaurant.catch_copy,
                    urls_pc: restaurant.urls_pc,
                    open_hours: restaurant.open_hours,
                    close_days: restaurant.close_days,
                    access: restaurant.access,
                    capacity: restaurant.capacity,
                    lat: restaurant.lat,
                    lng: restaurant.lng,
                    budget_id: restaurant.budget_id,
                  },
                };
                
                return (
                  <GourmetCard
                    key={itemId}
                    archiveItem={gourmetArchiveItem}
                    isSaved={itemIsSaved}
                    onSave={() => {
                      if (userId && onSaveToArchive && !itemIsSaved) {
                        onSaveToArchive(userId, "gourmet", itemId, restaurant.name, gourmetArchiveItem.itemData);
                      }
                    }}
                    friendsMatched={itemFriendsMatched}
                  />
                );
              })}
            </div>
            
            <div className={styles.timestamp}>{formatTime(timestamp)}</div>
          </div>
        ) : (
          // Regular text bubble for non-search messages
          <>
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
          </>
        )}
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

export function ChatHistory({ messages, userId, onSaveToArchive }: ChatHistoryProps) {
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
          />
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
