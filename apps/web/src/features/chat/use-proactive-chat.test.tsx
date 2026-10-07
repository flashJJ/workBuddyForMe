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

const META_CHUNK = 'event: meta\ndata: {"messageId":"proactive-x","conversationId":"","proactive":true}\n\n';

/** 不主动关闭的流：abort 信号触发时按真实 fetch 行为让 body 报错，避免测试悬挂 */
function bindHangingStream(fetchSpy: ReturnType<typeof vi.fn>, chunks: string[]) {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  fetchSpy.mockImplementation((_url: string, init: { signal: AbortSignal }) => {
    init.signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')));
    return Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            controller = c;
            for (const chunk of chunks) c.enqueue(encoder.encode(chunk));
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      ),
    );
  });
}

// 显式标注 hook 入参类型：避免默认字面量与 Partial overrides 联合后，测试里回写属性被放宽
function makeArgs(overrides: Partial<Parameters<typeof useProactiveChat>[0]> = {}): Parameters<typeof useProactiveChat>[0] {
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

  it('降级：流中 error 事件（meta 之后）静默收起气泡，不抛错', async () => {
    const errorSse = [
      META_CHUNK,
      'event: error\ndata: {"code":"UPSTREAM_ERROR","message":"供应商挂了"}\n\n',
    ];
    const fetchSpy = vi.fn().mockResolvedValue(sseResponse(errorSse));
    vi.stubGlobal('fetch', fetchSpy);
    const { result } = renderHook(() => useProactiveChat(makeArgs()));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(305_000);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.bubble).toBeNull();
    expect(result.current.active).toBe(false);
  });

  it('降级：网络层 reject（离线/服务重启）静默收起，冷却后可重试', async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
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
    expect(result.current.bubble).toBeNull();
    expect(result.current.active).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(305_000);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.current.bubble?.status).toBe('completed');
  });

  it('进行中正常轮次占用（busy 翻 true）：abort 请求、停 TTS、立即收气泡', async () => {
    const fetchSpy = vi.fn();
    bindHangingStream(fetchSpy, [META_CHUNK]);
    vi.stubGlobal('fetch', fetchSpy);
    const onCancelPlayback = vi.fn();
    const { result, rerender } = renderHook(
      ({ busy }) => useProactiveChat(makeArgs({ busy, onCancelPlayback })),
      { initialProps: { busy: false } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(305_000);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.bubble?.status).toBe('streaming');

    // 挂载时切换 effect 也会幂等清理一次（cancel 计数 ≥1），这里断言 busy 中止新增一次
    const cancelCountBefore = onCancelPlayback.mock.calls.length;
    rerender({ busy: true });
    expect(fetchSpy.mock.calls[0]![1].signal.aborted).toBe(true);
    expect(onCancelPlayback.mock.calls.length).toBe(cancelCountBefore + 1);
    expect(result.current.bubble).toBeNull();
    expect(result.current.active).toBe(false);
  });

  it('TTS 开关开但模型未就绪：降级为纯文字请求（不带 voice），气泡仍正常呈现', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(sseResponse(HAPPY_SSE));
    vi.stubGlobal('fetch', fetchSpy);
    const args = makeArgs({ ttsReady: false });
    // makeArgs 默认值保证非空：! 让展开保持必填字段（对含 null 联合展开会把字段变可选）
    args.voiceSettings = { ...args.voiceSettings!, ttsEnabled: true };
    renderHook(() => useProactiveChat(args));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(305_000);
    });
    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body as string);
    expect(body.voice).toBeUndefined();
  });
});
