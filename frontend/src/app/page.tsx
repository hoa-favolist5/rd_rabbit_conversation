"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { useAWSTranscribe } from "@/hooks/useAWSTranscribe";
import { useWaitingPhrase } from "@/hooks/useWaitingPhrase";
import { RabbitAvatar, ChatHistory, ChatInput, WorkflowTimingDisplay, SearchResultsPanel } from "@/components";
import { createLogger } from "@/utils/logger";
import { unlockAudio, preloadWaitingSounds, setupVisibilityHandler } from "@/utils/audioUnlock";
import { shouldPlayWaitingPhrase } from "@/utils/keywordDetection";
import { detectCommand, isCommandOnly } from "@/utils/voiceCommands";
import { executeCommand, type CommandContext } from "@/utils/commandExecutor";
import archiveStorage from "@/utils/archiveStorage";
import type { ConversationStatus, DomainType, ArchiveItemInfo } from "@/types";
import styles from "./page.module.css";

const log = createLogger("Page");

// WebSocket URL - connect to backend
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001/ws";

// AWS Transcribe Configuration
// Uses STS temporary credentials from backend for secure authentication
// Japanese (ja-JP) optimized for best speech recognition accuracy
const AWS_TRANSCRIBE_CONFIG = {
  languageCode: "ja-JP",
  sampleRate: 16000,
  useSTS: true, // Fetch temporary credentials from backend
};

// Minimum characters required for final barge-in submission
const BARGE_IN_MIN_CHARS = parseInt(process.env.NEXT_PUBLIC_BARGE_IN_MIN_CHARS || "5", 10);

// Minimum characters for early barge-in detection (using partial transcripts)
const EARLY_BARGE_IN_MIN_CHARS = parseInt(process.env.NEXT_PUBLIC_EARLY_BARGE_IN_MIN_CHARS || "2", 10);

export default function Home() {
  // Unlock AudioContext on first user gesture (required for iOS Safari)
  // and preload waiting sounds into AudioBuffer cache
  useEffect(() => {
    const unlock = () => {
      unlockAudio().then(() => preloadWaitingSounds(20));
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("click", unlock);
    };
    document.addEventListener("touchstart", unlock, { once: true });
    document.addEventListener("click", unlock, { once: true });
    return () => {
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("click", unlock);
    };
  }, []);

  // Resume AudioContext when returning from background (iOS PWA)
  useEffect(() => {
    return setupVisibilityHandler();
  }, []);

  // Register service worker for PWA
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Service worker registration failed — non-critical
      });
    }
  }, []);

  const audioPlayer = useAudioPlayer();
  const [voiceDetected, setVoiceDetected] = useState(false);

  // Track if early barge-in was triggered (reset on final transcript)
  const earlyBargeInTriggeredRef = useRef(false);

  // Queue for audio that arrives while short-waiting is still playing
  const pendingAudioQueueRef = useRef<Array<
    | { type: 'full'; audioData: string; format: string; responseId?: string; isProtected?: boolean }
    | { type: 'chunk'; data: string; format: string; index: number; total: number; isLast: boolean; responseId?: string }
  >>([]);

  // Flush pending audio queue — called when short-waiting finishes + delay
  const flushPendingAudio = useCallback(() => {
    const queue = pendingAudioQueueRef.current;
    if (queue.length === 0) return;

    log.debug(`✅ Flushing ${queue.length} pending audio items`);
    pendingAudioQueueRef.current = [];

    for (const item of queue) {
      if (item.type === 'full') {
        audioPlayer.play(item.audioData, item.format, item.responseId, item.isProtected);
      } else {
        audioPlayer.playChunk(item);
      }
    }
  }, [audioPlayer]);

  // Waiting phrase system (short waiting sounds)
  const waitingPhrase = useWaitingPhrase({
    onWaitingComplete: () => {
      log.debug("⏳ Short-waiting complete + delay finished, backend audio can play now");
      flushPendingAudio();
    },
    onWaitingStart: () => {
      log.debug("⏳ Short-waiting started");
    },
  });

  // Handle full audio from WebSocket (greeting, long_waiting, sequential TTS)
  const handleAudio = useCallback(
    (audioData: string, format: string, responseId?: string, isProtected?: boolean) => {
      log.debug(`🔊 Received full audio (responseId: ${responseId?.slice(-8) || "none"}, protected: ${isProtected || false})`);

      // If short-waiting is playing (or in post-delay), queue this audio
      if (waitingPhrase.isWaitingPhrasePlaying()) {
        log.debug("⏳ Short-waiting active - queueing backend audio");
        pendingAudioQueueRef.current.push({ type: 'full', audioData, format, responseId, isProtected });
        return;
      }

      audioPlayer.play(audioData, format, responseId, isProtected);
    },
    [audioPlayer, waitingPhrase]
  );

  // Handle audio chunks for parallel TTS streaming
  const handleAudioChunk = useCallback(
    (chunk: { data: string; format: string; index: number; total: number; isLast: boolean; responseId?: string }) => {
      // If short-waiting is playing (or in post-delay), queue ALL chunks
      if (waitingPhrase.isWaitingPhrasePlaying()) {
        log.debug(`⏳ Short-waiting active - queueing chunk ${chunk.index}/${chunk.total}`);
        pendingAudioQueueRef.current.push({ type: 'chunk', ...chunk });
        return;
      }

      audioPlayer.playChunk(chunk);
    },
    [audioPlayer, waitingPhrase]
  );

  const {
    isConnected,
    status: wsStatus,
    emotion,
    statusText,
    messages,
    error,
    workflowTiming,
    userId,
    historyLoaded,
    sendMessage: wsSendMessage,
    requestRandomUser,
    loadHistory,
    requestGreeting,
    saveToArchive,
  } = useWebSocket({
    url: WS_URL,
    onAudio: handleAudio,
    onAudioChunk: handleAudioChunk,
    onBackendResponse: () => {
      // Backend responded - cancel waiting timer if still waiting
      waitingPhrase.cancelWaitingTimer();
    },
  });

  // Push archivable items to storage when they arrive
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "assistant") {
      try {
        // Push single archiveItem (for backward compatibility)
        if (lastMessage.archiveItem) {
          archiveStorage.push(lastMessage.archiveItem);
          log.debug(`📥 Pushed single item to archive storage: ${lastMessage.archiveItem.itemTitle}`);
        }
        
        // Push all items from searchResults (batch operation for multiple results)
        if (lastMessage.searchResults) {
          const { searchResults } = lastMessage;
          const itemsToPush: ArchiveItemInfo[] = [];
          
          if (searchResults.type === "movie" && searchResults.movies) {
            searchResults.movies.forEach((movie) => {
              itemsToPush.push({
                itemId: movie.id?.toString() || `movie-${Date.now()}-${Math.random()}`,
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
              });
            });
          }
          
          if (searchResults.type === "gourmet" && searchResults.restaurants) {
            searchResults.restaurants.forEach((restaurant) => {
              itemsToPush.push({
                itemId: restaurant.id?.toString() || `gourmet-${Date.now()}-${Math.random()}`,
                itemTitle: restaurant.name,
                itemDomain: "gourmet",
                itemData: {
                  code: restaurant.code,
                  address: restaurant.address,
                  catch_copy: restaurant.catch_copy,
                  urls_pc: restaurant.urls_pc,
                  open_hours: restaurant.open_hours,
                  close_days: restaurant.close_days,
                  access: restaurant.access,
                },
              });
            });
          }
          
          // Batch push all items at once (more efficient)
          if (itemsToPush.length > 0) {
            archiveStorage.pushMany(itemsToPush);
            log.debug(`📥 Batch pushed ${itemsToPush.length} ${searchResults.type} items to archive storage`);
          }
        }
      } catch (error) {
        log.error("Failed to push to archive storage:", error);
      }
    }
  }, [messages]);

  // Auto-fetch random user when WebSocket connects, then load history
  useEffect(() => {
    if (isConnected && requestRandomUser) {
      log.info("🔐 WebSocket connected - requesting random user...");
      setTimeout(() => {
        requestRandomUser();
        log.info('📨 Random user request sent');
      }, 100);
    }
  }, [isConnected, requestRandomUser]);

  // Load history after user is set, then request greeting
  useEffect(() => {
    if (userId && !historyLoaded) {
      log.info(`📜 User set (${userId}) - loading history...`);
      setTimeout(() => {
        loadHistory(userId, 5); // Load 5 most recent items
        log.info('📨 History load request sent');
      }, 200);
    }
  }, [userId, historyLoaded, loadHistory]);

  // Request greeting after history is loaded
  useEffect(() => {
    if (historyLoaded) {
      log.info("✅ History loaded - requesting greeting...");
      setTimeout(() => {
        requestGreeting();
        log.info('👋 Greeting request sent');
      }, 300);
    }
  }, [historyLoaded, requestGreeting]);

  // Save to archive - archiveStorage handles state, ChatHistory uses useArchiveStorage hook
  const handleSaveToArchive = useCallback((
    userId: string,
    domain: DomainType,
    itemId: string,
    itemTitle?: string,
    itemData?: Record<string, unknown>
  ) => {
    // Call WebSocket save - backend will respond with archive_saved
    // useWebSocket will update archiveStorage, which triggers re-render via useArchiveStorage hook
    saveToArchive(userId, domain, itemId, itemTitle, itemData);

    // Optimistically mark as saved in archiveStorage (immediate UI feedback)
    // Include itemTitle and itemData so the item can be created if it doesn't exist
    archiveStorage.updateItem(itemId, domain, { 
      savedAt: new Date(),
      itemTitle,
      itemDomain: domain,
      itemData,
    });
    log.debug(`✅ Optimistic save: ${itemId}`);
  }, [saveToArchive]);

  // Send message - cancel all audio and send to backend
  const sendMessage = useCallback((text: string) => {
    log.debug(`📤 Sending message: "${text}"`);

    // CRITICAL: Cancel all audio - stops current playback and rejects old audio
    audioPlayer.cancelAllAudio();

    // Clear any pending audio waiting for short-waiting to finish
    pendingAudioQueueRef.current = [];

    // Stop any waiting phrase
    waitingPhrase.stopWaitingPhrase();

    // 🎯 CHECK FOR COMMANDS FIRST (works for both text and voice input)
    const command = detectCommand(text);
    
    if (command) {
      log.info(`⌨️ Text command detected: ${command.type} (keyword: "${command.keyword}")`);
      
      // Execute command locally using archive storage (FILO)
      const commandContext: CommandContext = {
        userId,
        saveToArchive: handleSaveToArchive, // Use wrapper instead of direct function
      };
      
      const result = executeCommand(command.type, commandContext);
      
      if (result.success) {
        log.info(`✅ Command executed: ${result.message}`);
      } else {
        log.warn(`❌ Command failed: ${result.message}`);
      }
      
      // Check if we should still send to backend
      if (!result.shouldSendToBackend) {
        log.debug("⏹️ Command handled locally, not sending to backend");
        return; // Don't send to backend
      }
    }

    // No command or command wants to send to backend
    // Check if message contains movie/gourmet keywords
    const shouldPlayWaiting = shouldPlayWaitingPhrase(text);
    log.debug(`🔍 Keyword detection: ${shouldPlayWaiting ? "movie/gourmet detected" : "traditional conversation"}`);

    // Start waiting timer only if keywords detected (will play short waiting sound if backend takes > 1s)
    waitingPhrase.startWaitingTimer(shouldPlayWaiting);

    // Send message to backend
    wsSendMessage(text);
  }, [wsSendMessage, audioPlayer, waitingPhrase, userId, handleSaveToArchive]);

  // AWS Transcribe for voice input
  const transcribe = useAWSTranscribe({
    config: AWS_TRANSCRIBE_CONFIG,
    // Auto-refresh session every 5 minutes to maintain quality
    enableAutoRefresh: true,
    sessionRefreshInterval: 5 * 60 * 1000, // 5 minutes
    inactivityTimeout: 10000, // 10 seconds
    stopOnTabHidden: true,
    onTranscript: useCallback((text: string, isFinal: boolean) => {
      log.debug(`📝 Transcript ${isFinal ? "(final)" : "(interim)"}:`, text);

      const trimmedText = text.trim();

      // EARLY BARGE-IN: Stop audio when we detect speech
      if (!isFinal && trimmedText.length >= EARLY_BARGE_IN_MIN_CHARS) {
        if ((audioPlayer.isPlaying || wsStatus === "speaking") && !earlyBargeInTriggeredRef.current) {
          log.debug(`🟡 EARLY BARGE-IN: Stopping audio (${trimmedText.length} chars detected)`);
          audioPlayer.cancelAllAudio();
          earlyBargeInTriggeredRef.current = true;
        }
      }

      // FINAL: Submit transcript
      if (isFinal && trimmedText) {
        earlyBargeInTriggeredRef.current = false;

        if (trimmedText.length < BARGE_IN_MIN_CHARS) {
          log.debug(`⏭️ Transcript too short (${trimmedText.length} chars), ignoring`);
          return;
        }

        // Regular barge-in if early wasn't triggered
        if (audioPlayer.isPlaying || wsStatus === "speaking") {
          log.debug("🔇 REGULAR BARGE-IN: Stopping audio");
          audioPlayer.cancelAllAudio();
        }

        // Send to sendMessage - it will handle command detection
        log.debug(`✅ Submitting: "${trimmedText}"`);
        sendMessage(trimmedText);
      }
    }, [audioPlayer, wsStatus, sendMessage]),
    onError: useCallback((err: Error) => {
      log.error("AWS Transcribe error:", err);
    }, []),
  });

  // VAD for visual feedback
  const checkVoiceActivity = useCallback(() => {
    setVoiceDetected(transcribe.interimTranscript.length > 0);
  }, [transcribe.interimTranscript]);

  React.useEffect(() => {
    checkVoiceActivity();
  }, [checkVoiceActivity]);

  // Derive status
  const status: ConversationStatus = useMemo(() => {
    if (audioPlayer.isPlaying) return "speaking";
    return wsStatus;
  }, [audioPlayer.isPlaying, wsStatus]);

  const displayStatusText = useMemo(() => {
    if (audioPlayer.isPlaying) return "話しています...";
    return statusText;
  }, [audioPlayer.isPlaying, statusText]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Rabbit Favolist5</h1>
        <p className={styles.subtitle}>日本語会話AIアシスタント</p>
      </header>

      <main className={styles.main}>
        {/* Left: Avatar & Status */}
        <aside className={styles.avatarSection}>
          <RabbitAvatar
            emotion={emotion}
            status={status}
            statusText={displayStatusText}
            isConnected={isConnected}
          />

          {audioPlayer.isPlaying && (
            <div className={styles.audioIndicator}>
              <span className={styles.audioWave}>🔊</span>
              <span>音声再生中...</span>
            </div>
          )}

          {error && (
            <div className={styles.error}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <WorkflowTimingDisplay timing={workflowTiming} />
        </aside>

        {/* Center: Chat (text only) */}
        <section className={styles.chatSection}>
          <ChatHistory
            messages={messages}
            userId={userId}
            onSaveToArchive={handleSaveToArchive}
            textOnly={true}
          />
          <ChatInput
            onSendMessage={sendMessage}
            status={status}
            disabled={!isConnected}
            isListening={transcribe.isListening}
            onStartListening={transcribe.startListening}
            onStopListening={transcribe.stopListening}
            interimTranscript={transcribe.interimTranscript}
            voiceDetected={voiceDetected}
            transcribeError={transcribe.error}
          />
        </section>

        {/* Right: Search Results Panel (components only) */}
        <aside className={styles.resultsSection}>
          <SearchResultsPanel
            messages={messages}
            userId={userId}
            onSaveToArchive={handleSaveToArchive}
          />
        </aside>
      </main>
    </div>
  );
}
