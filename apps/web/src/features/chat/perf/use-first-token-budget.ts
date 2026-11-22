'use client';

import * as React from 'react';
import type { StreamTiming } from '../types/chat-session.types';
import {
  appendFirstTokenSample,
  firstTokenThreshold,
  readFirstTokenSamples,
} from './first-token-baseline';

export interface FirstTokenBudget {
  visible: boolean;
  elapsedMs: number;
  thresholdMs: number;
  dismiss: () => void;
}

/**
 * v4.20：首字预算提示。
 *
 * 只在本轮首字未到达时计时；超过 min(P50×1.5, 10s) 显示一次提示。
 * 正常完成的轮次写回最近 20 轮基线；错误/停止不写。
 */
export function useFirstTokenBudget(timing: StreamTiming | null): FirstTokenBudget {
  const storage = typeof window === 'undefined' ? null : window.localStorage;
  const [samples, setSamples] = React.useState<number[]>(() => readFirstTokenSamples(storage));
  const [visible, setVisible] = React.useState(false);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [dismissedStart, setDismissedStart] = React.useState<number | null>(null);

  const thresholdMs = React.useMemo(() => firstTokenThreshold(samples), [samples]);
  const startedAt = timing?.startedAt ?? null;
  const firstTokenAt = timing?.firstTokenAt ?? null;
  const settledAt = timing?.settledAt ?? null;
  const ok = timing?.ok ?? null;

  React.useEffect(() => {
    setVisible(false);
    setElapsedMs(0);
    if (!startedAt || firstTokenAt !== null || settledAt !== null) return;
    const remaining = Math.max(0, thresholdMs - (Date.now() - startedAt));
    const timer = setTimeout(() => {
      if (dismissedStart === startedAt) return;
      setElapsedMs(Date.now() - startedAt);
      setVisible(true);
    }, remaining);
    return () => clearTimeout(timer);
  }, [startedAt, firstTokenAt, settledAt, thresholdMs, dismissedStart]);

  React.useEffect(() => {
    if (firstTokenAt !== null) setVisible(false);
  }, [firstTokenAt]);

  React.useEffect(() => {
    if (!startedAt || firstTokenAt === null || settledAt === null || ok !== true) return;
    const value = firstTokenAt - startedAt;
    if (!Number.isFinite(value) || value <= 0) return;
    setSamples(appendFirstTokenSample(storage, value));
    // 每轮只记录一次：deps 命中同一轮后不再变化
  }, [startedAt, firstTokenAt, settledAt, ok, storage]);

  const dismiss = React.useCallback(() => {
    setVisible(false);
    setDismissedStart(startedAt);
  }, [startedAt]);

  return {
    visible: visible && dismissedStart !== startedAt,
    elapsedMs,
    thresholdMs,
    dismiss,
  };
}
