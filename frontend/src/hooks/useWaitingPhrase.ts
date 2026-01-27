"use client";

import { useRef, useCallback, useEffect } from "react";
import { createLogger } from "@/utils/logger";

const log = createLogger("WaitingPhrase");

interface UseWaitingPhraseOptions {
  onWaitingComplete?: () => void;
  onWaitingStart?: () => void;  // Called when waiting phrase actually starts playing
}

interface UseWaitingPhraseReturn {
  startWaitingTimer: () => void;
  cancelWaitingTimer: () => boolean;  // Returns true if cancelled, false if already playing
  stopWaitingPhrase: () => void;
  isWaitingPhrasePlaying: () => boolean;
  forceStopAudio: () => void;  // Force stop any playing audio immediately
  playShortWaiting: () => void;  // Play short acknowledgment sound (< 1s)
}

/**
 * Hook to manage intelligent waiting phrase playback
 *
 * Behavior:
 * - Response < 1s: NO waiting sound (play immediately)
 * - Response > 1s: Play SHORT waiting sound first
 *   - Uses /waiting-short/0-9.mp3
 *   - Examples: "ああ" (ah), "うん" (un), "えっと" (etto)
 *   - Protected: cannot be interrupted once started
 *   - After completion, waits POST_WAITING_DELAY before backend audio
 * 
 * LONG waiting phrases (/waiting/0-19.mp3) are now DEPRECATED
 * Replaced by:
 * - Short sounds for > 1s responses
 * - Server-side contextual waiting for database operations
 */
export function useWaitingPhrase({ onWaitingComplete, onWaitingStart }: UseWaitingPhraseOptions = {}): UseWaitingPhraseReturn {
  const waitingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const waitingAudioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(false);
  const postWaitingTimerRef = useRef<NodeJS.Timeout | null>(null);  // Track post-waiting delay timer
  const requestIdRef = useRef(0);  // Track request ID for race condition prevention

  // Get configuration from environment variables
  const waitingThreshold = parseInt(
    process.env.NEXT_PUBLIC_WAITING_THRESHOLD || "1000",
    10
  );
  const postWaitingDelay = parseInt(
    process.env.NEXT_PUBLIC_POST_WAITING_DELAY || "400",
    10
  );
  
  // Short waiting configuration
  const SHORT_WAITING_COUNT = 20;  // Number of short waiting sounds (0-19.mp3)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (waitingTimerRef.current) {
        clearTimeout(waitingTimerRef.current);
      }
      if (postWaitingTimerRef.current) {
        clearTimeout(postWaitingTimerRef.current);
      }
      if (waitingAudioRef.current) {
        waitingAudioRef.current.pause();
        waitingAudioRef.current = null;
      }
    };
  }, []);

  /**
   * Start the waiting timer after user submits message
   * If backend doesn't respond within threshold, play waiting phrase
   */
  const startWaitingTimer = useCallback(() => {
    // Increment request ID for race condition prevention
    const currentRequestId = ++requestIdRef.current;

    // Clear any existing timers
    if (waitingTimerRef.current) {
      clearTimeout(waitingTimerRef.current);
      waitingTimerRef.current = null;
    }
    if (postWaitingTimerRef.current) {
      clearTimeout(postWaitingTimerRef.current);
      postWaitingTimerRef.current = null;
    }

    // Stop any existing audio
    if (waitingAudioRef.current) {
      waitingAudioRef.current.pause();
      waitingAudioRef.current = null;
    }
    isPlayingRef.current = false;

    log.debug(`⏰ Starting waiting timer (${waitingThreshold}ms threshold) [request #${currentRequestId}]`);

    // Start timer
    waitingTimerRef.current = setTimeout(() => {
      // Race condition check: ensure this is still the current request
      if (currentRequestId !== requestIdRef.current) {
        log.debug(`⏳ Ignoring stale waiting timer [request #${currentRequestId}]`);
        return;
      }

      // 90% chance to skip waiting sound (silent waiting)
      const shouldPlaySound = Math.random() < 0.99;
      
      if (!shouldPlaySound) {
        log.debug("⏳ Threshold exceeded (>1s) - skipping waiting sound (50% chance)");
        // Skip waiting sound but still trigger completion after delay
        postWaitingTimerRef.current = setTimeout(() => {
          postWaitingTimerRef.current = null;  // Clear ref so isWaitingPhrasePlaying() returns false
          if (currentRequestId === requestIdRef.current) {
            log.debug(`✅ Silent waiting delay complete - triggering onWaitingComplete()`);
            onWaitingComplete?.();
          }
        }, postWaitingDelay);
        return;
      }

      log.debug("⏳ Threshold exceeded (>1s) - playing SHORT waiting sound (50% chance)");

      // Notify parent that waiting phrase is starting (activate protection mode)
      onWaitingStart?.();

      // Select random SHORT waiting sound (0-9)
      const randomIndex = Math.floor(Math.random() * SHORT_WAITING_COUNT);
      const audio = new Audio(`/waiting-short/${randomIndex}.mp3`);

      // Set volume to match A.I. speaking volume (louder)
      audio.volume = 1.0; // Maximum volume (0.0 to 1.0)

      waitingAudioRef.current = audio;

      // Set up event handlers BEFORE playing
      audio.onended = () => {
        // Race condition check
        if (currentRequestId !== requestIdRef.current) {
          log.debug(`✅ Ignoring ended event from stale request [#${currentRequestId}]`);
          return;
        }

        log.debug(`✅ Waiting phrase audio ended, starting ${postWaitingDelay}ms POST_WAITING_DELAY...`);
        isPlayingRef.current = false;
        waitingAudioRef.current = null;

        // Apply post-waiting delay before allowing backend audio
        // This ensures smooth transition and prevents audio overlap
        postWaitingTimerRef.current = setTimeout(() => {
          postWaitingTimerRef.current = null;  // Clear ref so isWaitingPhrasePlaying() returns false
          // Race condition check
          if (currentRequestId !== requestIdRef.current) {
            log.debug(`✅ Ignoring post-delay callback from stale request [#${currentRequestId}]`);
            return;
          }
          log.debug(`✅ ${postWaitingDelay}ms POST_WAITING_DELAY complete - triggering onWaitingComplete()`);
          onWaitingComplete?.();
        }, postWaitingDelay);
      };

      audio.onerror = (err) => {
        log.warn(`Failed to play short waiting audio #${randomIndex}`, err);
        isPlayingRef.current = false;
        waitingAudioRef.current = null;
        if (currentRequestId === requestIdRef.current) {
          onWaitingComplete?.();
        }
      };

      // Mark as playing IMMEDIATELY (before async play) to prevent race condition
      // where backend audio arrives before play() Promise resolves
      isPlayingRef.current = true;

      audio.play()
        .catch((err) => {
          log.warn("Failed to play waiting audio", err);
          isPlayingRef.current = false;
          waitingAudioRef.current = null;
          if (currentRequestId === requestIdRef.current) {
            onWaitingComplete?.();
          }
        });
    }, waitingThreshold);
  }, [waitingThreshold, postWaitingDelay, onWaitingComplete, onWaitingStart]);

  /**
   * Cancel the waiting timer (backend responded quickly)
   * This prevents the waiting phrase from playing
   * @returns true if timer was cancelled, false if waiting phrase is already playing
   */
  const cancelWaitingTimer = useCallback(() => {
    // If waiting phrase is already playing, cannot cancel
    if (isPlayingRef.current) {
      log.debug("⏳ Waiting phrase already playing - cannot cancel");
      return false;
    }
    
    // Cancel timer if it exists
    if (waitingTimerRef.current) {
      log.debug("⚡ Backend responded quickly - canceling waiting timer");
      clearTimeout(waitingTimerRef.current);
      waitingTimerRef.current = null;
      return true;
    }
    
    return false;
  }, []);

  /**
   * Stop the waiting phrase (for barge-in scenarios)
   * Note: This should only be used for user interruptions (barge-in)
   * Normal backend responses should NOT stop the waiting phrase
   */
  const stopWaitingPhrase = useCallback(() => {
    // Increment request ID to invalidate any pending callbacks
    requestIdRef.current++;

    // Cancel waiting timer if still waiting
    if (waitingTimerRef.current) {
      clearTimeout(waitingTimerRef.current);
      waitingTimerRef.current = null;
    }

    // Cancel post-waiting timer
    if (postWaitingTimerRef.current) {
      clearTimeout(postWaitingTimerRef.current);
      postWaitingTimerRef.current = null;
    }

    // Stop audio if playing (for barge-in only)
    if (waitingAudioRef.current) {
      log.debug("🔇 Stopping waiting phrase (barge-in)");
      waitingAudioRef.current.pause();
      waitingAudioRef.current = null;
      isPlayingRef.current = false;
    }
  }, []);

  /**
   * Check if waiting phrase is currently playing OR in post-delay period
   * Backend audio should be queued if this returns true
   */
  const isWaitingPhrasePlaying = useCallback(() => {
    // Return true if audio is playing OR if post-waiting delay is active
    return isPlayingRef.current || postWaitingTimerRef.current !== null;
  }, []);

  /**
   * Force stop any playing audio immediately
   * Used before processing backend audio to ensure no overlap
   */
  const forceStopAudio = useCallback(() => {
    log.debug("🛑 Force stopping waiting phrase audio");

    // Increment request ID to invalidate any pending callbacks
    requestIdRef.current++;

    // Cancel waiting timer
    if (waitingTimerRef.current) {
      clearTimeout(waitingTimerRef.current);
      waitingTimerRef.current = null;
    }

    // Cancel post-waiting timer
    if (postWaitingTimerRef.current) {
      clearTimeout(postWaitingTimerRef.current);
      postWaitingTimerRef.current = null;
    }

    // Stop and clear audio element
    if (waitingAudioRef.current) {
      waitingAudioRef.current.pause();
      waitingAudioRef.current.currentTime = 0;  // Reset to start
      waitingAudioRef.current.src = '';  // Clear source
      waitingAudioRef.current = null;
    }

    isPlayingRef.current = false;
  }, []);

  /**
   * Play a short waiting sound (< 1s acknowledgment)
   * Used when backend responds quickly but needs brief acknowledgment
   */
  const playShortWaiting = useCallback(() => {
    log.debug("🔊 Playing short waiting sound");
    
    // Select random short waiting sound (0-9)
    const randomIndex = Math.floor(Math.random() * SHORT_WAITING_COUNT);
    const audio = new Audio(`/waiting-short/${randomIndex}.mp3`);
    
    // Set volume to match other audio
    audio.volume = 1.0;
    
    // Play immediately (non-blocking, no protection)
    audio.play().catch((err) => {
      log.warn("Failed to play short waiting sound", err);
    });
    
    // No state tracking needed - these are fire-and-forget
  }, [SHORT_WAITING_COUNT]);

  return {
    startWaitingTimer,
    cancelWaitingTimer,
    stopWaitingPhrase,
    isWaitingPhrasePlaying,
    forceStopAudio,
    playShortWaiting,
  };
}
