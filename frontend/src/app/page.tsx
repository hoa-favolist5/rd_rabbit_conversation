"use client";

import React, { useCallback, useMemo, useRef } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { RabbitAvatar, ChatHistory, ChatInput, WorkflowTimingDisplay } from "@/components";
import type { ConversationStatus } from "@/types";
import styles from "./page.module.css";

// WebSocket URL - connect to backend
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001/ws";

export default function Home() {
  const audioPlayer = useAudioPlayer();
  const waitingAudioRef = useRef<HTMLAudioElement | null>(null);

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

  // Handle waiting signal - play pre-recorded waiting audio
  const handleWaiting = useCallback((index: number) => {
    // Stop any currently playing waiting audio
    if (waitingAudioRef.current) {
      waitingAudioRef.current.pause();
      waitingAudioRef.current = null;
    }

    // Play waiting audio from public/waiting/{index}.mp3
    const audio = new Audio(`/waiting/${index}.mp3`);
    waitingAudioRef.current = audio;
    
    audio.play().catch((err) => {
      console.warn(`Failed to play waiting audio #${index}:`, err);
    });
  }, []);

  // Handle barge-in - user interrupts AI while it's speaking
  const handleBargeIn = useCallback(() => {
    console.log("🔇 Barge-in: Stopping all audio...");
    console.log("🔇 audioPlayer.isPlaying:", audioPlayer.isPlaying);
    
    // Stop TTS audio
    audioPlayer.stop();
    console.log("🔇 Called audioPlayer.stop()");
    
    // Stop waiting audio
    if (waitingAudioRef.current) {
      waitingAudioRef.current.pause();
      waitingAudioRef.current = null;
      console.log("🔇 Stopped waiting audio");
    }
  }, [audioPlayer]);

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
    onWaiting: handleWaiting,
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

          
          <WorkflowTimingDisplay timing={workflowTiming} />
        </aside>

        {/* Right side - Chat */}
        <section className={styles.chatSection}>
          <ChatHistory messages={messages} />
          <ChatInput
            onSendMessage={sendMessage}
            onBargeIn={handleBargeIn}
            status={status}
            disabled={!isConnected}
          />
        </section>
      </main>

    </div>
  );
}
