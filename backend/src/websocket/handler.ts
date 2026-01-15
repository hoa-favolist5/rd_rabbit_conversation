import { WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import { chat, needsMovieSearch } from "../services/claude.js";
import { synthesizeSpeechBase64 } from "../services/azure-tts.js";
import { searchMovies } from "../db/movies.js";
import { startTimer } from "../utils/timer.js";
import type {
  ConversationTurn,
  ConversationStatus,
  EmotionType,
  StatusMessage,
  UserMessage,
  AssistantMessage,
  ErrorMessage,
  WSMessage,
} from "../types/index.js";

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
}

// Active sessions
const sessions = new Map<string, Session>();

// Step labels
const STEP_LABELS: Record<WorkflowStep, { name: string; nameJa: string }> = {
  STEP1_TEXT_INPUT: { name: "Text Input", nameJa: "テキスト入力" },
  STEP2_WEBSOCKET_SEND: { name: "WebSocket Send", nameJa: "WebSocket送信" },
  STEP3_BACKEND_START: { name: "Backend Start", nameJa: "Backend処理開始" },
  STEP4_LLM_REQUEST: { name: "LLM Request", nameJa: "Claude API呼び出し" },
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

      // Log step
      const color = durationMs < 100 ? "\x1b[32m" : durationMs < 500 ? "\x1b[33m" : "\x1b[31m";
      const reset = "\x1b[0m";
      console.log(
        `${color}⏱️  [${this.sessionId.slice(0, 8)}] ${this.currentStep}: ${durationMs}ms${reset}`
      );

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
   * Log summary
   */
  logSummary(): void {
    const summary = this.getSummary();
    console.log("\n📊 Workflow Summary:");
    console.log(`   Session: ${this.sessionId.slice(0, 8)}`);
    console.log(`   Total: ${summary.totalDurationMs}ms`);
    console.log("   Steps:");
    for (const step of this.steps) {
      const percentage = ((step.durationMs / summary.totalDurationMs) * 100).toFixed(1);
      console.log(`     - ${step.nameJa}: ${step.durationMs}ms (${percentage}%)`);
    }
    if (this.hasDbSearch) {
      console.log(`     - (DB Search included: ${this.dbSearchTime}ms)`);
    }
    console.log("");
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
  const { ws, history } = session;
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
    workflow.endStep();

    // STEP 4-6: LLM Request and Response
    workflow.startStep("STEP4_LLM_REQUEST");

    const assistantMessageId = `assistant-${session.id}-${Date.now()}`;

    // Prefetch movie search in parallel when likely needed
    const shouldPrefetchMovies = needsMovieSearch(userText);
    const prefetchPromise = shouldPrefetchMovies
      ? (async () => {
          const prefetchTimer = startTimer("DB Search (Prefetch)", { query: userText });
          const result = await searchMovies(userText);
          const timing = prefetchTimer.stop();
          workflow.recordDbSearch(timing.durationMs);
          return result;
        })().catch(() => null)
      : null;

    const response = await chat(
      history,
      userText,
      async (query, genre, year) => {
        // Track DB search within LLM step
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

        const dbTimer = startTimer("DB Search", { query, genre, year });
        const result = await searchMovies(query, genre, year);
        const dbTiming = dbTimer.stop();
        workflow.recordDbSearch(dbTiming.durationMs);
        return result;
      },
      (delta) => {
        // Stream partial text to client for faster perceived response
        sendAssistantDelta(ws, delta, assistantMessageId);
      }
    );

    workflow.endStep({
      inputLength: userText.length,
      usedTool: response.usedTool,
      hasToolUse: workflow.getSummary().hasDbSearch
    });

    if (response.usedTool) {
      console.log("🔧 Tool used: movie search (2 API calls)");
    } else {
      console.log("⚡ No tool used: single API call");
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

    // STEP 8: TTS synthesis
    let audioBase64: string | null = null;
    try {
      audioBase64 = await workflow.trackStep(
        "STEP8_TTS_SYNTHESIS",
        async () => {
          return synthesizeSpeechBase64(response.text, {
            emotion: response.emotion,
            voice: "female",
          });
        },
        { textLength: response.text.length, emotion: response.emotion }
      );
    } catch (ttsError) {
      console.error("TTS error:", ttsError);
      send(ws, {
        type: "tts_error",
        message: "音声生成に失敗しました",
      });
    }

    // STEP 9: Send audio data
    if (audioBase64) {
      workflow.startStep("STEP9_AUDIO_SEND");
      send(ws, {
        type: "audio",
        data: audioBase64,
        format: "mp3",
      });
      workflow.endStep({ audioSize: audioBase64.length });
    }

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

  } catch (error) {
    console.error("Process input error:", error);
    workflow.logSummary();
    session.status = "idle";
    sendStatus(ws, "idle", "confused", "");
    sendError(ws, "エラーが発生しました。もう一度お試しください。");
  }
}

/**
 * Handle incoming WebSocket message
 */
async function handleMessage(session: Session, data: string): Promise<void> {
  try {
    const message = JSON.parse(data) as WSMessage;

    switch (message.type) {
      case "text_input": {
        const text = message.text as string;
        if (text && text.trim()) {
          await processUserInput(session, text.trim());
        }
        break;
      }

      case "start_listening": {
        session.status = "listening";
        sendStatus(session.ws, "listening", "listening", "聞いています...");
        break;
      }

      case "stop_listening": {
        session.status = "idle";
        sendStatus(session.ws, "idle", "neutral", "");
        break;
      }

      case "ping": {
        send(session.ws, { type: "pong" });
        break;
      }

      default:
        console.log("Unknown message type:", message.type);
    }
  } catch (error) {
    console.error("Handle message error:", error);
    sendError(session.ws, "メッセージの処理に失敗しました");
  }
}

/**
 * Handle new WebSocket connection
 */
export function handleConnection(ws: WebSocket): void {
  const sessionId = uuidv4();
  
  const session: Session = {
    id: sessionId,
    ws,
    history: [],
    status: "idle",
  };

  sessions.set(sessionId, session);
  console.log(`📱 Client connected: ${sessionId}`);

  // Send welcome message
  send(ws, {
    type: "connected",
    sessionId,
    message: "ラビットAIに接続しました！",
  });

  // Send initial status
  sendStatus(ws, "idle", "happy", "");

  // Send greeting
  setTimeout(async () => {
    const greetingTimer = startTimer("Greeting TTS");
    try {
      const greeting = "こんにちは！ラビットです。何かお手伝いできることはありますか？映画について聞きたいことがあれば、何でも聞いてくださいね！";
      
      sendAssistantMessage(ws, greeting, "happy");
      session.history.push({ role: "assistant", content: greeting });

      // Generate greeting audio
      try {
        const audioBase64 = await synthesizeSpeechBase64(greeting, {
          emotion: "happy",
          voice: "female",
        });
        greetingTimer.stopAndLog(sessionId);
        
        send(ws, {
          type: "audio",
          data: audioBase64,
          format: "mp3",
        });
      } catch (ttsError) {
        console.error("Greeting TTS error:", ttsError);
        greetingTimer.stopAndLog(sessionId);
      }
    } catch (error) {
      console.error("Greeting error:", error);
      greetingTimer.stopAndLog(sessionId);
    }
  }, 500);

  // Handle incoming messages
  ws.on("message", (data) => {
    handleMessage(session, data.toString());
  });

  // Handle close
  ws.on("close", () => {
    sessions.delete(sessionId);
    console.log(`📴 Client disconnected: ${sessionId}`);
  });

  // Handle errors
  ws.on("error", (error) => {
    console.error(`WebSocket error for ${sessionId}:`, error);
    sessions.delete(sessionId);
  });
}

/**
 * Get active session count
 */
export function getSessionCount(): number {
  return sessions.size;
}
