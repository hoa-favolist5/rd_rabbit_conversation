"use client";

import React, { useMemo } from "react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import type { ConversationStatus } from "@/types";
import styles from "./RabbitAvatar.module.css";

interface RabbitAvatarProps {
  emotion: string;
  status: ConversationStatus;
  statusText: string;
  isConnected: boolean;
}

// Map status to Lottie animation files - focus on 3 main states
const STATUS_TO_LOTTIE: Record<ConversationStatus, string> = {
  idle: "/character/idle.lottie",
  listening: "/character/listen.lottie",
  thinking: "/character/thinking.lottie",
  speaking: "/character/talk.lottie",
};

// Status colors - distinct colors for each state
const STATUS_COLORS: Record<ConversationStatus, string> = {
  idle: "#94a3b8",
  listening: "#34d399",  // Green - actively receiving input
  thinking: "#22d3ee",   // Cyan - processing
  speaking: "#60a5fa",   // Blue - outputting response
};

// Status labels in Japanese
const STATUS_LABELS: Record<ConversationStatus, string> = {
  idle: "待機中",
  listening: "聞いています...",
  thinking: "考え中...",
  speaking: "話しています...",
};

// Status icons
const STATUS_ICONS: Record<ConversationStatus, string> = {
  idle: "",
  listening: "🎤",
  thinking: "💭",
  speaking: "🔊",
};

export function RabbitAvatar({
  status,
  statusText,
  isConnected,
}: RabbitAvatarProps) {
  const lottieSrc = STATUS_TO_LOTTIE[status];
  const accentColor = STATUS_COLORS[status];
  const statusIcon = STATUS_ICONS[status];

  // Memoize lottie key to prevent unnecessary re-renders
  const lottieKey = useMemo(() => `${status}-${lottieSrc}`, [status, lottieSrc]);

  // Determine if in active state (not idle)
  const isActive = status !== "idle";

  return (
    <div 
      className={`${styles.container} ${isActive ? styles.active : ""}`}
      style={{
        borderColor: isActive ? `${accentColor}60` : undefined,
      }}
    >
      {/* Connection status badge */}
      <div className={`${styles.connectionBadge} ${isConnected ? styles.connected : styles.disconnected}`}>
        <span className={styles.connectionDot} />
        {isConnected ? "接続中" : "未接続"}
      </div>

      {/* Lottie Character Animation */}
      <div className={styles.characterWrapper}>
        {/* Glow effect based on status */}
        <div 
          className={`${styles.characterGlow} ${isActive ? styles.glowActive : ""}`}
          style={{ 
            boxShadow: isActive 
              ? `0 0 80px ${accentColor}50, 0 0 160px ${accentColor}30` 
              : `0 0 40px ${accentColor}20`
          }}
        />
        <DotLottieReact
          key={lottieKey}
          src={lottieSrc}
          loop
          autoplay
          className={styles.character}
        />
      </div>

      {/* Status indicator - prominent display */}
      <div className={styles.statusSection}>
        <div 
          className={`${styles.statusIndicator} ${isActive ? styles.statusActive : ""}`}
          style={{ 
            backgroundColor: `${accentColor}15`,
            borderColor: `${accentColor}40`,
          }}
        >
          {statusIcon && (
            <span className={`${styles.statusIcon} ${isActive ? styles.iconPulse : ""}`}>
              {statusIcon}
            </span>
          )}
          <span 
            className={styles.statusText}
            style={{ color: isActive ? accentColor : undefined }}
          >
            {statusText || STATUS_LABELS[status]}
          </span>
          {isActive && <span className={styles.dots} />}
        </div>
      </div>

      {/* Title */}
      <div className={styles.title}>
        <span className={styles.titleIcon}>🐰</span>
        AI Character
      </div>
    </div>
  );
}
