"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import type { ConversationStatus } from "@/types";
import { createLogger } from "@/utils/logger";
import styles from "./ChatInput.module.css";

const log = createLogger("ChatInput");

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  status: ConversationStatus;
  disabled?: boolean;
  // AWS Transcribe voice input props
  isListening?: boolean;
  onStartListening?: () => Promise<void>;
  onStopListening?: () => void;
  interimTranscript?: string;
  voiceDetected?: boolean;
  transcribeError?: Error | null;
}

export function ChatInput({
  onSendMessage,
  status,
  disabled,
  // AWS Transcribe props
  isListening = false,
  onStartListening,
  onStopListening,
  interimTranscript = "",
  voiceDetected = false,
  transcribeError,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [isMicSupported, setIsMicSupported] = useState(true);
  
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Check for AWS Transcribe support (requires getUserMedia)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hasMediaDevices = !!navigator?.mediaDevices?.getUserMedia;
      const hasAWSConfig = !!(
        process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID &&
        process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY
      );
      setIsMicSupported(hasMediaDevices && hasAWSConfig);
      
      if (!hasAWSConfig) {
        log.warn("AWS credentials not configured. Please set NEXT_PUBLIC_AWS_ACCESS_KEY_ID and NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY");
      }
    }
  }, []);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);


  // Toggle AWS Transcribe listening
  const handleMicClick = useCallback(async () => {
    if (isListening) {
      onStopListening?.();
    } else {
      await onStartListening?.();
    }
  }, [isListening, onStartListening, onStopListening]);

  // Handle text send
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

  // Auto-resize textarea with requestAnimationFrame to avoid layout thrashing
  const resizeTimeoutRef = useRef<number | null>(null);
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    setInput(textarea.value);

    // Debounce resize with requestAnimationFrame
    if (resizeTimeoutRef.current) {
      cancelAnimationFrame(resizeTimeoutRef.current);
    }
    resizeTimeoutRef.current = requestAnimationFrame(() => {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    });
  }, []);

  const isDisabled = disabled || (status !== "idle" && status !== "speaking" && !isListening);
  
  const placeholder = isListening
    ? interimTranscript || "聞いています..."
    : status === "thinking"
    ? "考え中..."
    : status === "speaking"
    ? "話しています... (話しかけると中断できます)"
    : "メッセージを入力...";

  return (
    <div className={styles.container}>
      <textarea
        ref={inputRef}
        className={styles.input}
        value={isListening ? interimTranscript : input}
        onChange={handleChange}
        onKeyDown={handleKeyPress}
        placeholder={placeholder}
        disabled={isDisabled || isListening}
        rows={1}
        readOnly={isListening}
      />
      
      {/* Mic Button (AWS Transcribe) */}
      <button
        className={`${styles.micButton} ${isListening ? styles.micRecording : ""} ${voiceDetected ? styles.micVoiceDetected : ""}`}
        onClick={handleMicClick}
        disabled={disabled || !isMicSupported}
        aria-label={isListening ? "録音停止" : "録音開始"}
        title={isListening ? "クリックして停止 " : "クリックして話す"}
      >
        <div className={styles.micIconWrapper}>
          {isListening && (
            <>
              <div className={styles.pulseRing}></div>
              <div className={styles.pulseRing2}></div>
            </>
          )}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={styles.micIcon}
          >
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        </div>
      </button>

      {/* Send Button */}
      {input.trim() && !isListening && (
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
      )}

      {/* Error display for AWS Transcribe */}
      {transcribeError && (
        <div className={styles.transcribeError}>
          <div style={{ marginBottom: '8px' }}>
            ⚠️ {transcribeError.message}
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>
            💡 Common fixes:
            <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
              <li>Verify AWS credentials in .env.local</li>
              <li>Check IAM user has AmazonTranscribeFullAccess policy</li>
              <li>Test credentials: <code>node test-aws-credentials.js</code></li>
              <li>Refresh page and try again</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
