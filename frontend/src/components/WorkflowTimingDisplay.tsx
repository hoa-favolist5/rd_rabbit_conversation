"use client";

import React from "react";
import styles from "./WorkflowTimingDisplay.module.css";

interface WorkflowStep {
  step: string;
  name: string;
  nameJa: string;
  durationMs: number;
}

interface WorkflowTiming {
  steps: WorkflowStep[];
  hasDbSearch: boolean;
  dbSearchTime: number;
  usedTool: boolean;
  totalMs: number;
}

interface WorkflowTimingDisplayProps {
  timing: WorkflowTiming | null;
}

// Step icons based on workflow
const STEP_ICONS: Record<string, string> = {
  STEP1_TEXT_INPUT: "⌨️",
  STEP2_WEBSOCKET_SEND: "📡",
  STEP3_BACKEND_START: "⚡",
  STEP4_LLM_REQUEST: "🤖",
  STEP5_DB_SEARCH: "🔍",
  STEP6_LLM_RESPONSE: "💬",
  STEP7_TEXT_RESPONSE: "📝",
  STEP8_TTS_SYNTHESIS: "🔊",
  STEP9_AUDIO_SEND: "📤",
  STEP10_AUDIO_PLAY: "▶️",
  STEP11_TIMING_SEND: "⏱️",
  STEP12_COMPLETE: "✅",
};

// Step categories for grouping
const STEP_CATEGORIES: Record<string, { color: string; label: string }> = {
  STEP2_WEBSOCKET_SEND: { color: "#6366f1", label: "通信" },
  STEP3_BACKEND_START: { color: "#8b5cf6", label: "処理" },
  STEP4_LLM_REQUEST: { color: "#ec4899", label: "AI" },
  STEP7_TEXT_RESPONSE: { color: "#14b8a6", label: "応答" },
  STEP8_TTS_SYNTHESIS: { color: "#f59e0b", label: "音声" },
  STEP9_AUDIO_SEND: { color: "#10b981", label: "送信" },
  STEP11_TIMING_SEND: { color: "#6b7280", label: "計測" },
  STEP12_COMPLETE: { color: "#22c55e", label: "完了" },
};

function getTimingColor(ms: number): string {
  if (ms < 50) return "#10b981"; // green - very fast
  if (ms < 200) return "#22c55e"; // light green - fast
  if (ms < 500) return "#84cc16"; // lime - good
  if (ms < 1000) return "#f59e0b"; // yellow - medium
  if (ms < 2000) return "#f97316"; // orange - slow
  return "#ef4444"; // red - very slow
}

function formatDuration(ms: number): string {
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function getStepNumber(step: string): string {
  const match = step.match(/STEP(\d+)/);
  return match ? match[1] : "?";
}

export function WorkflowTimingDisplay({ timing }: WorkflowTimingDisplayProps) {
  if (!timing || timing.steps.length === 0) {
    return null;
  }

  // Calculate cumulative time for waterfall chart
  let cumulativeTime = 0;
  const stepsWithCumulative = timing.steps.map((step) => {
    const startPercent = (cumulativeTime / timing.totalMs) * 100;
    const widthPercent = (step.durationMs / timing.totalMs) * 100;
    cumulativeTime += step.durationMs;
    return { ...step, startPercent, widthPercent };
  });

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.icon}>📊</span>
          <span className={styles.title}>Workflow Performance</span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.totalLabel}>Total:</span>
          <span
            className={styles.totalValue}
            style={{ color: getTimingColor(timing.totalMs) }}
          >
            {formatDuration(timing.totalMs)}
          </span>
        </div>
      </div>

      {/* Waterfall Timeline */}
      <div className={styles.timeline}>
        <div className={styles.timelineHeader}>
          <span>0ms</span>
          <span>{formatDuration(timing.totalMs / 2)}</span>
          <span>{formatDuration(timing.totalMs)}</span>
        </div>
        <div className={styles.timelineTrack}>
          {stepsWithCumulative.map((step, index) => (
            <div
              key={index}
              className={styles.timelineBar}
              style={{
                left: `${step.startPercent}%`,
                width: `${Math.max(step.widthPercent, 1)}%`,
                backgroundColor: STEP_CATEGORIES[step.step]?.color || getTimingColor(step.durationMs),
              }}
              title={`${step.nameJa}: ${formatDuration(step.durationMs)}`}
            />
          ))}
        </div>
      </div>

      {/* Step Details */}
      <div className={styles.steps}>
        {timing.steps.map((step, index) => {
          const percentage =
            timing.totalMs > 0
              ? ((step.durationMs / timing.totalMs) * 100).toFixed(1)
              : "0";
          const category = STEP_CATEGORIES[step.step];

          return (
            <div key={index} className={styles.step}>
              <div className={styles.stepLeft}>
                <span className={styles.stepNumber}>
                  {getStepNumber(step.step)}
                </span>
                <span className={styles.stepIcon}>
                  {STEP_ICONS[step.step] || "•"}
                </span>
                <span className={styles.stepName}>{step.nameJa}</span>
                {category && (
                  <span
                    className={styles.stepCategory}
                    style={{ backgroundColor: category.color }}
                  >
                    {category.label}
                  </span>
                )}
              </div>
              <div className={styles.stepRight}>
                <div className={styles.stepBarContainer}>
                  <div
                    className={styles.stepBar}
                    style={{
                      width: `${Math.min(parseFloat(percentage), 100)}%`,
                      backgroundColor: getTimingColor(step.durationMs),
                    }}
                  />
                </div>
                <span
                  className={styles.stepDuration}
                  style={{ color: getTimingColor(step.durationMs) }}
                >
                  {formatDuration(step.durationMs)}
                </span>
                <span className={styles.stepPercent}>{percentage}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tool Usage Info */}
      <div className={timing.usedTool ? styles.toolInfoUsed : styles.toolInfoFast}>
        <span className={styles.toolIcon}>{timing.usedTool ? "🔧" : "⚡"}</span>
        <span className={styles.toolLabel}>
          {timing.usedTool ? "Tool使用 (2 API calls)" : "Tool未使用 (1 API call)"}
        </span>
        {timing.hasDbSearch && (
          <span
            className={styles.dbValue}
            style={{ color: getTimingColor(timing.dbSearchTime) }}
          >
            DB: {formatDuration(timing.dbSearchTime)}
          </span>
        )}
      </div>

      {/* Performance Summary */}
      <div className={styles.summary}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>ステップ数</span>
          <span className={styles.summaryValue}>{timing.steps.length}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>平均/ステップ</span>
          <span className={styles.summaryValue}>
            {formatDuration(Math.round(timing.totalMs / timing.steps.length))}
          </span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>最長ステップ</span>
          <span className={styles.summaryValue}>
            {timing.steps.reduce((max, s) => 
              s.durationMs > max.durationMs ? s : max
            ).nameJa}
          </span>
        </div>
      </div>
    </div>
  );
}
