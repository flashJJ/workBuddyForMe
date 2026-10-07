// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Message, WbfmPetBridge } from '@wbfm/shared';
import { usePetOpenState, usePetVoiceRelay } from './use-pet-voice-relay';

function makeBridge(): WbfmPetBridge & { relayPerformance: ReturnType<typeof vi.fn> } {
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

function assistant(content: string): Message {
  return {
    id: 'm1',
    role: 'assistant',
    content,
    createdAt: new Date().toISOString(),
  } as Message;
}

describe('usePetVoiceRelay', () => {
  let bridge: ReturnType<typeof makeBridge>;
  let levelSink: ((n: number) => void) | null;
  let unsubscribe: ReturnType<typeof vi.fn>;
  let nowMock: ReturnType<typeof vi.spyOn>;
  let nowValue: number;

  beforeEach(() => {
    bridge = makeBridge();
    levelSink = null;
    unsubscribe = vi.fn();
    nowValue = 1000;
    nowMock = vi.spyOn(performance, 'now').mockImplementation(() => nowValue);
    window.wbfm = { ...window.wbfm, pet: bridge };
  });

  afterEach(() => {
    nowMock.mockRestore();
    delete window.wbfm?.pet;
  });

  function renderRelay(active: boolean, messages: Message[] = [], conversationId: string | null = 'c1') {
    const subscribeLevel = vi.fn((sink: (n: number) => void) => {
      levelSink = sink;
      return unsubscribe;
    });
    const utils = renderHook(
      ({ a, m, c }) =>
        usePetVoiceRelay({
          active: a,
          voiceState: 'idle',
          messages: m,
          conversationId: c,
          subscribeLevel,
        }),
      { initialProps: { a: active, m: messages, c: conversationId } },
    );
    return { ...utils, subscribeLevel };
  }

  it('未激活：不订阅电平、不转发；音频帧回调空操作', () => {
    const h = renderRelay(false);
    expect(h.subscribeLevel).not.toHaveBeenCalled();
    expect(bridge.relayPerformance).not.toHaveBeenCalled();
    act(() => {
      h.result.current({ fragment: '[joy]你好', spoken: '你好', audio: 'x', sampleRate: 44100, final: false });
    });
    expect(bridge.relayPerformance).not.toHaveBeenCalled();
  });

  it('激活：挂载即同步状态/中性表情/会话清空，并订阅音频线程电平', () => {
    const h = renderRelay(true);
    const kinds = bridge.relayPerformance.mock.calls.map((c) => c[0]!.kind);
    expect(kinds).toEqual(expect.arrayContaining(['state', 'expression', 'conversation']));
    expect(h.subscribeLevel).toHaveBeenCalledTimes(1);
    expect(levelSink).toBeTypeOf('function');
    h.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('电平节流约 30Hz：同步两帧只转发一次，33ms 后再转', () => {
    const h = renderRelay(true);
    act(() => {
      levelSink!(0.5);
      levelSink!(0.6);
    });
    const levelCalls1 = bridge.relayPerformance.mock.calls.filter(
      (c) => c[0]!.kind === 'level',
    );
    expect(levelCalls1).toHaveLength(1);
    expect(levelCalls1[0]![0]).toEqual({ kind: 'level', value: 0.5 });

    nowValue += 40;
    act(() => {
      levelSink!(0.7);
    });
    const levelCalls2 = bridge.relayPerformance.mock.calls.filter(
      (c) => c[0]!.kind === 'level',
    );
    expect(levelCalls2).toHaveLength(2);
    expect(levelCalls2[1]![0]).toEqual({ kind: 'level', value: 0.7 });
    h.unmount();
  });

  it('状态/表情/会话变化各自转发；字幕剥表情标签并限长', () => {
    const h = renderRelay(true, [], 'c1');
    act(() => {
      h.rerender({ a: true, m: [assistant('[joy]哈哈')], c: 'c1' });
    });
    expect(bridge.relayPerformance).toHaveBeenCalledWith({ kind: 'expression', tag: 'joy' });

    act(() => {
      h.rerender({ a: true, m: [assistant('[joy]哈哈')], c: 'c2' });
    });
    const conversationCount = bridge.relayPerformance.mock.calls.filter(
      (c) => c[0]!.kind === 'conversation',
    ).length;
    expect(conversationCount).toBe(2);

    act(() => {
      h.result.current({
        fragment: '[smirk]该我了。',
        spoken: '该我了。',
        audio: 'data:audio/wav;base64,AAAA',
        sampleRate: 44100,
        final: false,
      });
    });
    expect(bridge.relayPerformance).toHaveBeenCalledWith({
      kind: 'subtitle',
      text: '该我了。',
    });
  });

  it('无桌面桥（纯浏览器）：active=true 也不转发', () => {
    delete window.wbfm?.pet;
    const h = renderRelay(true);
    expect(h.subscribeLevel).not.toHaveBeenCalled();
    expect(bridge.relayPerformance).not.toHaveBeenCalled();
  });
});

describe('usePetOpenState', () => {
  afterEach(() => {
    delete window.wbfm?.pet;
  });

  it('无桥恒为 false', () => {
    const h = renderHook(() => usePetOpenState());
    expect(h.result.current).toBe(false);
  });

  it('桥存在：初始值来自 isOpen，随后跟随 onOpenChange 广播', async () => {
    const bridge = makeBridge();
    bridge.isOpen = vi.fn(async () => true);
    let emit: (open: boolean) => void = () => undefined;
    bridge.onOpenChange = vi.fn((cb: (open: boolean) => void) => {
      emit = cb;
      return () => undefined;
    });
    window.wbfm = { ...window.wbfm, pet: bridge };

    const h = renderHook(() => usePetOpenState());
    await vi.waitFor(() => expect(h.result.current).toBe(true));
    act(() => emit(false));
    expect(h.result.current).toBe(false);
  });
});
