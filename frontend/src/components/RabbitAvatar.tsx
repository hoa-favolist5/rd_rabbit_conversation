"use client";

import React from "react";
import type { EmotionType, ConversationStatus } from "@/types";
import { EMOTIONS } from "@/types";
import styles from "./RabbitAvatar.module.css";

interface RabbitAvatarProps {
  emotion: EmotionType;
  status: ConversationStatus;
  statusText: string;
  isConnected: boolean;
}

const STATUS_ICONS: Record<ConversationStatus, string> = {
  idle: "",
  listening: "🎤",
  thinking: "💭",
  speaking: "🔊",
};

export function RabbitAvatar({
  emotion,
  status,
  statusText,
  isConnected,
}: RabbitAvatarProps) {
  // Override emotion based on status for special states
  const displayEmotion: EmotionType =
    status === "listening"
      ? "listening"
      : status === "speaking"
      ? "speaking"
      : emotion;

  const emo = EMOTIONS[displayEmotion] || EMOTIONS.neutral;

  return (
    <div
      className={styles.container}
      style={{
        borderColor: emo.color,
        background: `linear-gradient(135deg, ${emo.color}11, ${emo.color}22)`,
      }}
    >
      {/* Connection status */}
      <div className={styles.connectionStatus}>
        <span
          className={`${styles.connectionDot} ${
            isConnected ? styles.connected : styles.disconnected
          }`}
        />
        {isConnected ? "接続中" : "未接続"}
      </div>

      {/* Title */}
      <div className={styles.title}>🐰 Rabbit AI</div>

      {/* Emotion Face */}
      <div
        className={`${styles.face} ${
          status === "thinking" ? styles.thinking : ""
        }`}
      >
        {emo.face}
      </div>

      {/* Emotion Label */}
      <div className={styles.emotionLabel} style={{ color: emo.color }}>
        【{emo.label}】
      </div>

      {/* Status */}
      {statusText && (
        <div className={styles.status}>
          <span className={status === "listening" ? styles.pulse : ""}>
            {STATUS_ICONS[status]}
          </span>
          {statusText}
          {status !== "idle" && <span className={styles.dots} />}
        </div>
      )}
    </div>
  );
}
