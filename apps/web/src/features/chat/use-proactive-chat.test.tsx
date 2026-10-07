// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { DEFAULT_VOICE_SETTINGS, type VoiceSettings } from '@wbfm/shared';
import { useProactiveChat } from './use-proactive-chat';

function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
}

const HAPPY_SSE = [
  'event: meta\ndata: {"messageId":"proactive-x","conversationId":"","proactive":true}\n\n',
  'event: delta\ndata: {"content":"嗨，"}\n\n',
  'event: delta\ndata: {"content":"最近在忙什么？"}\n\n',
  'event: done\ndata: {"content":"嗨，最近在忙什么？","usage":null}\n\n',
];

function makeArgs(overrides: Partial<Parameters<typeof useProactiveChat>[0]> = {}) {
  return {
    assistantId: 'a1',
    conversationId: null,
    voiceSettings: { ...DEFAULT_VOICE_SETTINGS, proactiveEnabled: true, proactiveIdleSeconds: 300, avatarEnabled: true },
    ttsReady: true,
    hasVisualOutlet: true,
    hasChatModel: true,
    busy: false,
    onAudio: vi.fn(),
    onCancelPlayback: vi.fn(),
    ...overrides,
  };
}

describe('useProactiveChat（F8 空闲主动说话）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('未武装（开关关/无视觉出口）：空闲再久也不请求', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const args = makeArgs({
      voiceSettings: {
        ...DEFAULT_VOICE_SETTINGS,
        proactiveEnabled: false,
        avatarEnabled: true,
      } as VoiceSettings,
    });
    renderHook(() => useProactiveChat(args));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600_000);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('空闲达到阈值：发起 proactive 请求，delta 累积为临时气泡，且不落消息列表', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(sseResponse(HAPPY_SSE));
    vi.stubGlobal('fetch', fetchSpy);
    const onAudio = vi.fn();
    const { result } = renderHook(() =>
      useProactiveChat(makeArgs({ onAudio })),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(305_000);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String(fetchSpy.mock.calls[0]![0]);
    expect(url).toContain('/api/chat/proactive');
    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body as string);
    expect(body.assistantId).toBe('a1');

    // 流在假定时器的微任务冲洗中读完（不用 waitFor——其内部轮询也被假定时器挂起）
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.bubble?.status).toBe('completed');
    expect(result.current.bubble?.content).toBe('嗨，最近在忙什么？');
    expect(result.current.bubble?.messageId.startsWith('proactive-')).toBe(true);
    expect(onAudio).not.toHaveBeenCalled(); // 本用例无 voice_audio 帧
  });

  it('TTS 开启且就绪：请求带 voice.tts=true', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(sseResponse(HAPPY_SSE));
    vi.stubGlobal('fetch', fetchSpy);
    const args = makeArgs({
      voiceSettings: {
        ...DEFAULT_VOICE_SETTINGS,
        proactiveEnabled: true,
        proactiveIdleSeconds: 300,
        avatarEnabled: true,
        ttsEnabled: true,
      } as VoiceSettings,
    });
    renderHook(() => useProactiveChat(args));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(305_000);
    });
    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body as string);
    expect(body.voice).toEqual({ tts: true });
  });

  it('busy（正常对话进行中）不触发；结束后需重新计满一个周期', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(sseResponse(HAPPY_SSE));
    vi.stubGlobal('fetch', fetchSpy);
    const { rerender } = renderHook(({ busy }) => useProactiveChat(makeArgs({ busy })), {
      initialProps: { busy: true },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400_000);
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    rerender({ busy: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200_000);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(110_000);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('dismiss：收起气泡并重置计时（短时间内不再触发）', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(sseResponse(HAPPY_SSE));
    vi.stubGlobal('fetch', fetchSpy);
    const { result } = renderHook(() => useProactiveChat(makeArgs()));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(305_000);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.bubble?.status).toBe('completed');

    act(() => result.current.dismiss());
    expect(result.current.bubble).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(290_000);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('请求失败：静默收起，不抛错；冷却后可再次触发', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(sseResponse(HAPPY_SSE));
    vi.stubGlobal('fetch', fetchSpy);
    const { result } = renderHook(() => useProactiveChat(makeArgs()));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(305_000);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.current.bubble).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(305_000);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.current.bubble?.content).toBe('嗨，最近在忙什么？');
  });
});
