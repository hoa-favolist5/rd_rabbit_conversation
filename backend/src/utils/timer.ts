/**
 * Performance timing utility for tracking action durations
 */

export interface TimingResult {
  action: string;
  durationMs: number;
  startTime: Date;
  endTime: Date;
}

export interface TimingLog {
  sessionId?: string;
  action: string;
  durationMs: number;
  timestamp: string;
  details?: Record<string, unknown>;
}

/**
 * Timer class for tracking individual action durations
 */
export class Timer {
  private startTime: number;
  private action: string;
  private details?: Record<string, unknown>;

  constructor(action: string, details?: Record<string, unknown>) {
    this.action = action;
    this.details = details;
    this.startTime = performance.now();
  }

  /**
   * Stop the timer and return the result
   */
  stop(): TimingResult {
    const endTime = performance.now();
    const durationMs = Math.round(endTime - this.startTime);

    return {
      action: this.action,
      durationMs,
      startTime: new Date(Date.now() - durationMs),
      endTime: new Date(),
    };
  }

  /**
   * Stop the timer and log the result
   */
  stopAndLog(sessionId?: string): TimingResult {
    const result = this.stop();
    logTiming(this.action, result.durationMs, sessionId, this.details);
    return result;
  }
}

/**
 * Log timing information with consistent formatting
 */
export function logTiming(
  action: string,
  durationMs: number,
  sessionId?: string,
  details?: Record<string, unknown>
): void {
  const log: TimingLog = {
    sessionId,
    action,
    durationMs,
    timestamp: new Date().toISOString(),
    details,
  };

  // Color-coded console output based on duration
  const color = durationMs < 500 ? "\x1b[32m" : durationMs < 2000 ? "\x1b[33m" : "\x1b[31m";
  const reset = "\x1b[0m";
  const sessionPrefix = sessionId ? `[${sessionId.slice(0, 8)}]` : "";

  console.log(
    `${color}⏱️  ${sessionPrefix} ${action}: ${durationMs}ms${reset}`,
    details ? JSON.stringify(details) : ""
  );
}

/**
 * Create a timer for an action
 */
export function startTimer(action: string, details?: Record<string, unknown>): Timer {
  return new Timer(action, details);
}

/**
 * Wrap an async function with timing
 */
export async function withTiming<T>(
  action: string,
  fn: () => Promise<T>,
  sessionId?: string,
  details?: Record<string, unknown>
): Promise<{ result: T; durationMs: number }> {
  const timer = startTimer(action, details);
  try {
    const result = await fn();
    const timing = timer.stopAndLog(sessionId);
    return { result, durationMs: timing.durationMs };
  } catch (error) {
    const timing = timer.stop();
    logTiming(`${action} (FAILED)`, timing.durationMs, sessionId, details);
    throw error;
  }
}

/**
 * Aggregate timing tracker for a conversation turn
 */
export class ConversationTimer {
  private sessionId: string;
  private timings: TimingResult[] = [];
  private overallStart: number;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.overallStart = performance.now();
  }

  /**
   * Track an action
   */
  async track<T>(
    action: string,
    fn: () => Promise<T>,
    details?: Record<string, unknown>
  ): Promise<T> {
    const { result, durationMs } = await withTiming(
      action,
      fn,
      this.sessionId,
      details
    );
    this.timings.push({
      action,
      durationMs,
      startTime: new Date(Date.now() - durationMs),
      endTime: new Date(),
    });
    return result;
  }

  /**
   * Get summary of all tracked timings
   */
  getSummary(): {
    sessionId: string;
    totalDurationMs: number;
    timings: TimingResult[];
  } {
    const totalDurationMs = Math.round(performance.now() - this.overallStart);
    return {
      sessionId: this.sessionId,
      totalDurationMs,
      timings: this.timings,
    };
  }

  /**
   * Log the summary
   */
  logSummary(): void {
    const summary = this.getSummary();
    console.log("\n📊 Conversation Turn Summary:");
    console.log(`   Session: ${this.sessionId.slice(0, 8)}`);
    console.log(`   Total: ${summary.totalDurationMs}ms`);
    console.log("   Breakdown:");
    for (const timing of this.timings) {
      const percentage = ((timing.durationMs / summary.totalDurationMs) * 100).toFixed(1);
      console.log(`     - ${timing.action}: ${timing.durationMs}ms (${percentage}%)`);
    }
    console.log("");
  }
}
