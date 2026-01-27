"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { useAWSTranscribe } from "@/hooks/useAWSTranscribe";
import { useWaitingPhrase } from "@/hooks/useWaitingPhrase";
import { RabbitAvatar, ChatHistory, ChatInput, WorkflowTimingDisplay } from "@/components";
import { createLogger } from "@/utils/logger";
import type { ConversationStatus } from "@/types";
import styles from "./page.module.css";

const log = createLogger("Page");

// WebSocket URL - connect to backend
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001/ws";

// AWS Transcribe Configuration (Frontend Direct)
const AWS_TRANSCRIBE_CONFIG = {
  region: process.env.NEXT_PUBLIC_AWS_REGION || "us-west-2",
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY || "",
  },
  languageCode: "ja-JP",
  sampleRate: 16000,
};

// Minimum characters required for final barge-in submission
const BARGE_IN_MIN_CHARS = parseInt(process.env.NEXT_PUBLIC_BARGE_IN_MIN_CHARS || "5", 10);

// Minimum characters for early barge-in detection (using partial transcripts)
const EARLY_BARGE_IN_MIN_CHARS = parseInt(process.env.NEXT_PUBLIC_EARLY_BARGE_IN_MIN_CHARS || "2", 10);

export default function Home() {
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
    sendMessage: wsSendMessage,
  } = useWebSocket({
    url: WS_URL,
    onAudio: handleAudio,
    onAudioChunk: handleAudioChunk,
    onBackendResponse: () => {
      // Backend responded - cancel waiting timer if still waiting
      waitingPhrase.cancelWaitingTimer();
    },
  });

  // Send message - cancel all audio and send to backend
  const sendMessage = useCallback((text: string) => {
    log.debug(`📤 Sending message: "${text}"`);

    // CRITICAL: Cancel all audio - stops current playback and rejects old audio
    audioPlayer.cancelAllAudio();

    // Clear any pending audio waiting for short-waiting to finish
    pendingAudioQueueRef.current = [];

    // Stop any waiting phrase
    waitingPhrase.stopWaitingPhrase();

    // Start waiting timer (will play short waiting sound if backend takes > 1s)
    waitingPhrase.startWaitingTimer();

    // Send message to backend
    wsSendMessage(text);
  }, [wsSendMessage, audioPlayer, waitingPhrase]);

  // AWS Transcribe for voice input
  const transcribe = useAWSTranscribe({
    config: AWS_TRANSCRIBE_CONFIG,
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

        <section className={styles.chatSection}>
          <ChatHistory messages={messages} />
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
      </main>
    </div>
  );
}
