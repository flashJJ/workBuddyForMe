// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { WORK_STREAK_IDLE_GAP_MS } from '@wbfm/shared/events';
import type { AwarenessEvent, WbfmAwarenessBridge } from '@wbfm/shared/awareness';
import type { WbfmPetBridge } from '@wbfm/shared/pet';

const state = vi.hoisted(() => ({ settings: { systemEventAwarenessEnabled: true } }));
vi.mock('@/lib/hooks/use-settings', () => ({
  useSettings: () => ({ data: state.settings }),
}));

import { usePetSignalRelay } from './use-pet-signal-relay';

function makePetBridge(): WbfmPetBridge & { relayPerformance: ReturnType<typeof vi.fn> } {
  return {
    open: vi.fn(async () => true),
    close: vi.fn(async () => undefined),
    isOpen: vi.fn(async () => false),
    reportHover: vi.fn(),
    focusMain: vi.fn(),
    dragBegin: vi.fn(),
    dragTo: vi.fn(),
    dragEnd: vi.fn(),
    showMenu: vi.fn(),
    relayPerformance: vi.fn(),
    onPerformance: vi.fn(() => () => undefined),
    onOpenChange: vi.fn(() => () => undefined),
  };
}

function makeAwareness() {
  let handler: ((event: AwarenessEvent) => void) | null = null;
  const bridge: WbfmAwarenessBridge = {
    setEnabled: vi.fn(async () => undefined),
    onEvent: vi.fn((cb: (event: AwarenessEvent) => void) => {
      handler = cb;
      return () => {
        handler = null;
      };
    }),
  };
  return { bridge, emit: (event: AwarenessEvent) => handler?.(event) };
}

/** 越阈空闲样本 / 未越阈样本 */
const away = { type: 'idle', at: 0, idleSeconds: Math.ceil(WORK_STREAK_IDLE_GAP_MS / 1000) + 10 } as const;
const active = { type: 'idle', at: 0, idleSeconds: 5 } as const;

function signals(bridge: ReturnType<typeof makePetBridge>) {
  return bridge.relayPerformance.mock.calls
    .filter((call) => call[0]!.kind === 'interaction')
    .map((call) => (call[0] as { event: { signal: string } }).event.signal);
}

describe('usePetSignalRelay（系统信号中继）', () => {
  let pet: ReturnType<typeof makePetBridge>;
  let awareness: ReturnType<typeof makeAwareness>;

  beforeEach(() => {
    state.settings = { systemEventAwarenessEnabled: true };
    pet = makePetBridge();
    awareness = makeAwareness();
    window.wbfm = { ...window.wbfm, pet, awareness: awareness.bridge };
  });

  afterEach(() => {
    delete window.wbfm?.pet;
    delete window.wbfm?.awareness;
  });

  function render(active: boolean, voiceState: 'idle' | 'listening' | 'thinking' | 'speaking') {
    return renderHook(
      ({ a, v }: { a: boolean; v: typeof voiceState }) => usePetSignalRelay({ active: a, voiceState: v }),
      { initialProps: { a: active, v: voiceState } },
    );
  }

  it('语音状态边沿：idle → 说话发 voice-start，说完回 idle 发 voice-end', () => {
    const h = render(true, 'idle');
    expect(signals(pet)).toEqual([]);

    act(() => h.rerender({ a: true, v: 'speaking' }));
    expect(signals(pet)).toEqual(['voice-start']);

    act(() => h.rerender({ a: true, v: 'idle' }));
    expect(signals(pet)).toEqual(['voice-start', 'voice-end']);
  });

  it('桌宠未打开 / 无桌面桥：不转发', () => {
    const closed = render(false, 'idle');
    act(() => closed.rerender({ a: false, v: 'speaking' }));
    expect(signals(pet)).toEqual([]);

    delete window.wbfm?.pet;
    const noBridge = render(true, 'idle');
    act(() => noBridge.rerender({ a: true, v: 'speaking' }));
    expect(pet.relayPerformance).not.toHaveBeenCalled();
  });

  it('系统事件感知：lock → locked，unlock/resume → wake；suspend 只更新状态', () => {
    render(true, 'idle');
    act(() => awareness.emit({ type: 'lock', at: 1 }));
    act(() => awareness.emit({ type: 'suspend', at: 2 }));
    act(() => awareness.emit({ type: 'unlock', at: 3 }));
    act(() => awareness.emit({ type: 'resume', at: 4 }));
    expect(signals(pet)).toEqual(['locked', 'wake', 'wake']);
  });

  it('系统空闲只发越阈上升沿（30s 轮询样本本身不转发）', () => {
    render(true, 'idle');
    act(() => awareness.emit(active));
    act(() => awareness.emit(active));
    expect(signals(pet)).toEqual([]);

    act(() => awareness.emit(away));
    act(() => awareness.emit(away));
    expect(signals(pet)).toEqual(['idle']);

    // 回到活跃再越阈 → 再发一次
    act(() => awareness.emit(active));
    act(() => awareness.emit(away));
    expect(signals(pet)).toEqual(['idle', 'idle']);
  });

  it('未授权系统事件感知：不订阅、不转发', () => {
    state.settings = { systemEventAwarenessEnabled: false };
    render(true, 'idle');
    expect(awareness.bridge.onEvent).not.toHaveBeenCalled();
    act(() => awareness.emit({ type: 'lock', at: 1 }));
    expect(signals(pet)).toEqual([]);
  });
});
