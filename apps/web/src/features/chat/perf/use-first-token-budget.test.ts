// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { StreamTiming } from '../types/chat-session.types';
import { FIRST_TOKEN_SAMPLES_KEY } from './first-token-baseline';
import { useFirstTokenBudget } from './use-first-token-budget';

const START = 1_000_000;

function timing(patch: Partial<StreamTiming> = {}): StreamTiming {
  return {
    startedAt: START,
    firstTokenAt: null,
    firstParagraphAt: null,
    settledAt: null,
    ok: null,
    ...patch,
  };
}

describe('v4.20 首字预算提示', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('无基线时 10 秒提示，提前不提示', () => {
    const { result } = renderHook(() => useFirstTokenBudget(timing()));
    act(() => vi.advanceTimersByTime(9_000));
    expect(result.current.visible).toBe(false);
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.visible).toBe(true);
    expect(result.current.thresholdMs).toBe(10_000);
  });

  it('有基线时按 P50 × 1.5 提示', () => {
    localStorage.setItem(FIRST_TOKEN_SAMPLES_KEY, JSON.stringify([2000]));
    const { result } = renderHook(() => useFirstTokenBudget(timing()));
    expect(result.current.thresholdMs).toBe(3000);
    act(() => vi.advanceTimersByTime(3_000));
    expect(result.current.visible).toBe(true);
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(3_000);
  });

  it('首字提前到达会取消提示', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: StreamTiming }) => useFirstTokenBudget(value),
      { initialProps: { value: timing() } },
    );
    act(() => vi.advanceTimersByTime(2_000));
    rerender({ value: timing({ firstTokenAt: START + 1_500 }) });
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current.visible).toBe(false);
  });

  it('只有正常完成才写入基线；错误/停止不写', () => {
    const { rerender } = renderHook(
      ({ value }: { value: StreamTiming }) => useFirstTokenBudget(value),
      { initialProps: { value: timing() } },
    );
    rerender({
      value: timing({ firstTokenAt: START + 1_200, settledAt: START + 4_000, ok: false }),
    });
    expect(localStorage.getItem(FIRST_TOKEN_SAMPLES_KEY)).toBeNull();

    rerender({
      value: timing({ firstTokenAt: START + 1_200, settledAt: START + 4_000, ok: true }),
    });
    expect(JSON.parse(localStorage.getItem(FIRST_TOKEN_SAMPLES_KEY) ?? '[]')).toEqual([1200]);
  });

  it('dismiss 后同一轮不再出现，下一轮重新计时', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: StreamTiming }) => useFirstTokenBudget(value),
      { initialProps: { value: timing() } },
    );
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.visible).toBe(true);
    act(() => result.current.dismiss());
    expect(result.current.visible).toBe(false);

    vi.setSystemTime(START + 20_000);
    rerender({ value: timing({ startedAt: START + 20_000 }) });
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.visible).toBe(true);
  });
});
