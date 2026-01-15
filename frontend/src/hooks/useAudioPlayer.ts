"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface AudioChunk {
  data: string;
  format: string;
  index: number;
  total: number;
  isLast: boolean;
}

interface UseAudioPlayerReturn {
  isPlaying: boolean;
  play: (base64Audio: string, format?: string) => Promise<void>;
  playChunk: (chunk: AudioChunk) => void;
  stop: () => void;
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

  // Initialize AudioContext on first user interaction
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  // Play audio from base64 string
  const play = useCallback(
    async (base64Audio: string, format: string = "mp3") => {
      try {
        // Stop any currently playing audio
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }

        // Create audio element
        const audio = new Audio();
        audioRef.current = audio;

        // Set up event listeners
        audio.onplay = () => setIsPlaying(true);
        audio.onended = () => setIsPlaying(false);
        audio.onerror = (e) => {
          console.error("Audio playback error:", e);
          setIsPlaying(false);
        };

        // Set the source
        const mimeType = format === "mp3" ? "audio/mpeg" : `audio/${format}`;
        audio.src = `data:${mimeType};base64,${base64Audio}`;

        // Ensure AudioContext is resumed (for browsers that require user interaction)
        const ctx = getAudioContext();
        if (ctx.state === "suspended") {
          await ctx.resume();
        }

        // Play the audio
        await audio.play();
      } catch (error) {
        console.error("Failed to play audio:", error);
        setIsPlaying(false);
      }
    },
    [getAudioContext]
  );

  // Process next chunk in queue
  const processNextChunk = useCallback(async () => {
    if (!isPlayingQueueRef.current) return;
    
    const nextIndex = currentChunkIndexRef.current;
    const audioData = audioQueueRef.current.get(nextIndex);
    
    if (!audioData) {
      // Check if we're done or waiting for more chunks
      if (nextIndex >= totalChunksRef.current && totalChunksRef.current > 0) {
        // All chunks played
        isPlayingQueueRef.current = false;
        audioQueueRef.current.clear();
        currentChunkIndexRef.current = 0;
        totalChunksRef.current = 0;
        setIsPlaying(false);
      }
      return;
    }
    
    try {
      const audio = new Audio();
      audioRef.current = audio;
      
      audio.onended = () => {
        currentChunkIndexRef.current++;
        processNextChunk();
      };
      
      audio.onerror = () => {
        console.error(`Audio chunk ${nextIndex} failed`);
        currentChunkIndexRef.current++;
        processNextChunk();
      };
      
      const mimeType = "audio/mpeg";
      audio.src = `data:${mimeType};base64,${audioData}`;
      
      const ctx = getAudioContext();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      
      await audio.play();
    } catch (error) {
      console.error("Chunk playback error:", error);
      currentChunkIndexRef.current++;
      processNextChunk();
    }
  }, [getAudioContext]);

  // Queue and play audio chunks (for parallel TTS streaming)
  const playChunk = useCallback((chunk: AudioChunk) => {
    audioQueueRef.current.set(chunk.index, chunk.data);
    totalChunksRef.current = chunk.total;
    
    // Start playing if this is the first chunk and we're not already playing
    if (chunk.index === 0 && !isPlayingQueueRef.current) {
      isPlayingQueueRef.current = true;
      currentChunkIndexRef.current = 0;
      setIsPlaying(true);
      processNextChunk();
    } else if (!isPlayingQueueRef.current && audioQueueRef.current.has(currentChunkIndexRef.current)) {
      // Resume if we were waiting for this chunk
      isPlayingQueueRef.current = true;
      setIsPlaying(true);
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
    // Clear chunk queue
    isPlayingQueueRef.current = false;
    audioQueueRef.current.clear();
    currentChunkIndexRef.current = 0;
    totalChunksRef.current = 0;
    setIsPlaying(false);
  }, []);

  // Set volume (0.0 to 1.0)
  const setVolume = useCallback((volume: number) => {
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, volume));
    }
  }, []);

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
    setVolume,
  };
}
