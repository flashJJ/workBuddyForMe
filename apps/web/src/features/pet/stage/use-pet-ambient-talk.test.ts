// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AMBIENT_IDLE_BEFORE_MS,
  AMBIENT_MAX_PER_HOUR,
  AMBIENT_MIN_GAP_MS,
  LONG_IDLE_MS,
  pickAmbientPool,
  usePetAmbientTalk,
  type PetAmbientTalkArgs,
} from './use-pet-ambient-talk';

function makeArgs(overrides: Partial<PetAmbientTalkArgs> = {}): PetAmbientTalkArgs {
  return {
    enabled: true,
    sleeping: false,
    voiceState: 'idle',
    t: (key) => `T:${key}`,
    speak: vi.fn(),
    hour: () => 12,
    ...overrides,
  };
}

const TICK = 15_000;

describe('usePetAmbientTalk（L2 自主低语）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('静默不足 3 分钟不开口', () => {
    const args = makeArgs();
    renderHook(() => usePetAmbientTalk(args));
    act(() => {
      vi.advanceTimersByTime(AMBIENT_IDLE_BEFORE_MS - TICK);
    });
    expect(args.speak).not.toHaveBeenCalled();
  });

  it('静默满 3 分钟后说一句本地台词', () => {
    const args = makeArgs();
    renderHook(() => usePetAmbientTalk(args));
    act(() => {
      vi.advanceTimersByTime(AMBIENT_IDLE_BEFORE_MS + TICK);
    });
    expect(args.speak).toHaveBeenCalledTimes(1);
    expect(String((args.speak as ReturnType<typeof vi.fn>).mock.calls[0]![0])).toMatch(
      /^T:emotion\.ambient\.line[0-7]$/,
    );
  });

  it('睡眠 / 说话 / 关闭 / 勿扰时保持安静', () => {
    for (const overrides of [
      { sleeping: true },
      { voiceState: 'speaking' as const },
      { enabled: false },
    ]) {
      const args = makeArgs(overrides);
      const { unmount } = renderHook(() => usePetAmbientTalk(args));
      act(() => {
        vi.advanceTimersByTime(AMBIENT_IDLE_BEFORE_MS + TICK);
      });
      expect(args.speak).not.toHaveBeenCalled();
      unmount();
    }
  });

  it('指针活动会顺延静默计时', () => {
    const args = makeArgs();
    renderHook(() => usePetAmbientTalk(args));
    act(() => {
      vi.advanceTimersByTime(AMBIENT_IDLE_BEFORE_MS - TICK);
      window.dispatchEvent(new Event('pointermove'));
    });
    act(() => {
      vi.advanceTimersByTime(AMBIENT_IDLE_BEFORE_MS - TICK);
    });
    expect(args.speak).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2 * TICK);
    });
    expect(args.speak).toHaveBeenCalledTimes(1);
  });

  it('两次低语间隔不小于 15 分钟，且任意 1 小时窗口内不超过上限', () => {
    const times: number[] = [];
    const args = makeArgs({
      speak: vi.fn(() => {
        times.push(Date.now());
      }),
    });
    renderHook(() => usePetAmbientTalk(args));

    act(() => {
      vi.advanceTimersByTime(AMBIENT_IDLE_BEFORE_MS + TICK);
    });
    expect(times).toHaveLength(1);

    // 15 分钟内不再开口
    act(() => {
      vi.advanceTimersByTime(AMBIENT_MIN_GAP_MS - TICK);
    });
    expect(times).toHaveLength(1);

    // 连续推进 6 小时：低频持续存在，但任意 1 小时窗口不超过 3 句
    for (let i = 0; i < 36; i += 1) {
      act(() => {
        vi.advanceTimersByTime(TICK * 40); // 10 分钟
      });
    }
    expect(times.length).toBeGreaterThan(3);
    const maxPerHour = Math.max(
      ...times.map((start) => times.filter((at) => at >= start && at < start + 3_600_000).length),
    );
    expect(maxPerHour).toBeLessThanOrEqual(AMBIENT_MAX_PER_HOUR);
  });

  it('分层选池：深夜 > 久无互动 > 日常', () => {
    expect(pickAmbientPool(23, 0)).toBe('late-night');
    expect(pickAmbientPool(5, 0)).toBe('late-night');
    expect(pickAmbientPool(12, LONG_IDLE_MS)).toBe('idle-long');
    expect(pickAmbientPool(12, 0)).toBe('ambient');
  });

  it('深夜低语使用 late-night 台词池', () => {
    const args = makeArgs({ hour: () => 23 });
    renderHook(() => usePetAmbientTalk(args));
    act(() => {
      vi.advanceTimersByTime(AMBIENT_IDLE_BEFORE_MS + TICK);
    });
    expect(String((args.speak as ReturnType<typeof vi.fn>).mock.calls[0]![0])).toMatch(
      /^T:emotion\.lateNight\.line[0-2]$/,
    );
  });

  it('跨会话久无互动时使用 idle-long 台词池', () => {
    window.localStorage.setItem(
      'wbfm.pet.lastActiveAt',
      String(Date.now() - LONG_IDLE_MS - 60_000),
    );
    const args = makeArgs();
    renderHook(() => usePetAmbientTalk(args));
    act(() => {
      vi.advanceTimersByTime(AMBIENT_IDLE_BEFORE_MS + TICK);
    });
    expect(String((args.speak as ReturnType<typeof vi.fn>).mock.calls[0]![0])).toMatch(
      /^T:emotion\.idleLong\.line[0-2]$/,
    );
  });
});
