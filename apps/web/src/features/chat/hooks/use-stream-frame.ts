'use client';

import * as React from 'react';
import type { StreamTiming } from '../types/chat-session.types';
import { PERF_MARK, markPerf } from '../perf/marks';

/** 首段判定：出现换行或累计达到 80 字符 */
const FIRST_PARAGRAPH_MIN_CHARS = 80;

/**
 * v2.4 M5 / P1-4：流式帧合帧 + 本轮计时（从 use-chat-session 外迁的协作者）。
 * - delta 按 rAF 合帧提交；终态/停止/重置由调用方显式冲刷或丢弃，保证文本不丢不串轮
 * - 计时只记录本地时钟：开始、首字、首段、落定；分档由 UI 侧复用 P0-1 latencyTier
 * - v4.20：同步写 Performance Timeline 打点，供性能报告读取；不保存正文
 * 状态仍归会话层所有（append 回调注入），本协作者不反向依赖会话模块。
 */
export function useStreamFrame(append: (text: string) => void) {
  const pendingRef = React.useRef('');
  const rafRef = React.useRef<number | null>(null);
  const accumulatedRef = React.useRef('');
  const firstTokenRef = React.useRef(false);
  const firstParagraphRef = React.useRef(false);
  const settledRef = React.useRef(false);
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
      accumulatedRef.current += text;
      if (
        !firstParagraphRef.current &&
        (accumulatedRef.current.includes('\n') ||
          accumulatedRef.current.length >= FIRST_PARAGRAPH_MIN_CHARS)
      ) {
        firstParagraphRef.current = true;
        markPerf(PERF_MARK.firstParagraph);
        setTiming((prev) =>
          prev && prev.firstParagraphAt == null ? { ...prev, firstParagraphAt: Date.now() } : prev,
        );
      }
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
    accumulatedRef.current = '';
    firstTokenRef.current = false;
    firstParagraphRef.current = false;
    settledRef.current = false;
    markPerf(PERF_MARK.send);
    setTiming({
      startedAt: Date.now(),
      firstTokenAt: null,
      firstParagraphAt: null,
      settledAt: null,
      ok: null,
    });
  }, [cancelPendingDelta]);

  const markFirstToken = React.useCallback(() => {
    if (firstTokenRef.current) return;
    firstTokenRef.current = true;
    markPerf(PERF_MARK.firstToken);
    setTiming((prev) => (prev && prev.firstTokenAt === null ? { ...prev, firstTokenAt: Date.now() } : prev));
  }, []);

  /** ok=false 表示错误/用户停止；只有正常完成的轮次才进入首字基线 */
  const settleTiming = React.useCallback((ok = false) => {
    if (settledRef.current) return;
    settledRef.current = true;
    markPerf(PERF_MARK.done);
    setTiming((prev) =>
      prev && prev.settledAt === null ? { ...prev, settledAt: Date.now(), ok } : prev,
    );
  }, []);

  const resetStream = React.useCallback(() => {
    cancelPendingDelta();
    accumulatedRef.current = '';
    firstTokenRef.current = false;
    firstParagraphRef.current = false;
    settledRef.current = false;
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
