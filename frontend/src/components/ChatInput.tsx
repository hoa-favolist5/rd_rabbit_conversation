"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import type { ConversationStatus } from "@/types";
import styles from "./ChatInput.module.css";

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  onBargeIn?: () => void;
  status: ConversationStatus;
  disabled?: boolean;
}

// Silence timeout - auto-submit after 1.5s of no speech
const SILENCE_TIMEOUT_MS = 1500;

// VAD (Voice Activity Detection) settings
const VAD_ENERGY_THRESHOLD = 0.015; // Minimum energy to consider as speech (lowered for better detection)
const VAD_CHECK_INTERVAL_MS = 50; // How often to check for voice activity (faster for responsiveness)

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
  onBargeIn,
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
  const statusRef = useRef<ConversationStatus>(status);
  const onBargeInRef = useRef(onBargeIn);
  
  // WebRTC AEC refs
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const bargeInTriggeredRef = useRef<boolean>(false);

  // Keep refs in sync with props
  useEffect(() => {
    statusRef.current = status;
    // Reset barge-in trigger when status changes to idle
    if (status === "idle") {
      bargeInTriggeredRef.current = false;
    }
  }, [status]);

  useEffect(() => {
    onBargeInRef.current = onBargeIn;
  }, [onBargeIn]);

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

  // Calculate audio energy (RMS) for VAD
  const calculateEnergy = useCallback((dataArray: Uint8Array): number => {
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      // Convert from 0-255 to -1 to 1
      const normalized = (dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }
    return Math.sqrt(sum / dataArray.length);
  }, []);

  // Start WebRTC-style audio monitoring with AEC
  const startAudioMonitoring = useCallback(async () => {
    try {
      // Request mic with maximum echo cancellation
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,      // Enable AEC
          noiseSuppression: true,      // Enable noise suppression
          autoGainControl: true,       // Enable AGC
          // Advanced constraints for better AEC
          // @ts-expect-error - experimental constraints
          googEchoCancellation: true,
          googAutoGainControl: true,
          googNoiseSuppression: true,
          googHighpassFilter: true,
        },
      });

      mediaStreamRef.current = stream;
      console.log("🎤 Audio stream started with AEC enabled");

      // Create audio context for VAD
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      // Create analyser for energy detection
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      // Connect mic to analyser
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      // Start VAD monitoring
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      vadIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        
        analyserRef.current.getByteTimeDomainData(dataArray);
        const energy = calculateEnergy(dataArray);
        
        // Detect voice activity
        const isVoice = energy > VAD_ENERGY_THRESHOLD;
        setVoiceDetected(isVoice);
        
        // Barge-in detection: If voice detected while AI is speaking
        if (isVoice && statusRef.current === "speaking" && !bargeInTriggeredRef.current) {
          console.log(`🎤 VAD: Voice detected during AI speech! Energy: ${energy.toFixed(4)}`);
          bargeInTriggeredRef.current = true;
          onBargeInRef.current?.();
          
          // Clear transcript to start fresh after barge-in
          finalTranscriptRef.current = "";
          setInterimTranscript("");
          hasSpokenRef.current = false;
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
          
          // Restart speech recognition for fresh capture
          if (recognitionRef.current) {
            console.log("🎤 Restarting speech recognition after barge-in...");
            try {
              recognitionRef.current.stop();
              // Will auto-restart via onend handler
            } catch (e) {
              console.error("Failed to restart recognition:", e);
            }
          }
        }
      }, VAD_CHECK_INTERVAL_MS);

      return true;
    } catch (error) {
      console.error("Failed to start audio monitoring:", error);
      return false;
    }
  }, [calculateEnergy]);

  // Stop audio monitoring
  const stopAudioMonitoring = useCallback(() => {
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    
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

  // Full stop - completely stop recording
  const fullStop = useCallback(() => {
    console.log("🛑 Full stop recording");
    clearSilenceTimer();
    shouldRestartRef.current = false;
    
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    
    stopAudioMonitoring();
    
    setIsRecording(false);
    setInterimTranscript("");
    finalTranscriptRef.current = "";
    hasSpokenRef.current = false;
  }, [clearSilenceTimer, stopAudioMonitoring]);

  // Submit transcript and continue listening
  const submitAndContinue = useCallback(() => {
    const text = finalTranscriptRef.current.trim();
    
    clearSilenceTimer();
    finalTranscriptRef.current = "";
    setInterimTranscript("");
    hasSpokenRef.current = false;
    
    if (text) {
      console.log(`🎤 Submitting: "${text}" (continuing to listen)`);
      onSendMessage(text);
    }
  }, [clearSilenceTimer, onSendMessage]);

  // Submit transcript and stop
  const submitAndStop = useCallback(() => {
    const text = finalTranscriptRef.current.trim();
    fullStop();
    
    if (text) {
      console.log(`🎤 Submitting: "${text}" (stopping)`);
      onSendMessage(text);
    }
  }, [fullStop, onSendMessage]);

  // Start silence timer
  const startSilenceTimer = useCallback(() => {
    if (!hasSpokenRef.current) return;
    
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      console.log(`⏱️ Silence timeout, auto-submitting...`);
      submitAndContinue();
    }, SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimer, submitAndContinue]);

  // Start recording
  const startRecording = useCallback(async () => {
    if (isRecording) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error("Web Speech API not supported");
      return;
    }

    console.log("🎤 Starting speech recognition with AEC...");
    
    // Start audio monitoring for VAD-based barge-in
    const audioStarted = await startAudioMonitoring();
    if (!audioStarted) {
      console.error("Failed to start audio monitoring");
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    shouldRestartRef.current = true;
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "ja-JP";

    recognition.onstart = () => {
      console.log("🎤 Listening with AEC...");
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

      // Barge-in via speech recognition (backup to VAD)
      if ((final || interim) && statusRef.current === "speaking" && !bargeInTriggeredRef.current) {
        console.log("🔇 Barge-in detected via speech recognition!");
        bargeInTriggeredRef.current = true;
        onBargeInRef.current?.();
        
        // Clear old transcript after barge-in to start fresh
        finalTranscriptRef.current = "";
        setInterimTranscript("");
        hasSpokenRef.current = false;
        clearSilenceTimer();
        
        // Don't process this result, wait for new speech
        return;
      }

      if (final) {
        finalTranscriptRef.current += final;
        console.log(`📝 Final: "${final}"`);
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
      console.log("🎤 Recognition ended");
      if (shouldRestartRef.current && recognitionRef.current) {
        console.log("🎤 Auto-restarting...");
        try {
          recognition.start();
        } catch (e) {
          console.error("Failed to restart:", e);
          fullStop();
        }
      } else {
        setIsRecording(false);
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.error("Failed to start recognition:", e);
      fullStop();
    }
  }, [isRecording, startAudioMonitoring, startSilenceTimer, fullStop]);

  // Stop recording (manual)
  const stopRecording = useCallback(() => {
    if (!isRecording) return;
    console.log("🎤 Manual stop");
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
