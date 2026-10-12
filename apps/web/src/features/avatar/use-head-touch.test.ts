// @vitest-environment jsdom
'use client';

import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHeadTouch, type TouchControllerLike } from './use-head-touch';

function makeController(): TouchControllerLike & {
  squash: number;
  flashes: Array<{ tag: string; duration: number }>;
} {
  return {
    squash: 0,
    flashes: [],
    playSquash() {
      this.squash += 1;
    },
    flashExpression(tag, duration) {
      this.flashes.push({ tag, duration });
    },
  };
}

describe('useHeadTouch（v1.6 摸头）', () => {
  it('普通摸头：弹性 + 害羞闪现；随机未命中不出短句', () => {
    const controller = makeController();
    const onLine = vi.fn();
    const { result } = renderHook(() =>
      useHeadTouch({ current: controller }, { now: () => 1_000_000, random: () => 0.99, onLine }),
    );
    const outcome = result.current();
    expect(outcome.accepted).toBe(true);
    expect(outcome.expression).toBe('joy');
    expect(outcome.lineKey).toBeNull();
    expect(controller.squash).toBe(1);
    expect(controller.flashes[0]?.tag).toBe('joy');
    expect(onLine).not.toHaveBeenCalled();
  });

  it('随机命中：返回害羞短句 key 并回调', () => {
    const controller = makeController();
    const onLine = vi.fn();
    const { result } = renderHook(() =>
      useHeadTouch({ current: controller }, { now: () => 1_000_000, random: () => 0, onLine }),
    );
    const outcome = result.current();
    expect(outcome.lineKey).toMatch(/^emotion\.touch\.blush[0-5]$/);
    expect(onLine).toHaveBeenCalledOnce();
  });

  it('2s 内连摸 3 次：第三次进入保护期，给抗议 key；保护期内再说不给', () => {
    const controller = makeController();
    const onLine = vi.fn();
    let now = 2_000_000;
    const { result } = renderHook(() =>
      useHeadTouch({ current: controller }, { now: () => now, random: () => 0.99, onLine }),
    );
    result.current();
    now += 1000;
    result.current();
    now += 1000;
    const third = result.current();
    expect(third.inProtection).toBe(true);
    expect(third.expression).toBe('sadness');
    expect(third.lineKey).toMatch(/^emotion\.touch\.protect[0-3]$/);
    expect(onLine).toHaveBeenCalledOnce();

    // 保护期内再摸：持续抗议但不重复回调短句
    now += 1000;
    const inProtect = result.current();
    expect(inProtect.inProtection).toBe(true);
    expect(inProtect.lineKey).toBeNull();
    expect(onLine).toHaveBeenCalledOnce();
  });

  it('防抖：350ms 内重复点击被拒绝且不触发弹性', () => {
    const controller = makeController();
    let now = 3_000_000;
    const { result } = renderHook(() =>
      useHeadTouch({ current: controller }, { now: () => now, random: () => 0.99 }),
    );
    expect(result.current().accepted).toBe(true);
    now += 100;
    expect(result.current().accepted).toBe(false);
    expect(controller.squash).toBe(1);
  });
});
