// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PetVoiceState } from '@wbfm/shared/pet';
import { PET_AWAY_AFTER_MS, usePetFaceAway } from './use-pet-face-away';

const TICK = 5_000;

describe('usePetFaceAway（背对剧本）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('75s 无互动后转身背对，指针按下立即转回', () => {
    const { result } = renderHook(() => usePetFaceAway('idle'));
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(PET_AWAY_AFTER_MS - TICK);
    });
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(TICK);
    });
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
    });
    expect(result.current).toBe(false);
  });

  it('说话开始会转回，并在结束后重新计时', () => {
    const { result, rerender } = renderHook(
      ({ voice }: { voice: PetVoiceState }) => usePetFaceAway(voice),
      { initialProps: { voice: 'idle' as PetVoiceState } },
    );
    act(() => {
      vi.advanceTimersByTime(PET_AWAY_AFTER_MS + TICK);
    });
    expect(result.current).toBe(true);

    rerender({ voice: 'speaking' });
    expect(result.current).toBe(false);

    rerender({ voice: 'idle' });
    act(() => {
      vi.advanceTimersByTime(PET_AWAY_AFTER_MS + TICK);
    });
    expect(result.current).toBe(true);
  });

  it('持续指针活动不会背对', () => {
    const { result } = renderHook(() => usePetFaceAway('idle'));
    act(() => {
      for (let i = 0; i < 5; i += 1) {
        vi.advanceTimersByTime(PET_AWAY_AFTER_MS - TICK);
        window.dispatchEvent(new Event('pointermove'));
      }
      vi.advanceTimersByTime(TICK);
    });
    expect(result.current).toBe(false);
  });
});
