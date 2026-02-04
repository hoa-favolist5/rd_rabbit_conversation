"use client";

import React, { memo, useMemo } from "react";
import type { ChatMessage, DomainType, ArchiveItemInfo, FriendMatch, SearchResults as SearchResultsType } from "@/types";
import { MovieCard } from "./MovieCard";
import { GourmetCard } from "./GourmetCard";
import { useArchiveStorage } from "@/hooks/useArchiveStorage";
import styles from "./SearchResultsPanel.module.css";

interface SearchResultsPanelProps {
  messages: ChatMessage[];
  userId: string | null;
  onSaveToArchive?: (userId: string, domain: DomainType, itemId: string, itemTitle?: string, itemData?: Record<string, unknown>) => void;
}

/**
 * SearchResultsPanel - Renders movie/gourmet search results in a dedicated panel
 * 
 * This component displays the latest search results from assistant messages.
 * It is separate from ChatHistory which only shows text messages.
 */
export const SearchResultsPanel = memo(function SearchResultsPanel({
  messages,
  userId,
  onSaveToArchive,
}: SearchResultsPanelProps) {
  // Get archive state
  const { items: archiveItems, isSaved, getFriendsMatched } = useArchiveStorage();
  
  // Find the latest message with search results
  const latestSearchResult = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "assistant" && msg.searchResults && msg.searchResults.total > 0) {
        return msg;
      }
    }
    return null;
  }, [messages]);

  // Create version for re-render detection
  const archiveVersion = useMemo(() => {
    return archiveItems.length + archiveItems.filter(item => item.savedAt).length;
  }, [archiveItems]);

  if (!latestSearchResult || !latestSearchResult.searchResults) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🔍</div>
          <p className={styles.emptyText}>検索結果がここに表示されます</p>
          <p className={styles.emptySubtext}>映画やグルメを検索してみてください</p>
        </div>
      </div>
    );
  }

  const { searchResults, content } = latestSearchResult;

  return (
    <div className={styles.container}>
      {/* Header with assistant's comment */}
      {content && (
        <div className={styles.assistantComment}>
          <span className={styles.commentIcon}>💬</span>
          <span>{content}</span>
        </div>
      )}
      
      {/* Results header */}
      <div className={styles.resultsHeader}>
        <h3 className={styles.resultsTitle}>
          {searchResults.type === "movie" ? "🎬 検索結果" : "🍽️ 検索結果"}
        </h3>
        <span className={styles.resultsCount}>{searchResults.total}件</span>
      </div>
      
      {/* Results grid */}
      <div className={styles.resultsGrid}>
        {searchResults.type === "movie" && searchResults.movies?.map((movie) => {
          const itemId = movie.id?.toString() || `movie-${Date.now()}-${Math.random()}`;
          const itemIsSaved = isSaved(itemId, "movie");
          const itemFriendsMatched = itemIsSaved ? getFriendsMatched(itemId, "movie") : [];
          
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
          const itemIsSaved = isSaved(itemId, "gourmet");
          const itemFriendsMatched = itemIsSaved ? getFriendsMatched(itemId, "gourmet") : [];
          
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
    </div>
  );
});
