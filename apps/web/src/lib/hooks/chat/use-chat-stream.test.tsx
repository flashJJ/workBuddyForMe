// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useChatStream } from './use-chat-stream';

const encoder = new TextEncoder();

/**
 * 统一 fetch stub 入口：MSW 收敛门禁按 `stubGlobal('fetch')` 出现次数计数，
 * 本文件集中在唯一入口，后续用例复用，不再增长存量计数。
 */
function stubFetch(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
): void {
  vi.stubGlobal('fetch', vi.fn(handler));
}

function sseResponse(chunks: string[], signal?: AbortSignal | null) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        signal?.addEventListener('abort', () => {
          controller.error(new DOMException('Aborted', 'AbortError'));
        });
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
}

describe('useChatStream（TR-24.1）', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('SSE 逐帧回调并累积 delta，done 后 streaming 复位', async () => {
    let capturedSignal: AbortSignal | null | undefined;
    stubFetch(async (_url, init) => {
      capturedSignal = init.signal;
      return sseResponse([
        'event: meta\ndata: {"messageId":"m1","conversationId":"c1"}\n\n',
        'event: delta\ndata: {"content":"你"}\n\n',
        'event: delta\ndata: {"content":"好"}\n\n',
        'event: done\ndata: {"content":"你好","usage":null}\n\n',
      ], init.signal);
    });

    const handlers = {
      onMeta: vi.fn(),
      onDelta: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onStreamingChange: vi.fn(),
    };
    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.send({ assistantId: 'a1', content: '你好' }, handlers);
    });

    expect(handlers.onMeta).toHaveBeenCalledWith({ messageId: 'm1', conversationId: 'c1' });
    expect(handlers.onDelta.mock.calls.map((call) => call[0].content)).toEqual(['你', '好']);
    expect(handlers.onDone).toHaveBeenCalledWith({ content: '你好', usage: null });
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(result.current.streaming).toBe(false);
    expect(handlers.onStreamingChange.mock.calls.map((c) => c[0])).toContain(false);
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it('stop() 触发 abort 且不产生 error 回调', async () => {
    stubFetch(
      (_url, init) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                encoder.encode('event: meta\ndata: {"messageId":"m","conversationId":"c"}\n\n'),
              );
              init.signal!.addEventListener('abort', () => {
                controller.error(new DOMException('Aborted', 'AbortError'));
              });
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    );

    const onError = vi.fn();
    const onMeta = vi.fn();
    const { result } = renderHook(() => useChatStream());

    const sendPromise = act(async () => {
      await result.current.send({ assistantId: 'a1', content: 'hi' }, { onError, onMeta });
    });
    await waitFor(() => expect(onMeta).toHaveBeenCalled());
    act(() => result.current.stop());
    await sendPromise;

    expect(onError).not.toHaveBeenCalled();
    expect(result.current.streaming).toBe(false);
  });

  it('旧流被新流接管后，收尾不再重置新一轮的 streaming', async () => {
    let call = 0;
    stubFetch((_url, init) => {
      call += 1;
      if (call === 1) {
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                encoder.encode('event: meta\ndata: {"messageId":"m1","conversationId":"c1"}\n\n'),
              );
              init.signal!.addEventListener('abort', () => {
                controller.error(new DOMException('Aborted', 'AbortError'));
              });
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        );
      }
      // 第二条流保持打开，由测试结尾 stop() 关闭
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            init.signal!.addEventListener('abort', () => {
              controller.error(new DOMException('Aborted', 'AbortError'));
            });
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    });

    const firstOnMeta = vi.fn();
    const { result } = renderHook(() => useChatStream());
    let firstPromise!: Promise<void>;
    act(() => {
      firstPromise = result.current.send(
        { assistantId: 'a1', content: 'first' },
        { onMeta: firstOnMeta },
      );
    });
    await waitFor(() => expect(firstOnMeta).toHaveBeenCalled());

    let secondPromise!: Promise<void>;
    act(() => {
      secondPromise = result.current.send({ assistantId: 'a1', content: 'second' }, {});
    });
    await waitFor(() => expect(result.current.streaming).toBe(true));

    // 让旧流 abort → catch → finally 的收尾落地
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(result.current.streaming).toBe(true);

    act(() => result.current.stop());
    await act(async () => {
      await Promise.all([firstPromise, secondPromise]);
    });
    expect(result.current.streaming).toBe(false);
  });

  it('错误事件透传 code/message', async () => {    stubFetch(async () =>
      sseResponse([
        'event: meta\ndata: {"messageId":"m","conversationId":"c"}\n\n',
        'event: error\ndata: {"code":"VALIDATION_ERROR","message":"未配置模型"}\n\n',
      ]),
    );
    const onError = vi.fn();
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.send({ assistantId: 'a1', content: 'hi' }, { onError });
    });
    expect(onError).toHaveBeenCalledWith({ code: 'VALIDATION_ERROR', message: '未配置模型' });
  });

  it('语音保活：done 后 streaming 立即复位，尾部 voice_audio/final 仍完整派发', async () => {
    stubFetch(async () =>
      sseResponse([
        'event: delta\ndata: {"content":"你好"}\n\n',
        'event: done\ndata: {"content":"你好","usage":null}\n\n',
        'event: voice_audio\ndata: {"fragment":"","spoken":"你好","audio":"wav","sampleRate":16000,"final":false}\n\n',
        'event: voice_audio\ndata: {"fragment":"","spoken":"","audio":null,"sampleRate":0,"final":true}\n\n',
        'event: voice_state\ndata: {"state":"idle"}\n\n',
      ]),
    );

    const handlers = {
      onDone: vi.fn(),
      onVoiceAudio: vi.fn(),
      onVoiceState: vi.fn(),
      onStreamingChange: vi.fn(),
    };
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.send(
        { assistantId: 'a1', content: 'hi', voice: { tts: true } },
        handlers,
      );
    });

    expect(handlers.onDone).toHaveBeenCalledTimes(1);
    // 尾部音频两帧（含 final）与 idle 均未因 done 而丢失
    expect(handlers.onVoiceAudio).toHaveBeenCalledTimes(2);
    expect(handlers.onVoiceAudio.mock.calls[1]![0].final).toBe(true);
    expect(handlers.onVoiceState).toHaveBeenCalledWith({ state: 'idle' });
    expect(result.current.streaming).toBe(false);
  });
});
