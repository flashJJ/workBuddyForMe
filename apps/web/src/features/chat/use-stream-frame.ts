'use client';

import * as React from 'react';
import type { StreamTiming } from './chat-session.types';

/**
 * v2.4 M5 / P1-4：流式帧合帧 + 本轮计时（从 use-chat-session 外迁的协作者）。
 * - delta 按 rAF 合帧提交；终态/停止/重置由调用方显式冲刷或丢弃，保证文本不丢不串轮
 * - 计时只记录本地时钟：开始、首字、落定；分档由 UI 侧复用 P0-1 latencyTier
 * 状态仍归会话层所有（append 回调注入），本协作者不反向依赖会话模块。
 */
export function useStreamFrame(append: (text: string) => void) {
  const pendingRef = React.useRef('');
  const rafRef = React.useRef<number | null>(null);
  const [timing, setTiming] = React.useState<StreamTiming | null>(null);

  const cancelPendingDelta = React.useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingRef.current = '';
  }, []);

  const flushPendingDelta = React.useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const buffered = pendingRef.current;
    if (!buffered) return;
    pendingRef.current = '';
    append(buffered);
  }, [append]);

  const queueDelta = React.useCallback(
    (text: string) => {
      pendingRef.current += text;
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        flushPendingDelta();
      });
    },
    [flushPendingDelta],
  );

  const startTiming = React.useCallback(() => {
    cancelPendingDelta();
    setTiming({ startedAt: Date.now(), firstTokenAt: null, settledAt: null });
  }, [cancelPendingDelta]);

  const markFirstToken = React.useCallback(() => {
    setTiming((prev) =>
      prev && prev.firstTokenAt === null ? { ...prev, firstTokenAt: Date.now() } : prev,
    );
  }, []);

  const settleTiming = React.useCallback(() => {
    setTiming((prev) =>
      prev && prev.settledAt === null ? { ...prev, settledAt: Date.now() } : prev,
    );
  }, []);

  const resetStream = React.useCallback(() => {
    cancelPendingDelta();
    setTiming(null);
  }, [cancelPendingDelta]);

  React.useEffect(() => () => cancelPendingDelta(), [cancelPendingDelta]);

  return {
    timing,
    startTiming,
    markFirstToken,
    settleTiming,
    queueDelta,
    flushPendingDelta,
    resetStream,
  };
}
