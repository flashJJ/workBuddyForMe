// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useChatSession } from './use-chat-session';

const encoder = new TextEncoder();

function sseStream(signal: AbortSignal | null) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const frames = [
        'event: meta\ndata: {"messageId":"m-new","conversationId":"c-new"}\n\n',
        'event: delta\ndata: {"content":"你"}\n\n',
        'event: delta\ndata: {"content":"好"}\n\n',
        'event: citations\ndata: {"citations":[{"documentId":"d1","documentName":"a.txt","ordinal":1}]}\n\n',
        'event: done\ndata: {"content":"你好","usage":{"promptTokens":3,"completionTokens":2,"totalTokens":5}}\n\n',
      ];
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')));
      controller.close();
    },
  });
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  Wrapper.displayName = 'TestQueryWrapper';
  return Wrapper;
}

describe('useChatSession（TR-27.1）', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('首轮对话：乐观插入用户消息，delta 累积到助手消息，done 落定并回传新会话 ID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) =>
        new Response(sseStream(init?.signal ?? null), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      ),
    );
    const onCreated = vi.fn();
    const { result } = renderHook(
      () => useChatSession('a1', null, onCreated),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.send('在吗');
    });

    await waitFor(() => expect(result.current.streaming).toBe(false));
    expect(onCreated).toHaveBeenCalledWith('c-new');

    const messages = result.current.messages;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', content: '在吗' });
    expect(messages[1]).toMatchObject({
      role: 'assistant',
      id: 'm-new',
      conversationId: 'c-new',
      content: '你好',
      status: 'completed',
      totalTokens: 5,
    });
    expect(messages[1]!.citations[0]).toMatchObject({ documentName: 'a.txt', ordinal: 1 });

    const [url, init] = (vi.mocked(fetch).mock.calls[0] ?? []) as unknown as [string, RequestInit];
    expect(url).toBe('/api/chat/stream');
    expect(JSON.parse(init.body as string)).toMatchObject({ assistantId: 'a1', content: '在吗' });
  });
});
