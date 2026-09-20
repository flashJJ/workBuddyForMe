// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useChatStream } from './use-chat-stream';

const encoder = new TextEncoder();

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
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      capturedSignal = init.signal;
      return sseResponse([
        'event: meta\ndata: {"messageId":"m1","conversationId":"c1"}\n\n',
        'event: delta\ndata: {"content":"你"}\n\n',
        'event: delta\ndata: {"content":"好"}\n\n',
        'event: done\ndata: {"content":"你好","usage":null}\n\n',
      ], init.signal);
    }));

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
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
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

  it('错误事件透传 code/message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          'event: meta\ndata: {"messageId":"m","conversationId":"c"}\n\n',
          'event: error\ndata: {"code":"VALIDATION_ERROR","message":"未配置模型"}\n\n',
        ]),
      ),
    );
    const onError = vi.fn();
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.send({ assistantId: 'a1', content: 'hi' }, { onError });
    });
    expect(onError).toHaveBeenCalledWith({ code: 'VALIDATION_ERROR', message: '未配置模型' });
  });
});
