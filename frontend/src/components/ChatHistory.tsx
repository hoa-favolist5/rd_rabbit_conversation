"use client";

import React, { useEffect, useRef } from "react";
import type { ChatMessage, EmotionType } from "@/types";
import { EMOTIONS } from "@/types";
import styles from "./ChatHistory.module.css";

interface ChatHistoryProps {
  messages: ChatMessage[];
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getEmotionEmoji(emotion?: EmotionType): string {
  if (!emotion) return "";
  const emo = EMOTIONS[emotion];
  if (!emo) return "";
  
  // Map emotions to simpler emojis
  const emojiMap: Record<EmotionType, string> = {
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
  
  return emojiMap[emotion] || "";
}

export function ChatHistory({ messages }: ChatHistoryProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
      {messages.map((message) => (
        <div
          key={message.id}
          className={`${styles.message} ${
            message.role === "user" ? styles.user : styles.assistant
          }`}
        >
          <div className={styles.bubble}>
            {message.role === "assistant" && message.emotion && (
              <span className={styles.emotion}>
                {getEmotionEmoji(message.emotion)}
              </span>
            )}
            <span className={styles.content}>{message.content}</span>
          </div>
          <div className={styles.timestamp}>{formatTime(message.timestamp)}</div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
