"use client";

import React, { useEffect, useRef, memo } from "react";
import type { ChatMessage, EmotionType } from "@/types";
import { EMOTIONS } from "@/types";
import styles from "./ChatHistory.module.css";

interface ChatHistoryProps {
  messages: ChatMessage[];
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

function getEmotionEmoji(emotion?: EmotionType): string {
  if (!emotion) return "";
  const emo = EMOTIONS[emotion];
  if (!emo) return "";
  return EMOJI_MAP[emotion] || "";
}

// Memoized message item to prevent unnecessary re-renders
interface MessageItemProps {
  message: ChatMessage;
}

const MessageItem = memo(function MessageItem({ message }: MessageItemProps) {
  return (
    <div
      className={`${styles.message} ${
        message.role === "user" ? styles.user : styles.assistant
      }`}
    >
      <div className={styles.bubble}>
        <span className={styles.content}>{message.content}</span>
      </div>
      <div className={styles.timestamp}>{formatTime(message.timestamp)}</div>
    </div>
  );
});

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
        <MessageItem key={message.id} message={message} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
