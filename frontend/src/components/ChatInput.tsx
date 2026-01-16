"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import type { ConversationStatus } from "@/types";
import styles from "./ChatInput.module.css";

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  status: ConversationStatus;
  disabled?: boolean;
}

// Silence timeout - auto-submit after 1.5s of no speech
const SILENCE_TIMEOUT_MS = 1500;

// VAD (Voice Activity Detection) settings - tuned to detect human voice, not noise
const VAD_ENERGY_THRESHOLD = 0.08; // Higher threshold to filter out background noise
const VAD_CHECK_INTERVAL_MS = 50; // How often to check for voice activity
const VAD_CONFIRM_FRAMES = 4; // Require 4 consecutive frames (200ms) to confirm voice
const SPEECH_FREQ_LOW = 85; // Hz - fundamental frequency of human voice
const SPEECH_FREQ_HIGH = 3000; // Hz - upper harmonics of speech
const FORMANT_FREQ_LOW = 300; // Hz - first formant region
const FORMANT_FREQ_HIGH = 1000; // Hz - primary formant region (most voice energy here)
const MIN_SPEECH_RATIO = 0.5; // Speech band must be at least 50% of total energy
const MIN_FORMANT_RATIO = 0.3; // Formant region must be significant portion of speech band

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onaudiostart?: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export function ChatInput({
  onSendMessage,
  status,
  disabled,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isMicSupported, setIsMicSupported] = useState(true);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceDetected, setVoiceDetected] = useState(false);
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const finalTranscriptRef = useRef<string>("");
  const hasSpokenRef = useRef<boolean>(false);
  const shouldRestartRef = useRef<boolean>(false);
  const restartCountRef = useRef<number>(0);
  const statusRef = useRef<ConversationStatus>(status); // Track status for echo prevention
  
  // WebRTC AEC refs for VAD-based echo prevention
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const voiceConfirmCountRef = useRef<number>(0);
  const realVoiceDetectedRef = useRef<boolean>(false); // Track if VAD confirmed real human voice

  // Sync statusRef with prop for echo prevention
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Check for browser support
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      setIsMicSupported(!!SpeechRecognition);
    }
  }, []);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Clear silence timer
  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // Calculate speech-band energy with formant analysis for human voice detection
  // Memoize expensive frequency calculations for performance
  const calculateSpeechEnergy = useCallback((analyser: AnalyserNode, frequencyData: Uint8Array<ArrayBuffer>): number => {
    analyser.getByteFrequencyData(frequencyData);
    
    const sampleRate = analyser.context.sampleRate;
    const binCount = analyser.frequencyBinCount;
    const binWidth = sampleRate / (binCount * 2); // Hz per bin
    
    // Calculate bin indices for different frequency ranges
    const speechLowBin = Math.floor(SPEECH_FREQ_LOW / binWidth);
    const speechHighBin = Math.min(Math.ceil(SPEECH_FREQ_HIGH / binWidth), binCount - 1);
    const formantLowBin = Math.floor(FORMANT_FREQ_LOW / binWidth);
    const formantHighBin = Math.min(Math.ceil(FORMANT_FREQ_HIGH / binWidth), binCount - 1);
    
    // Calculate energy in speech frequency range (85-3000Hz)
    let speechEnergy = 0;
    let speechBinCount = 0;
    for (let i = speechLowBin; i <= speechHighBin; i++) {
      speechEnergy += frequencyData[i] * frequencyData[i];
      speechBinCount++;
    }
    speechEnergy = Math.sqrt(speechEnergy / speechBinCount) / 255;
    
    // Calculate energy in formant region (300-1000Hz) - where voice is strongest
    let formantEnergy = 0;
    let formantBinCount = 0;
    for (let i = formantLowBin; i <= formantHighBin; i++) {
      formantEnergy += frequencyData[i] * frequencyData[i];
      formantBinCount++;
    }
    formantEnergy = Math.sqrt(formantEnergy / formantBinCount) / 255;
    
    // Calculate total energy across all frequencies
    let totalEnergy = 0;
    for (let i = 0; i < binCount; i++) {
      totalEnergy += frequencyData[i] * frequencyData[i];
    }
    totalEnergy = Math.sqrt(totalEnergy / binCount) / 255;
    
    // Calculate low frequency energy (below speech - rumble/vibration)
    const veryLowBin = Math.min(Math.floor(80 / binWidth), speechLowBin);
    let lowFreqEnergy = 0;
    for (let i = 0; i < veryLowBin; i++) {
      lowFreqEnergy += frequencyData[i] * frequencyData[i];
    }
    lowFreqEnergy = veryLowBin > 0 ? Math.sqrt(lowFreqEnergy / veryLowBin) / 255 : 0;
    
    // Voice detection criteria:
    // 1. Speech band should dominate total energy
    const speechRatio = totalEnergy > 0 ? speechEnergy / totalEnergy : 0;
    // 2. Formant region should be significant within speech band
    const formantRatio = speechEnergy > 0 ? formantEnergy / speechEnergy : 0;
    // 3. Low frequency rumble should not dominate (filters out vibrations, traffic)
    const lowFreqRatio = totalEnergy > 0 ? lowFreqEnergy / totalEnergy : 0;
    
    // Check all voice characteristics
    const hasSpeechDominance = speechRatio >= MIN_SPEECH_RATIO;
    const hasFormantPeak = formantRatio >= MIN_FORMANT_RATIO;
    const notLowFreqNoise = lowFreqRatio < 0.4;
    
    // Only return high score if all voice characteristics are met
    if (hasSpeechDominance && hasFormantPeak && notLowFreqNoise) {
      return speechEnergy;
    }
    
    // Reduce score significantly for non-voice sounds
    return speechEnergy * 0.1;
  }, []);

  // Start WebRTC-style audio monitoring with AEC
  const startAudioMonitoring = useCallback(async () => {
    try {
      // Request mic with echo cancellation for VAD
      // Keep settings moderate to not interfere with Web Speech API
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,  // Let Web Speech API handle this
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;

      // Create audio context for VAD
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      // Create analyser for frequency-based voice detection
      // FFT size 512 provides good balance between frequency resolution and performance
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8; // Smooth out noise
      analyserRef.current = analyser;

      // Connect mic to analyser
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      // Start VAD monitoring for echo prevention and visual feedback
      const buffer = new ArrayBuffer(analyser.frequencyBinCount);
      const frequencyData = new Uint8Array(buffer);
      voiceConfirmCountRef.current = 0;
      
      vadIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        
        // Use frequency-based speech detection
        const speechEnergy = calculateSpeechEnergy(analyserRef.current, frequencyData);
        
        // Detect voice activity with speech-band focus
        const isVoiceFrame = speechEnergy > VAD_ENERGY_THRESHOLD;
        
        if (isVoiceFrame) {
          voiceConfirmCountRef.current++;
        } else {
          voiceConfirmCountRef.current = 0;
          // Clear real voice flag when no voice detected
          realVoiceDetectedRef.current = false;
        }
        
        // Require multiple consecutive frames to confirm voice (debouncing)
        const isConfirmedVoice = voiceConfirmCountRef.current >= VAD_CONFIRM_FRAMES;
        setVoiceDetected(isConfirmedVoice);
        
        // Set flag when real human voice confirmed (used for echo prevention)
        if (isConfirmedVoice) {
          realVoiceDetectedRef.current = true;
        }
      }, VAD_CHECK_INTERVAL_MS);

      return true;
    } catch (error) {
      console.error("Failed to start audio monitoring:", error);
      return false;
    }
  }, [calculateSpeechEnergy]);

  // Stop audio monitoring
  const stopAudioMonitoring = useCallback(() => {
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    
    voiceConfirmCountRef.current = 0;
    realVoiceDetectedRef.current = false;
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    analyserRef.current = null;
    setVoiceDetected(false);
  }, []);

  // Clean up recognition instance to prevent memory leaks
  const cleanupRecognition = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onstart = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null;
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Ignore errors if already stopped
      }
      recognitionRef.current = null;
    }
  }, []);

  // Full stop - completely stop recording
  const fullStop = useCallback(() => {
    clearSilenceTimer();
    shouldRestartRef.current = false;
    restartCountRef.current = 0;
    realVoiceDetectedRef.current = false;
    
    cleanupRecognition();
    stopAudioMonitoring();
    
    setIsRecording(false);
    setInterimTranscript("");
    finalTranscriptRef.current = "";
    hasSpokenRef.current = false;
  }, [clearSilenceTimer, cleanupRecognition, stopAudioMonitoring]);

  // Submit transcript and continue listening
  const submitAndContinue = useCallback(() => {
    const text = finalTranscriptRef.current.trim();
    
    clearSilenceTimer();
    finalTranscriptRef.current = "";
    setInterimTranscript("");
    hasSpokenRef.current = false;
    realVoiceDetectedRef.current = false; // Reset for next turn
    
    if (text) {
      onSendMessage(text);
    }
  }, [clearSilenceTimer, onSendMessage]);

  // Submit transcript and stop
  const submitAndStop = useCallback(() => {
    const text = finalTranscriptRef.current.trim();
    fullStop();
    
    if (text) {
      onSendMessage(text);
    }
  }, [fullStop, onSendMessage]);

  // Start silence timer
  const startSilenceTimer = useCallback(() => {
    if (!hasSpokenRef.current) return;
    
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      submitAndContinue();
    }, SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimer, submitAndContinue]);

  // Setup recognition handlers (reusable for fresh instances)
  const setupRecognitionHandlers = useCallback((recognition: SpeechRecognition) => {
    recognition.onstart = () => {
      setIsRecording(true);
      finalTranscriptRef.current = "";
      setInterimTranscript("");
      hasSpokenRef.current = false;
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      // Echo prevention: If AI is speaking, only accept if VAD confirmed real human voice
      if (statusRef.current === "speaking" && !realVoiceDetectedRef.current) {
        // Ignore this transcript - likely echo from AI's voice through speakers
        console.log("🔇 Ignoring transcript (echo prevention): AI is speaking, no real voice detected");
        return;
      }

      if (final) {
        finalTranscriptRef.current += final;
      }

      setInterimTranscript(finalTranscriptRef.current + interim);

      if (final || interim) {
        hasSpokenRef.current = true;
        startSilenceTimer();
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === "no-speech" || event.error === "aborted") {
        return;
      }
      fullStop();
    };

    recognition.onend = () => {
      if (!shouldRestartRef.current) {
        setIsRecording(false);
        return;
      }
      
      restartCountRef.current++;
      
      // Recreate instance every 10 restarts to prevent memory buildup
      if (restartCountRef.current >= 10) {
        console.log("🔄 Memory cleanup: recreating speech recognition");
        restartCountRef.current = 0;
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
          const newRecognition = new SpeechRecognition();
          newRecognition.continuous = true;
          newRecognition.interimResults = true;
          newRecognition.lang = "ja-JP";
          
          recognitionRef.current = newRecognition;
          setupRecognitionHandlers(newRecognition);
          
          try {
            newRecognition.start();
          } catch (e) {
            console.error("Failed to restart with new instance:", e);
            fullStop();
          }
        }
        return;
      }
      
      // Normal restart
      try {
        recognition.start();
      } catch (e) {
        console.error("Failed to restart recognition:", e);
        fullStop();
      }
    };
  }, [startSilenceTimer, fullStop]);

  // Start recording
  const startRecording = useCallback(async () => {
    if (isRecording) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error("Web Speech API not supported");
      return;
    }

    // Start audio monitoring for VAD visual feedback
    const audioStarted = await startAudioMonitoring();
    if (!audioStarted) {
      console.error("Failed to start audio monitoring");
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    shouldRestartRef.current = true;
    restartCountRef.current = 0;
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "ja-JP";

    setupRecognitionHandlers(recognition);

    try {
      recognition.start();
    } catch (e) {
      console.error("Failed to start recognition:", e);
      fullStop();
    }
  }, [isRecording, startAudioMonitoring, setupRecognitionHandlers, fullStop]);

  // Stop recording (manual)
  const stopRecording = useCallback(() => {
    if (!isRecording) return;
    submitAndStop();
  }, [isRecording, submitAndStop]);

  // Toggle recording
  const handleMicClick = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

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

  // Auto-resize textarea
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearSilenceTimer();
      stopAudioMonitoring();
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
    };
  }, [clearSilenceTimer, stopAudioMonitoring]);

  const isDisabled = disabled || (status !== "idle" && status !== "speaking" && !isRecording);
  const placeholder = isRecording
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
        value={isRecording ? interimTranscript : input}
        onChange={handleChange}
        onKeyDown={handleKeyPress}
        placeholder={placeholder}
        disabled={isDisabled || isRecording}
        rows={1}
        readOnly={isRecording}
      />
      
      {/* Mic Button */}
      <button
        className={`${styles.micButton} ${isRecording ? styles.micRecording : ""} ${voiceDetected ? styles.micVoiceDetected : ""}`}
        onClick={handleMicClick}
        disabled={disabled || !isMicSupported}
        aria-label={isRecording ? "録音停止" : "録音開始"}
        title={isRecording ? "クリックして停止" : "クリックして話す"}
      >
        <div className={styles.micIconWrapper}>
          {isRecording && (
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
      {input.trim() && !isRecording && (
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
    </div>
  );
}
