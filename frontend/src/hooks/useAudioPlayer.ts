"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createLogger } from "@/utils/logger";

const log = createLogger("AudioPlayer");

interface AudioChunk {
  data: string;
  format: string;
  index: number;
  total: number;
  isLast: boolean;
  responseId?: string;
}

interface UseAudioPlayerReturn {
  isPlaying: boolean;
  play: (base64Audio: string, format?: string, responseId?: string, isProtected?: boolean) => Promise<void>;
  playChunk: (chunk: AudioChunk) => void;
  stop: () => void;
  cancelAllAudio: () => void;  // Call when user sends new message
  setVolume: (volume: number) => void;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Queue for chunked audio playback
  const audioQueueRef = useRef<Map<number, string>>(new Map());
  const currentChunkIndexRef = useRef(0);
  const totalChunksRef = useRef(0);
  const isPlayingQueueRef = useRef(false);
  const isProcessingChunkRef = useRef(false);

  // Simple response tracking: only accept audio matching this responseId
  // null = accept any, "__CANCELLED__" = reject all
  const acceptedResponseIdRef = useRef<string | null>(null);

  // Protected audio (long-waiting) - must play to completion + delay
  const isProtectedAudioRef = useRef(false);
  const protectedAudioQueueRef = useRef<Array<{ base64Audio: string; format: string; responseId?: string }>>([]);
  const POST_PROTECTED_DELAY = 400; // 400ms delay after protected audio completes
  
  // Callback ref for processNextChunk (to avoid circular dependencies)
  const processNextChunkRef = useRef<(() => Promise<void>) | null>(null);

  // Initialize AudioContext on first user interaction
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  // Stop all audio and reject future audio until new response starts
  const cancelAllAudio = useCallback(() => {
    log.debug("🚫 CANCEL ALL: Stopping audio and rejecting future audio");

    // Stop current audio (including protected audio)
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // Clear queue
    isPlayingQueueRef.current = false;
    isProcessingChunkRef.current = false;
    audioQueueRef.current.clear();
    currentChunkIndexRef.current = 0;
    totalChunksRef.current = 0;

    // Clear protected audio state
    isProtectedAudioRef.current = false;
    protectedAudioQueueRef.current = [];

    // Reject all audio until new response with valid responseId
    acceptedResponseIdRef.current = "__CANCELLED__";
    setIsPlaying(false);
  }, []);

  // Play full audio (for greeting, long_waiting, sequential TTS)
  const play = useCallback(
    async (base64Audio: string, format: string = "mp3", responseId?: string, isProtected: boolean = false) => {
      // Check if we should accept this audio
      if (acceptedResponseIdRef.current === "__CANCELLED__") {
        // Only accept if it has a responseId (new response starting)
        if (!responseId) {
          log.debug("🚫 Rejecting audio - cancelled and no responseId");
          return;
        }
        // New response with responseId - accept it
        log.debug(`✅ Accepting new response: ${responseId.slice(-8)}`);
        acceptedResponseIdRef.current = responseId;
      } else if (acceptedResponseIdRef.current && responseId) {
        // We have an accepted responseId - check if this matches
        if (responseId !== acceptedResponseIdRef.current) {
          log.debug(`🚫 Rejecting audio - wrong responseId: got ${responseId.slice(-8)}, want ${acceptedResponseIdRef.current.slice(-8)}`);
          return;
        }
      }

      // Update accepted responseId
      if (responseId) {
        acceptedResponseIdRef.current = responseId;
      }

      // If protected audio is currently playing, queue this audio
      if (isProtectedAudioRef.current && !isProtected) {
        log.debug(`⏳ Protected audio playing - queueing result audio (responseId: ${responseId?.slice(-8) || 'none'})`);
        protectedAudioQueueRef.current.push({ base64Audio, format, responseId });
        return;
      }

      try {
        // Stop any currently playing audio (unless it's protected)
        if (audioRef.current && !isProtectedAudioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }

        // Clear chunk queue
        isPlayingQueueRef.current = false;
        isProcessingChunkRef.current = false;
        audioQueueRef.current.clear();
        currentChunkIndexRef.current = 0;
        totalChunksRef.current = 0;

        // Mark as protected if this is protected audio
        if (isProtected) {
          log.debug(`🛡️ Playing protected audio (long-waiting)`);
          isProtectedAudioRef.current = true;
        }

        // Create and play audio
        const audio = new Audio();
        audio.volume = 1.0;
        audioRef.current = audio;

        audio.onplay = () => setIsPlaying(true);
        audio.onended = async () => {
          setIsPlaying(false);
          
          // If this was protected audio, wait delay then play queued audio
          if (isProtected) {
            log.debug(`✅ Protected audio ended, waiting ${POST_PROTECTED_DELAY}ms before playing result...`);
            isProtectedAudioRef.current = false;
            
            // Wait the post-protected delay
            await new Promise(resolve => setTimeout(resolve, POST_PROTECTED_DELAY));
            
            // Check if we have buffered chunks (parallel TTS)
            if (audioQueueRef.current.size > 0 && totalChunksRef.current > 0) {
              log.debug(`▶️ Playing buffered chunks (${audioQueueRef.current.size}/${totalChunksRef.current})`);
              isPlayingQueueRef.current = true;
              isProcessingChunkRef.current = false;
              currentChunkIndexRef.current = 0;
              setIsPlaying(true);
              if (processNextChunkRef.current) {
                processNextChunkRef.current();
              }
            }
            // Otherwise check for queued full audio
            else if (protectedAudioQueueRef.current.length > 0) {
              const queued = protectedAudioQueueRef.current.shift();
              if (queued) {
                log.debug(`▶️ Playing queued result audio (responseId: ${queued.responseId?.slice(-8) || 'none'})`);
                play(queued.base64Audio, queued.format, queued.responseId, false);
              }
            }
          }
        };
        audio.onerror = (e) => {
          log.error("Audio playback error:", e);
          setIsPlaying(false);
          isProtectedAudioRef.current = false;
        };

        const mimeType = format === "mp3" ? "audio/mpeg" : `audio/${format}`;
        audio.src = `data:${mimeType};base64,${base64Audio}`;

        const ctx = getAudioContext();
        if (ctx.state === "suspended") {
          await ctx.resume();
        }

        await audio.play();
      } catch (error) {
        log.error("Failed to play audio:", error);
        setIsPlaying(false);
        isProtectedAudioRef.current = false;
      }
    },
    [getAudioContext]
  );

  // Process next chunk in queue
  const processNextChunk = useCallback(async () => {
    if (!isPlayingQueueRef.current) return;
    if (isProcessingChunkRef.current) return;
    isProcessingChunkRef.current = true;

    const nextIndex = currentChunkIndexRef.current;
    const audioData = audioQueueRef.current.get(nextIndex);

    if (!audioData) {
      if (nextIndex >= totalChunksRef.current && totalChunksRef.current > 0) {
        // All chunks played
        isPlayingQueueRef.current = false;
        audioQueueRef.current.clear();
        currentChunkIndexRef.current = 0;
        totalChunksRef.current = 0;
        setIsPlaying(false);
      }
      isProcessingChunkRef.current = false;
      return;
    }

    const audio = new Audio();
    audio.volume = 1.0;
    audio.src = `data:audio/mpeg;base64,${audioData}`;
    audioRef.current = audio;

    audio.onended = () => {
      isProcessingChunkRef.current = false;
      currentChunkIndexRef.current++;
      processNextChunk();
    };

    audio.onerror = () => {
      log.error(`Audio chunk ${nextIndex} failed`);
      isProcessingChunkRef.current = false;
      currentChunkIndexRef.current++;
      processNextChunk();
    };

    try {
      const ctx = getAudioContext();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      await audio.play();
    } catch (error) {
      log.error("Chunk playback error:", error);
      isProcessingChunkRef.current = false;
      currentChunkIndexRef.current++;
      processNextChunk();
    }
  }, [getAudioContext]);

  // Play audio chunk (for parallel TTS streaming)
  const playChunk = useCallback((chunk: AudioChunk) => {
    // Check if we should accept this chunk
    if (acceptedResponseIdRef.current === "__CANCELLED__") {
      if (!chunk.responseId) {
        log.debug(`🚫 Rejecting chunk ${chunk.index} - cancelled and no responseId`);
        return;
      }
      if (chunk.index !== 0) {
        log.debug(`🚫 Rejecting chunk ${chunk.index} - cancelled, waiting for chunk 0`);
        return;
      }
      // Chunk 0 with responseId - new response starting
      log.debug(`✅ Accepting new response from chunk 0: ${chunk.responseId.slice(-8)}`);
      acceptedResponseIdRef.current = chunk.responseId;
    } else if (acceptedResponseIdRef.current && chunk.responseId) {
      if (chunk.responseId !== acceptedResponseIdRef.current) {
        log.debug(`🚫 Rejecting chunk ${chunk.index} - wrong responseId`);
        return;
      }
    }

    // If protected audio is playing, buffer chunks but don't start playback yet
    if (isProtectedAudioRef.current) {
      log.debug(`⏳ Protected audio playing - buffering chunk ${chunk.index}/${chunk.total}`);
      audioQueueRef.current.set(chunk.index, chunk.data);
      totalChunksRef.current = chunk.total;
      
      // If this is chunk 0, mark that we have a pending chunked response
      if (chunk.index === 0 && chunk.responseId) {
        acceptedResponseIdRef.current = chunk.responseId;
      }
      return;
    }

    // Chunk 0 = new response, clear and restart
    if (chunk.index === 0) {
      if (chunk.responseId) {
        acceptedResponseIdRef.current = chunk.responseId;
        log.debug(`🎵 Starting response: ${chunk.responseId.slice(-8)}`);
      }

      // Stop current audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      // Clear and setup new queue
      audioQueueRef.current.clear();
      audioQueueRef.current.set(0, chunk.data);
      totalChunksRef.current = chunk.total;
      isPlayingQueueRef.current = true;
      isProcessingChunkRef.current = false;
      currentChunkIndexRef.current = 0;
      setIsPlaying(true);
      processNextChunk();
      return;
    }

    // Non-zero chunk - add to queue if playing
    if (!isPlayingQueueRef.current) {
      return;
    }

    audioQueueRef.current.set(chunk.index, chunk.data);
    totalChunksRef.current = chunk.total;

    // If we're waiting for this chunk, process it
    if (!isProcessingChunkRef.current && audioQueueRef.current.has(currentChunkIndexRef.current)) {
      processNextChunk();
    }
  }, [processNextChunk]);

  // Stop audio playback
  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    isPlayingQueueRef.current = false;
    isProcessingChunkRef.current = false;
    audioQueueRef.current.clear();
    currentChunkIndexRef.current = 0;
    totalChunksRef.current = 0;
    setIsPlaying(false);
  }, []);

  // Set volume
  const setVolume = useCallback((volume: number) => {
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, volume));
    }
  }, []);

  // Keep processNextChunk ref updated
  useEffect(() => {
    processNextChunkRef.current = processNextChunk;
  }, [processNextChunk]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    isPlaying,
    play,
    playChunk,
    stop,
    cancelAllAudio,
    setVolume,
  };
}
