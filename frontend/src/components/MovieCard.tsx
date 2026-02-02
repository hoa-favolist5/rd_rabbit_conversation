"use client";

import React, { memo } from "react";
import type { ArchiveItemInfo, FriendMatch } from "@/types";
import styles from "./MovieCard.module.css";

interface MovieCardProps {
  archiveItem: ArchiveItemInfo;
  isSaved: boolean;
  onSave: () => void;
  friendsMatched: FriendMatch[];
}

export const MovieCard = memo(
  function MovieCard({ archiveItem, isSaved, onSave, friendsMatched }: MovieCardProps) {
  const { itemTitle, itemData, itemDomain } = archiveItem;
  
  // Determine if this is a movie or gourmet item
  const isMovie = itemDomain === "movie";
  const isGourmet = itemDomain === "gourmet";
  
  // Extract movie details
  const titleEn = itemData?.title_en;
  const releaseYear = itemData?.release_year as number | undefined;
  const rating = itemData?.rating as number | undefined;
  
  // Extract gourmet details
  const address = itemData?.address as string | undefined;
  const catchCopy = itemData?.catch_copy as string | undefined;
  const openHours = itemData?.open_hours as string | undefined;
  const access = itemData?.access as string | undefined;
  const urlsPc = itemData?.urls_pc as string | undefined;
  
  // Helper to safely extract string from i18n object or return as-is
  const getDisplayText = (value: unknown): string | undefined => {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null && 'ja' in value) {
      return (value as { ja: string }).ja;
    }
    return undefined;
  };

  const displayTitle = getDisplayText(itemTitle);
  const displayTitleEn = getDisplayText(titleEn);

  const handleAppointment = (friend: FriendMatch) => {
    // TODO: Implement appointment logic
    console.log(`Requesting appointment with ${friend.name} (${friend.id})`);
  };

  return (
    <div className={styles.movieCard}>
      <div className={styles.header}>
        <div className={styles.posterPlaceholder}>
          <span className={styles.posterIcon}>{isGourmet ? "🍽️" : "🎬"}</span>
        </div>
        <div className={styles.info}>
          <h3 className={styles.title}>{displayTitle}</h3>
          
          {/* Movie-specific fields */}
          {isMovie && displayTitleEn && <p className={styles.titleEn}>{displayTitleEn}</p>}
          
          {/* Gourmet-specific fields */}
          {isGourmet && catchCopy && <p className={styles.catchCopy}>{catchCopy}</p>}
          
          <div className={styles.metadata}>
            {/* Movie metadata */}
            {isMovie && releaseYear && (
              <span className={styles.year}>
                <span className={styles.icon}>📅</span> {releaseYear}年
              </span>
            )}
            {isMovie && rating !== undefined && (
              <span className={styles.rating}>
                <span className={styles.icon}>⭐</span> {Number(rating).toFixed(1)}
              </span>
            )}
            
            {/* Gourmet metadata */}
            {isGourmet && address && (
              <span className={styles.address}>
                <span className={styles.icon}>📍</span> {address}
              </span>
            )}
          </div>
          
          {/* Gourmet additional info */}
          {isGourmet && access && (
            <div className={styles.detail}>
              <span className={styles.label}>アクセス:</span>
              <span className={styles.value}>{access}</span>
            </div>
          )}
          {isGourmet && openHours && (
            <div className={styles.detail}>
              <span className={styles.label}>営業時間:</span>
              <span className={styles.value}>{openHours}</span>
            </div>
          )}
          {isGourmet && urlsPc && (
            <div className={styles.link}>
              <a href={urlsPc} target="_blank" rel="noopener noreferrer">
                詳細を見る →
              </a>
            </div>
          )}
        </div>
        <button
          className={`${styles.saveButton} ${isSaved ? styles.saved : ""}`}
          onClick={onSave}
          disabled={isSaved}
          title={isSaved ? "保存済み" : "アーカイブに保存"}
        >
          {isSaved ? "✓" : "📚"}
        </button>
      </div>
      
      {/* Friend appointment buttons */}
      {friendsMatched.length > 0 && (
        <div className={styles.friendsSection}>
          <p className={styles.friendsTitle}>
            <span className={styles.friendsIcon}>👥</span>
            この作品を保存している友達:
          </p>
          <div className={styles.friendButtons}>
            {friendsMatched.map((friend) => (
              <button
                key={friend.id}
                className={styles.appointmentButton}
                onClick={() => handleAppointment(friend)}
                title={`${friend.name}さんと予約する`}
              >
                <span className={styles.appointmentIcon}>📅</span>
                {friend.name}さんと予約
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
  },
  // Custom comparison to detect friendsMatched changes
  (prev, next) => {
    // Check if friendsMatched array changed
    const friendsChanged = 
      prev.friendsMatched.length !== next.friendsMatched.length ||
      prev.friendsMatched.some((f, i) => f.id !== next.friendsMatched[i]?.id);
    
    return (
      prev.archiveItem.itemId === next.archiveItem.itemId &&
      prev.isSaved === next.isSaved &&
      !friendsChanged  // Re-render if friends changed
      // Skip onSave comparison (function reference changes but behavior is same)
    );
  }
);
