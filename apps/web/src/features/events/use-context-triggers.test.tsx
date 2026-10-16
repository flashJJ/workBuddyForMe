// @vitest-environment jsdom
'use client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { AwarenessEvent, WbfmAwarenessBridge } from '@wbfm/shared/awareness';
import { useContextTriggers } from './use-context-triggers';

vi.mock('@/lib/hooks/use-conversations', () => ({
  useConversations: () => ({ data: [] }),
}));

const TICK_MS = 60_000;
const ACTIVITY_KEY = 'wbfm.event.lastActivityAt.v1';
const STATE_KEY = 'wbfm.context-awareness.v1';

function installBridge(): WbfmAwarenessBridge & { handler: ((e: AwarenessEvent) => void) | null } {
  const bridge: {
    handler: ((e: AwarenessEvent) => void) | null;
    setEnabled: ReturnType<typeof vi.fn>;
    onEvent: ReturnType<typeof vi.fn>;
  } = {
    handler: null,
    setEnabled: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn((cb: (e: AwarenessEvent) => void) => {
      bridge.handler = cb;
      return () => {};
    }),
  };
  (window as unknown as { wbfm: unknown }).wbfm = { awareness: bridge };
  return bridge as unknown as WbfmAwarenessBridge & {
    handler: ((e: AwarenessEvent) => void) | null;
  };
}

describe('useContextTriggers（v2.0 M3 上下文触发器）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // UTC 02:00 = 上海 10:00（非深夜档，隔离深夜触发器）
    vi.setSystemTime(Date.UTC(2026, 9, 21, 2, 0, 0));
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as { wbfm?: unknown }).wbfm;
  });

  it('应用内活动连续 90 分钟 → 触发一次 workstreak（每 tick 保持活跃）', () => {
    const triggerEvent = vi.fn();
    renderHook(() => useContextTriggers({ enabled: true, systemAware: false, triggerEvent }));

    for (let i = 0; i < 91; i += 1) {
      window.localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
      act(() => {
        vi.advanceTimersByTime(TICK_MS);
      });
    }
    expect(triggerEvent).toHaveBeenCalledOnce();
    expect(triggerEvent).toHaveBeenCalledWith('ev.context.workstreak');

    // 继续活跃 30 分钟不重复（边沿只触发一次）
    for (let i = 0; i < 30; i += 1) {
      window.localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
      act(() => {
        vi.advanceTimersByTime(TICK_MS);
      });
    }
    expect(triggerEvent).toHaveBeenCalledOnce();
  });

  it('总开关关闭期间到点不触发，边沿照常消费；恢复开启后不补演', () => {
    const triggerEvent = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useContextTriggers({ enabled, systemAware: false, triggerEvent }),
      { initialProps: { enabled: false } },
    );

    for (let i = 0; i < 95; i += 1) {
      window.localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
      act(() => {
        vi.advanceTimersByTime(TICK_MS);
      });
    }
    expect(triggerEvent).not.toHaveBeenCalled();
    // 边沿状态已落盘（firedAt 非空）
    const state = JSON.parse(window.localStorage.getItem(STATE_KEY)!);
    expect(state.workStreak.firedAt).not.toBeNull();

    rerender({ enabled: true });
    for (let i = 0; i < 20; i += 1) {
      window.localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
      act(() => {
        vi.advanceTimersByTime(TICK_MS);
      });
    }
    expect(triggerEvent).not.toHaveBeenCalled();
  });

  it('系统事件桥仅在 enabled+授权时武装；卸载即拆除', () => {
    const bridge = installBridge();
    const { unmount } = renderHook(() =>
      useContextTriggers({ enabled: true, systemAware: true, triggerEvent: vi.fn() }),
    );
    expect(bridge.setEnabled).toHaveBeenCalledWith(true);
    expect(bridge.onEvent).toHaveBeenCalledOnce();

    // 锁屏：立即评估不断言异常；唤醒：新工作段不立即触发
    expect(() =>
      act(() => {
        bridge.handler?.({ type: 'lock', at: Date.now() });
      }),
    ).not.toThrow();
    act(() => {
      bridge.handler?.({ type: 'unlock', at: Date.now() });
    });

    unmount();
    expect(bridge.setEnabled).toHaveBeenLastCalledWith(false);
  });

  it('未授权或纯浏览器：不访问感知桥，应用内活动回落正常工作', () => {
    const bridge = installBridge();
    renderHook(() =>
      useContextTriggers({ enabled: true, systemAware: false, triggerEvent: vi.fn() }),
    );
    expect(bridge.setEnabled).not.toHaveBeenCalled();
    expect(bridge.onEvent).not.toHaveBeenCalled();
  });
});
