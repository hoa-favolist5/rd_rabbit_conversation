import { WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import { chat, needsMovieSearch } from "../services/claude.js";
import { synthesizeSpeechBase64 } from "../services/google-tts.js";
import { searchMovies } from "../db/movies.js";
import { combinedMovieSearch } from "../services/combined-search.js";
import { startTimer } from "../utils/timer.js";
import { generateLongWaitingPhrase, type WaitingContext } from "../services/long-waiting.js";
import { createLogger, createSessionLogger } from "../utils/logger.js";

const log = createLogger("WS");
import type {
  ConversationTurn,
  ConversationStatus,
  EmotionType,
  StatusMessage,
  UserMessage,
  AssistantMessage,
  ErrorMessage,
  WSMessage,
  LongWaitingMessage,
} from "../types/index.js";

// Configuration for parallel TTS streaming (TEN Framework inspired)
const ENABLE_PARALLEL_TTS = true;
const MIN_SENTENCE_LENGTH_FOR_TTS = 5;
const MAX_CONCURRENT_TTS = 6;  // Increased for better throughput (Azure handles well)
const SHORT_RESPONSE_THRESHOLD = 30;  // Skip chunking for very short responses

// Session management configuration
const SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;  // 5 minutes idle timeout
const SESSION_CLEANUP_INTERVAL_MS = 60 * 1000;  // Check every 1 minute
const MAX_MESSAGE_LENGTH = 2000;  // Maximum user message length
const MAX_REQUESTS_PER_MINUTE = 20;  // Rate limiting per session

// Waiting phrases - played before database search (pre-recorded audio)
const WAITING_PHRASES = [
  "もちろん。急いで確認するから、待っててね。",
  "了解。ちょっと待ってね。",
  "うん、わかった。今確認するから待っててね。",
  "なるほど。少し調べてみるから待ってて。",
  "OK。内容を確認するから、少々お待ちを。",
  "任せて。丁寧にお調べするから、少し待っててね。",
  "承知したよ。ちょっと考えるから待っててくれる？",
  "あ、そのことだね。今調べてあげるから待って。",
  "確かに。すぐ確認するから、ちょっと待ってて。",
  "いいよ。調べてみるから、そこで待っててね。",
  "うん、わかるよ。すぐに調べてみるね。",
  "おっけー。情報を探してくるから、待っててね。",
  "了解了解。落ち着いて調べるから、待っててね。",
  "そうだね。すぐ確認するから、ちょっと待って。",
  "お安い御用だよ。今すぐ調べるから待っててね。",
  "オッケー。しっかり探してみるから、待ってて。",
  "そうだよね。今、詳しく確認するからちょっと待って。",
  "おっけー。すぐ準備するから、ちょっと待っててね。",
  "教えてくれてありがとう。今すぐ調べるから待ってて。",
  "了解したよ。すぐに見つけてくるから、待っててね。",
];

// Workflow step definitions matching WORKFLOW.md
type WorkflowStep = 
  | "STEP1_TEXT_INPUT"
  | "STEP2_WEBSOCKET_SEND"
  | "STEP3_BACKEND_START"
  | "STEP4_LLM_REQUEST"
  | "STEP5_DB_SEARCH"
  | "STEP6_LLM_RESPONSE"
  | "STEP7_TEXT_RESPONSE"
  | "STEP8_TTS_SYNTHESIS"
  | "STEP9_AUDIO_SEND"
  | "STEP10_AUDIO_PLAY"
  | "STEP11_TIMING_SEND"
  | "STEP12_COMPLETE";

interface StepTiming {
  step: WorkflowStep;
  name: string;
  nameJa: string;
  durationMs: number;
  startTime: number;
  endTime: number;
  details?: Record<string, unknown>;
}

interface Session {
  id: string;
  ws: WebSocket;
  history: ConversationTurn[];
  status: ConversationStatus;
  pendingRequest: boolean;
  currentResponseId: string | null;  // Track current response for barge-in cancellation
  lastActivityTime: number;  // For idle timeout cleanup
  requestCount: number;  // For rate limiting
  requestWindowStart: number;  // Rate limit window start time
  log: ReturnType<typeof createSessionLogger>;  // Session-specific logger
}

// Active sessions
const sessions = new Map<string, Session>();

// Session cleanup interval
let sessionCleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start periodic session cleanup for idle sessions
 */
function startSessionCleanup(): void {
  if (sessionCleanupInterval) return;

  sessionCleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, session] of sessions.entries()) {
      if (now - session.lastActivityTime > SESSION_IDLE_TIMEOUT_MS) {
        log.debug(`Cleaning up idle session: ${sessionId}`);
        try {
          session.ws.close(1000, "Session idle timeout");
        } catch {
          // Ignore close errors
        }
        sessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      log.debug(`Cleaned up ${cleanedCount} idle sessions. Active: ${sessions.size}`);
    }
  }, SESSION_CLEANUP_INTERVAL_MS);
}

/**
 * Stop session cleanup (for graceful shutdown)
 */
function stopSessionCleanup(): void {
  if (sessionCleanupInterval) {
    clearInterval(sessionCleanupInterval);
    sessionCleanupInterval = null;
  }
}

/**
 * Check rate limit for session
 * Returns true if request is allowed, false if rate limited
 */
function checkRateLimit(session: Session): boolean {
  const now = Date.now();

  // Reset window if expired (1 minute window)
  if (now - session.requestWindowStart > 60000) {
    session.requestCount = 0;
    session.requestWindowStart = now;
  }

  session.requestCount++;
  return session.requestCount <= MAX_REQUESTS_PER_MINUTE;
}

// Start cleanup on module load
startSessionCleanup();

// TTS concurrency limiter (TEN Framework pattern)
let activeTTSCount = 0;
const ttsWaitQueue: Array<() => void> = [];

async function withTTSLimit<T>(fn: () => Promise<T>): Promise<T> {
  // Wait if at concurrency limit
  if (activeTTSCount >= MAX_CONCURRENT_TTS) {
    await new Promise<void>(resolve => ttsWaitQueue.push(resolve));
  }
  
  activeTTSCount++;
  try {
    return await fn();
  } finally {
    activeTTSCount--;
    // Wake up next waiting request
    const next = ttsWaitQueue.shift();
    if (next) next();
  }
}

// Step labels
const STEP_LABELS: Record<WorkflowStep, { name: string; nameJa: string }> = {
  STEP1_TEXT_INPUT: { name: "Text Input", nameJa: "テキスト入力" },
  STEP2_WEBSOCKET_SEND: { name: "WebSocket Send", nameJa: "WebSocket送信" },
  STEP3_BACKEND_START: { name: "Backend Start", nameJa: "Backend処理開始" },
  STEP4_LLM_REQUEST: { name: "LLM Request", nameJa: "LLM 呼び出し" },
  STEP5_DB_SEARCH: { name: "DB Search", nameJa: "データベース検索" },
  STEP6_LLM_RESPONSE: { name: "LLM Response", nameJa: "Claude最終レスポンス" },
  STEP7_TEXT_RESPONSE: { name: "Text Response", nameJa: "テキスト応答送信" },
  STEP8_TTS_SYNTHESIS: { name: "TTS Synthesis", nameJa: "Azure TTS音声合成" },
  STEP9_AUDIO_SEND: { name: "Audio Send", nameJa: "音声データ送信" },
  STEP10_AUDIO_PLAY: { name: "Audio Play", nameJa: "音声再生" },
  STEP11_TIMING_SEND: { name: "Timing Send", nameJa: "タイミング情報送信" },
  STEP12_COMPLETE: { name: "Complete", nameJa: "完了" },
};

/**
 * Workflow Timer - tracks all steps in the conversation workflow
 */
class WorkflowTimer {
  private sessionId: string;
  private steps: StepTiming[] = [];
  private overallStart: number;
  private currentStepStart: number | null = null;
  private currentStep: WorkflowStep | null = null;
  private dbSearchTime: number = 0;
  private hasDbSearch: boolean = false;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.overallStart = performance.now();
  }

  /**
   * Start tracking a step
   */
  startStep(step: WorkflowStep, details?: Record<string, unknown>): void {
    this.currentStep = step;
    this.currentStepStart = performance.now();
  }

  /**
   * End current step
   */
  endStep(details?: Record<string, unknown>): void {
    if (this.currentStep && this.currentStepStart !== null) {
      const endTime = performance.now();
      const durationMs = Math.round(endTime - this.currentStepStart);
      const labels = STEP_LABELS[this.currentStep];

      this.steps.push({
        step: this.currentStep,
        name: labels.name,
        nameJa: labels.nameJa,
        durationMs,
        startTime: this.currentStepStart,
        endTime,
        details,
      });

      log.debug(`[${this.sessionId.slice(0, 8)}] ${this.currentStep}: ${durationMs}ms`);

      this.currentStepStart = null;
      this.currentStep = null;
    }
  }

  /**
   * Track a step with async function
   */
  async trackStep<T>(
    step: WorkflowStep,
    fn: () => Promise<T>,
    details?: Record<string, unknown>
  ): Promise<T> {
    this.startStep(step, details);
    try {
      const result = await fn();
      this.endStep(details);
      return result;
    } catch (error) {
      this.endStep({ ...details, error: true });
      throw error;
    }
  }

  /**
   * Record DB search time (tracked separately within LLM step)
   */
  recordDbSearch(durationMs: number): void {
    this.dbSearchTime = durationMs;
    this.hasDbSearch = true;
  }

  /**
   * Get summary with all steps
   */
  getSummary(): {
    sessionId: string;
    totalDurationMs: number;
    steps: StepTiming[];
    hasDbSearch: boolean;
    dbSearchTime: number;
  } {
    const totalDurationMs = Math.round(performance.now() - this.overallStart);
    return {
      sessionId: this.sessionId,
      totalDurationMs,
      steps: this.steps,
      hasDbSearch: this.hasDbSearch,
      dbSearchTime: this.dbSearchTime,
    };
  }

  /**
   * Log summary (only in debug mode)
   */
  logSummary(): void {
    const summary = this.getSummary();
    const stepDetails = this.steps.map(step => {
      const percentage = ((step.durationMs / summary.totalDurationMs) * 100).toFixed(1);
      return `${step.nameJa}: ${step.durationMs}ms (${percentage}%)`;
    }).join(", ");
    log.debug(`Workflow: ${this.sessionId.slice(0, 8)} | ${summary.totalDurationMs}ms | ${stepDetails}`);
  }
}

/**
 * Send a message to the WebSocket client
 */
function send(ws: WebSocket, message: WSMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Send status update to client
 */
function sendStatus(
  ws: WebSocket,
  status: ConversationStatus,
  emotion: EmotionType,
  statusText: string
): void {
  const message: StatusMessage = {
    type: "status",
    status,
    emotion,
    statusText,
  };
  send(ws, message);
}

/**
 * Send user message echo to client
 */
function sendUserMessage(ws: WebSocket, text: string): void {
  const message: UserMessage = {
    type: "user_message",
    text,
  };
  send(ws, message);
}

/**
 * Send assistant message to client
 */
function sendAssistantMessage(
  ws: WebSocket,
  text: string,
  emotion: EmotionType,
  messageId?: string
): void {
  const message: AssistantMessage = {
    type: "assistant_message",
    text,
    emotion,
    ...(messageId ? { messageId } : {}),
  };
  send(ws, message);
}

/**
 * Send assistant streaming delta
 */
function sendAssistantDelta(ws: WebSocket, text: string, messageId: string): void {
  send(ws, {
    type: "assistant_delta",
    text,
    messageId,
  });
}

/**
 * Send error message to client
 */
function sendError(ws: WebSocket, errorMessage: string): void {
  const message: ErrorMessage = {
    type: "error",
    message: errorMessage,
  };
  send(ws, message);
}

/**
 * Send long waiting audio (for database operations)
 */
async function sendLongWaiting(
  ws: WebSocket,
  context: WaitingContext,
  responseId: string
): Promise<void> {
  try {
    // Generate contextual waiting phrase
    const text = generateLongWaitingPhrase(context);
    log.debug(`Sending long waiting phrase: "${text}"`);

    // Synthesize speech immediately
    // Use "speaking" emotion to match conversational flow
    const audio = await synthesizeSpeechBase64(text, {
      emotion: "speaking",
      voice: "female",
    });
    
    // Send to client with responseId
    const message: LongWaitingMessage = {
      type: "long_waiting",
      audio,
      text,
      responseId,  // Add responseId for tracking
    };
    send(ws, message);
  } catch (error) {
    log.error("Failed to generate long waiting audio:", error);
  }
}

/**
 * Send transcript message to client (real-time STT)
 */
/**
 * Send waiting signal to client (before DB search)
 * Frontend plays pre-recorded audio from public/waiting/{index}.mp3
 * 
 * DISABLED: Moved to frontend with configurable delay (NEXT_PUBLIC_WAITING_DELAY)
 * Frontend now automatically plays random waiting audio after submitting message
 */
// function sendWaiting(ws: WebSocket): void {
//   const index = Math.floor(Math.random() * WAITING_PHRASES.length);
//   console.log(`⏳ Sending waiting signal #${index}: "${WAITING_PHRASES[index]}"`);
//   send(ws, {
//     type: "waiting",
//     index,
//     text: WAITING_PHRASES[index],  // For debugging/fallback
//   });
// }

/**
 * Send workflow timing information to client
 */
function sendWorkflowTiming(
  ws: WebSocket,
  workflowTimer: WorkflowTimer,
  usedTool: boolean = false
): void {
  const summary = workflowTimer.getSummary();
  
  send(ws, {
    type: "workflow_timing",
    steps: summary.steps.map((s) => ({
      step: s.step,
      name: s.name,
      nameJa: s.nameJa,
      durationMs: s.durationMs,
    })),
    hasDbSearch: summary.hasDbSearch,
    dbSearchTime: summary.dbSearchTime,
    usedTool,
    totalMs: summary.totalDurationMs,
  });
}

/**
 * Process user text input and generate response
 */
async function processUserInput(session: Session, userText: string): Promise<void> {
  const { ws, history, log: sessionLog } = session;
  
  // Log user input to session file
  sessionLog.info(`User input: "${userText}"`);
  
  // Generate unique response ID for this request (for barge-in cancellation)
  const responseId = `${session.id}-${Date.now()}`;
  
  // Cancel any previous response by setting new responseId
  // This will cause ongoing audio chunk sends to be skipped
  if (session.currentResponseId) {
    sessionLog.debug("Cancelling previous response (barge-in)");
  }
  session.currentResponseId = responseId;
  
  // Reset pendingRequest flag (allow new request to override)
  session.pendingRequest = true;
  
  const workflow = new WorkflowTimer(session.id);

  try {
    // STEP 1 & 2: Already happened on client side, we mark as received
    workflow.startStep("STEP2_WEBSOCKET_SEND");
    workflow.endStep({ received: true });

    // STEP 3: Backend processing start
    workflow.startStep("STEP3_BACKEND_START");
    sendUserMessage(ws, userText);
    session.status = "thinking";
    sendStatus(ws, "thinking", "thinking", "考え中...");
    sessionLog.debug("Backend processing started");
    workflow.endStep();

    // STEP 4-6: LLM Request and Response
    workflow.startStep("STEP4_LLM_REQUEST");

    const assistantMessageId = `assistant-${session.id}-${Date.now()}`;

    // Prefetch combined movie search (DB + Google) in parallel when likely needed
    const shouldPrefetchMovies = needsMovieSearch(userText);
    const prefetchPromise = shouldPrefetchMovies
      ? (async () => {
          const prefetchTimer = startTimer("Combined Search (Prefetch)", { query: userText });
          const result = await combinedMovieSearch(userText);
          const timing = prefetchTimer.stop();
          workflow.recordDbSearch(timing.durationMs);
          return result.merged; // Return formatted string for LLM
        })().catch(() => null)
      : null;

    // Parallel TTS: Queue sentences and synthesize while LLM is still streaming
    interface TTSChunkResult {
      audio: string;
      sentence: string;
      index: number;
      durationMs: number;
      charCount: number;
    }
    const ttsQueue: Promise<TTSChunkResult | null>[] = [];
    let sentenceIndex = 0;

    const response = await chat(
      history,
      userText,
      async (query, genre, year) => {
        // Skip if response was cancelled (barge-in)
        if (session.currentResponseId !== responseId) {
          return ""; // Return empty to abort gracefully
        }

        // DISABLED: Long waiting audio for database operations
        // User requested to turn off long-waiting when accessing database
        // await sendLongWaiting(ws, {
        //   query: query || undefined,
        //   genre: genre || undefined,
        //   year: year || undefined,
        // }, responseId);

        // Track combined search (DB + Google) within LLM step
        if (
          prefetchPromise &&
          query.trim() === userText.trim() &&
          !genre &&
          !year
        ) {
          const prefetched = await prefetchPromise;
          if (prefetched) {
            return prefetched;
          }
        }

        const searchTimer = startTimer("Combined Search", { query, genre, year });
        const result = await combinedMovieSearch(query, genre, year);
        const searchTiming = searchTimer.stop();
        workflow.recordDbSearch(searchTiming.durationMs);
        return result.merged; // Return formatted string for LLM
      },
      (delta) => {
        // Skip if response was cancelled (barge-in)
        if (session.currentResponseId !== responseId) return;
        // Stream partial text to client for faster perceived response
        sendAssistantDelta(ws, delta, assistantMessageId);
      },
      ENABLE_PARALLEL_TTS ? (sentence, emotion) => {
        // Skip if response was cancelled (barge-in)
        if (session.currentResponseId !== responseId) return;
        
        // Parallel TTS: Start synthesizing each sentence immediately
        if (sentence.length >= MIN_SENTENCE_LENGTH_FOR_TTS) {
          const idx = sentenceIndex++;
          const startTime = performance.now();
          const charCount = sentence.length;
          
          log.debug(`[${session.id.slice(0, 8)}] TTS #${idx} START: "${sentence.slice(0, 30)}..." (${charCount} chars)`);
          sessionLog.debug(`TTS chunk #${idx} BEGIN: ${charCount} chars, emotion: ${emotion}, text: "${sentence.slice(0, 50)}..."`);

          // Use TTS concurrency limiter to avoid rate limiting
          const ttsPromise = withTTSLimit(() =>
            synthesizeSpeechBase64(sentence, {
              emotion,
              voice: "female",
            })
          ).then(audio => {
            const durationMs = Math.round(performance.now() - startTime);
            const audioKB = Math.round(audio.length * 0.75 / 1024);
            log.debug(`[${session.id.slice(0, 8)}] TTS #${idx} DONE: ${durationMs}ms`);
            sessionLog.debug(`TTS chunk #${idx} END: ${durationMs}ms, ${audioKB}KB`);
            return { audio, sentence, index: idx, durationMs, charCount };
          }).catch(err => {
            const durationMs = Math.round(performance.now() - startTime);
            log.error(`[${session.id.slice(0, 8)}] TTS #${idx} FAILED after ${durationMs}ms:`, err);
            sessionLog.error(`TTS chunk #${idx} FAILED: ${durationMs}ms`, err);
            return null;
          });
          
          ttsQueue.push(ttsPromise);
        }
      } : undefined,
      // onToolUse callback - DISABLED (moved to frontend with configurable delay)
      // Frontend now plays waiting audio automatically after NEXT_PUBLIC_WAITING_DELAY ms
      // () => {
      //   // Skip if response was cancelled (barge-in)
      //   if (session.currentResponseId !== responseId) return;
      //   sendWaiting(ws);
      // }
      undefined
    );

    workflow.endStep({
      inputLength: userText.length,
      usedTool: response.usedTool,
      hasToolUse: workflow.getSummary().hasDbSearch
    });

    sessionLog.debug(`Tool used: ${response.usedTool ? "movie search" : "none"}`);
    sessionLog.info(`Assistant response: "${response.text}" [emotion: ${response.emotion}]`);

    // Check if response was cancelled (barge-in) before proceeding
    if (session.currentResponseId !== responseId) {
      sessionLog.debug("Response cancelled, skipping delivery");
      return;
    }

    // Update conversation history
    history.push({ role: "user", content: userText });
    history.push({ role: "assistant", content: response.text });

    // Limit history to last 20 turns
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    // STEP 7: Send text response
    workflow.startStep("STEP7_TEXT_RESPONSE");
    sendAssistantMessage(ws, response.text, response.emotion, assistantMessageId);
    session.status = "speaking";
    sendStatus(ws, "speaking", response.emotion, "話しています...");
    workflow.endStep({ textLength: response.text.length, emotion: response.emotion });

    // STEP 8: TTS synthesis (parallel mode or fallback)
    workflow.startStep("STEP8_TTS_SYNTHESIS");
    
    let audioSent = false;
    
    // Short response optimization: skip chunking for very brief responses
    const useParallelTTS = ENABLE_PARALLEL_TTS && 
                           ttsQueue.length > 0 && 
                           response.text.length >= SHORT_RESPONSE_THRESHOLD;
    
    if (useParallelTTS) {
      // Process TTS chunks - send immediately as each completes (true parallel)
      const ttsOverallStart = performance.now();
      sessionLog.info(`TTS parallel mode BEGIN: ${ttsQueue.length} chunks, ${response.text.length} chars`);
      log.debug(`[${session.id.slice(0, 8)}] Sending ${ttsQueue.length} TTS chunks...`);

      const totalChunks = ttsQueue.length;
      const chunkResults: TTSChunkResult[] = [];
      let sentCount = 0;

      // Process all chunks in parallel and send each as it completes
      const sendPromises = ttsQueue.map(async (promise, i) => {
        const result = await promise;
        if (result) {
          // Check if this response is still current (not cancelled by barge-in)
          if (session.currentResponseId !== responseId) {
            log.debug(`[${session.id.slice(0, 8)}] Skipping chunk #${result.index} (cancelled)`);
            return null;
          }
          
          // Send immediately when this chunk is ready (don't wait for earlier chunks)
          send(ws, {
            type: "audio_chunk",
            data: result.audio,
            format: "mp3",
            index: result.index,
            total: totalChunks,
            isLast: result.index === totalChunks - 1,
            responseId,  // Include responseId so frontend can ignore stale chunks
          });
          sentCount++;
          chunkResults.push(result);
          return result;
        }
        return null;
      });
      
      // Wait for all to complete (but they've already been sent as they finished)
      await Promise.all(sendPromises);
      audioSent = sentCount > 0;
      
      const ttsOverallDuration = Math.round(performance.now() - ttsOverallStart);
      
      // Calculate totals for logging
      const totalTTSTime = chunkResults.reduce((sum, c) => sum + c.durationMs, 0);
      const totalChars = chunkResults.reduce((sum, c) => sum + c.charCount, 0);
      const totalAudioKB = chunkResults.reduce((sum, c) => sum + Math.round(c.audio.length * 0.75 / 1024), 0);
      
      // Log TTS summary
      chunkResults.sort((a, b) => a.index - b.index);
      log.debug(`[${session.id.slice(0, 8)}] TTS complete: ${chunkResults.length} chunks, ${totalTTSTime}ms, ${totalAudioKB}KB`);
      sessionLog.info(`TTS parallel mode END: ${chunkResults.length} chunks, wall time ${ttsOverallDuration}ms, total TTS time ${totalTTSTime}ms, ${totalAudioKB}KB`);

      workflow.endStep({ 
        mode: "parallel", 
        chunks: totalChunks,
        totalTTSTime,
        textLength: response.text.length 
      });
    }
    
    // Fallback: synthesize full response if parallel TTS didn't produce audio
    if (!audioSent) {
      // Check if response was cancelled before starting sequential TTS
      if (session.currentResponseId !== responseId) {
        log.debug(`[${session.id.slice(0, 8)}] Skipping sequential TTS (cancelled)`);
        workflow.endStep({ mode: "cancelled" });
      } else {
        log.debug(`[${session.id.slice(0, 8)}] Sequential TTS (fallback)`);
        const seqStartTime = performance.now();
        sessionLog.info(`TTS sequential mode BEGIN: ${response.text.length} chars, emotion: ${response.emotion}`);
        
        try {
          const audioBase64 = await synthesizeSpeechBase64(response.text, {
            emotion: response.emotion,
            voice: "female",
          });
          
          // Check again after TTS completes (could be cancelled during synthesis)
          if (session.currentResponseId !== responseId) {
            log.debug(`[${session.id.slice(0, 8)}] Skipping audio send (cancelled)`);
            sessionLog.info("TTS sequential mode CANCELLED");
            workflow.endStep({ mode: "cancelled" });
          } else {
            const seqDuration = Math.round(performance.now() - seqStartTime);
            const audioKB = Math.round(audioBase64.length * 0.75 / 1024);
            log.debug(`[${session.id.slice(0, 8)}] TTS sequential: ${seqDuration}ms, ${audioKB}KB`);
            sessionLog.info(`TTS sequential mode END: ${seqDuration}ms, ${audioKB}KB`);

            workflow.endStep({ 
              mode: "sequential",
              textLength: response.text.length, 
              durationMs: seqDuration,
              emotion: response.emotion 
            });

            // STEP 9: Send audio data with responseId for tracking
            workflow.startStep("STEP9_AUDIO_SEND");
            send(ws, {
              type: "audio",
              data: audioBase64,
              format: "mp3",
              responseId,  // Add responseId to full audio messages too
            });
            workflow.endStep({ audioSize: audioBase64.length });
            audioSent = true;
          }
        } catch (ttsError) {
          log.error("TTS error:", ttsError);
          sessionLog.error("TTS sequential mode ERROR", ttsError);
          workflow.endStep({ error: true });
          send(ws, {
            type: "tts_error",
            message: "音声生成に失敗しました",
          });
        }
      }
    } else {
      // Mark audio send complete for parallel mode
      workflow.startStep("STEP9_AUDIO_SEND");
      workflow.endStep({ mode: "parallel_streaming" });
    }

    // Only send completion updates if this response is still current
    if (session.currentResponseId === responseId) {
      // STEP 11: Send timing info
      workflow.startStep("STEP11_TIMING_SEND");
      workflow.logSummary();
      sendWorkflowTiming(ws, workflow, response.usedTool);
      workflow.endStep();

      // STEP 12: Complete
      workflow.startStep("STEP12_COMPLETE");
      session.status = "idle";
      sendStatus(ws, "idle", response.emotion, "");
      workflow.endStep();
    } else {
      log.debug(`[${session.id.slice(0, 8)}] Skipping completion (cancelled)`);
    }

  } catch (error) {
    sessionLog.error("Process input error:", error);
    log.error("Process input error:", error);
    // Only update status if this response is still current
    if (session.currentResponseId === responseId) {
      workflow.logSummary();
      session.status = "idle";
      sendStatus(ws, "idle", "confused", "");
      sendError(ws, "エラーが発生しました。もう一度お試しください。");
    }
  } finally {
    // Always reset pending flag
    session.pendingRequest = false;
  }
}

/**
 * Handle incoming WebSocket message
 */
async function handleMessage(session: Session, data: string): Promise<void> {
  // Update last activity time
  session.lastActivityTime = Date.now();

  try {
    const message = JSON.parse(data) as WSMessage;

    switch (message.type) {
      case "text_input": {
        const text = message.text as string;
        if (text && text.trim()) {
          const trimmedText = text.trim();

          // Validate message length
          if (trimmedText.length > MAX_MESSAGE_LENGTH) {
            session.log.warn(`Message too long: ${trimmedText.length} chars`);
            sendError(session.ws, `メッセージが長すぎます（最大${MAX_MESSAGE_LENGTH}文字）`);
            return;
          }

          // Check rate limit
          if (!checkRateLimit(session)) {
            session.log.warn("Rate limit exceeded");
            sendError(session.ws, "リクエストが多すぎます。少し待ってからお試しください。");
            return;
          }

          await processUserInput(session, trimmedText);
        }
        break;
      }

      case "ping": {
        send(session.ws, { type: "pong" });
        break;
      }

      default:
        session.log.warn(`Unknown message type: ${message.type}`);
        log.warn("Unknown message type:", message.type);
    }
  } catch (error) {
    session.log.error("Handle message error:", error);
    log.error("Handle message error:", error);
    sendError(session.ws, "メッセージの処理に失敗しました");
  }
}

/**
 * Handle new WebSocket connection
 */
export function handleConnection(ws: WebSocket): void {
  const sessionId = uuidv4();
  
  // Create session-specific logger (logs to logs/{sessionId}.log when DEBUG=true)
  const sessionLog = createSessionLogger("WS", sessionId);
  
  const now = Date.now();
  const session: Session = {
    id: sessionId,
    ws,
    history: [],
    status: "idle",
    pendingRequest: false,
    currentResponseId: null,
    lastActivityTime: now,
    requestCount: 0,
    requestWindowStart: now,
    log: sessionLog,  // Add session-specific logger
  };

  sessions.set(sessionId, session);
  log.info(`Client connected: ${sessionId}`);
  sessionLog.info("WebSocket connection established");

  // Send welcome message
  send(ws, {
    type: "connected",
    sessionId,
    message: "ラビットAIに接続しました！",
  });

  // Send initial status
  sendStatus(ws, "idle", "happy", "");

  // Send greeting text only (no audio to avoid overlap issues)
  setTimeout(() => {
    const greeting = "こんにちは！";
    sendAssistantMessage(ws, greeting, "happy");
    session.history.push({ role: "assistant", content: greeting });
    sessionLog.debug("Greeting sent (text only, no audio)");
  }, 500);

  // Handle incoming messages
  ws.on("message", (data) => {
    handleMessage(session, data.toString());
  });

  // Handle close
  ws.on("close", () => {
    sessions.delete(sessionId);
    log.info(`Client disconnected: ${sessionId}`);
    sessionLog.info("WebSocket connection closed");
  });

  // Handle errors
  ws.on("error", (error) => {
    log.error(`WebSocket error for ${sessionId}:`, error);
    sessionLog.error("WebSocket error", error);
    sessions.delete(sessionId);
  });
}

/**
 * Get active session count
 */
export function getSessionCount(): number {
  return sessions.size;
}
