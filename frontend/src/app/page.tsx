"use client";

import React, { useCallback, useMemo } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { RabbitAvatar, ChatHistory, ChatInput, WorkflowTimingDisplay } from "@/components";
import type { ConversationStatus } from "@/types";
import styles from "./page.module.css";

// WebSocket URL - connect to backend
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001/ws";

export default function Home() {
  const audioPlayer = useAudioPlayer();

  // Handle full audio from WebSocket (fallback mode)
  const handleAudio = useCallback(
    (audioData: string, format: string) => {
      audioPlayer.play(audioData, format);
    },
    [audioPlayer]
  );

  // Handle audio chunks for parallel TTS streaming (faster response)
  const handleAudioChunk = useCallback(
    (chunk: { data: string; format: string; index: number; total: number; isLast: boolean }) => {
      audioPlayer.playChunk(chunk);
    },
    [audioPlayer]
  );

  const {
    isConnected,
    status: wsStatus,
    emotion,
    statusText,
    messages,
    error,
    workflowTiming,
    sendMessage,
  } = useWebSocket({
    url: WS_URL,
    onAudio: handleAudio,
    onAudioChunk: handleAudioChunk,
  });

  // Derive actual status: override to "speaking" when audio is playing
  const status: ConversationStatus = useMemo(() => {
    if (audioPlayer.isPlaying) {
      return "speaking";
    }
    return wsStatus;
  }, [audioPlayer.isPlaying, wsStatus]);

  // Derive status text based on actual status
  const displayStatusText = useMemo(() => {
    if (audioPlayer.isPlaying) {
      return "話しています...";
    }
    return statusText;
  }, [audioPlayer.isPlaying, statusText]);

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <h1 className={styles.title}>🐰 Rabbit AI Avatar</h1>
        <p className={styles.subtitle}>日本語会話AIアシスタント</p>
      </header>

      {/* Main content */}
      <main className={styles.main}>
        {/* Left side - Avatar */}
        <aside className={styles.avatarSection}>
          <RabbitAvatar
            emotion={emotion}
            status={status}
            statusText={displayStatusText}
            isConnected={isConnected}
          />

          {/* Audio indicator */}
          {audioPlayer.isPlaying && (
            <div className={styles.audioIndicator}>
              <span className={styles.audioWave}>🔊</span>
              <span>音声再生中...</span>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className={styles.error}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Workflow Timing display */}
          <WorkflowTimingDisplay timing={workflowTiming} />
        </aside>

        {/* Right side - Chat */}
        <section className={styles.chatSection}>
          <ChatHistory messages={messages} />
          <ChatInput
            onSendMessage={sendMessage}
            status={status}
            disabled={!isConnected}
          />
        </section>
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <p>
          Powered by Claude 3.5 Haiku • AWS Transcribe • Azure Neural TTS
        </p>
      </footer>
    </div>
  );
}
