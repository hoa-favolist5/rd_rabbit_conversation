"use client";

import React from "react";
import styles from "./TimingDisplay.module.css";

interface TimingInfo {
  timings: Array<{ action: string; durationMs: number }>;
  totalMs: number;
}

interface TimingDisplayProps {
  timing: TimingInfo | null;
}

function getTimingColor(ms: number): string {
  if (ms < 500) return "#10b981"; // green - fast
  if (ms < 1500) return "#f59e0b"; // yellow - medium
  return "#ef4444"; // red - slow
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

export function TimingDisplay({ timing }: TimingDisplayProps) {
  if (!timing) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.icon}>⏱️</span>
        <span className={styles.title}>Performance</span>
        <span
          className={styles.total}
          style={{ color: getTimingColor(timing.totalMs) }}
        >
          {formatDuration(timing.totalMs)}
        </span>
      </div>
      <div className={styles.breakdown}>
        {timing.timings.map((t, index) => {
          const percentage =
            timing.totalMs > 0
              ? Math.round((t.durationMs / timing.totalMs) * 100)
              : 0;
          return (
            <div key={index} className={styles.item}>
              <div className={styles.itemHeader}>
                <span className={styles.action}>{t.action}</span>
                <span
                  className={styles.duration}
                  style={{ color: getTimingColor(t.durationMs) }}
                >
                  {formatDuration(t.durationMs)}
                </span>
              </div>
              <div className={styles.barContainer}>
                <div
                  className={styles.bar}
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: getTimingColor(t.durationMs),
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
