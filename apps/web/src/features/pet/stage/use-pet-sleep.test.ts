// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PET_SLEEP_AFTER_MS, usePetSleep } from './use-pet-sleep';

describe('usePetSleep（v3.0 P1）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('10min 无交互入睡，指针移动立即唤醒', () => {
    const { result } = renderHook(() => usePetSleep('idle'));
    expect(result.current.sleeping).toBe(false);

    act(() => {
      vi.advanceTimersByTime(PET_SLEEP_AFTER_MS + 30_000);
    });
    expect(result.current.sleeping).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('pointermove'));
    });
    expect(result.current.sleeping).toBe(false);
  });

  it('语音非 idle 会唤醒', () => {
    const { result, rerender } = renderHook(
      ({ state }: { state: 'idle' | 'speaking' }) => usePetSleep(state),
      { initialProps: { state: 'idle' as 'idle' | 'speaking' } },
    );
    act(() => {
      vi.advanceTimersByTime(PET_SLEEP_AFTER_MS + 30_000);
    });
    expect(result.current.sleeping).toBe(true);

    rerender({ state: 'speaking' });
    expect(result.current.sleeping).toBe(false);
  });

  it('持续指针活动保持清醒', () => {
    const { result } = renderHook(() => usePetSleep('idle'));
    act(() => {
      for (let i = 0; i < 5; i += 1) {
        vi.advanceTimersByTime(PET_SLEEP_AFTER_MS - 60_000);
        window.dispatchEvent(new Event('pointerdown'));
      }
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.sleeping).toBe(false);
  });

  it('wake() 可主动唤醒（主动播放前）', () => {
    const { result } = renderHook(() => usePetSleep('idle'));
    act(() => {
      vi.advanceTimersByTime(PET_SLEEP_AFTER_MS + 30_000);
    });
    expect(result.current.sleeping).toBe(true);
    act(() => result.current.wake());
    expect(result.current.sleeping).toBe(false);
  });
});
