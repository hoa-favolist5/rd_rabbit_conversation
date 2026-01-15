"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import type { ConversationStatus } from "@/types";
import styles from "./ChatInput.module.css";

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  status: ConversationStatus;
  disabled?: boolean;
}

export function ChatInput({ onSendMessage, status, disabled }: ChatInputProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle send
  const handleSend = useCallback(() => {
    const text = input.trim();
    if (text && !disabled && status === "idle") {
      onSendMessage(text);
      setInput("");
    }
  }, [input, disabled, status, onSendMessage]);

  // Handle key press
  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Auto-resize textarea
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    
    // Reset height to auto to get the correct scrollHeight
    e.target.style.height = "auto";
    // Set height to scrollHeight (with max limit)
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  }, []);

  const isDisabled = disabled || status !== "idle";
  const placeholder =
    status === "thinking"
      ? "考え中..."
      : status === "speaking"
      ? "話しています..."
      : status === "listening"
      ? "聞いています..."
      : "メッセージを入力... (Enter で送信)";

  return (
    <div className={styles.container}>
      <textarea
        ref={inputRef}
        className={styles.input}
        value={input}
        onChange={handleChange}
        onKeyDown={handleKeyPress}
        placeholder={placeholder}
        disabled={isDisabled}
        rows={1}
      />
      <button
        className={styles.sendButton}
        onClick={handleSend}
        disabled={isDisabled || !input.trim()}
        aria-label="送信"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={styles.sendIcon}
        >
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    </div>
  );
}
