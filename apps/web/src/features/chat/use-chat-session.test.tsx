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

  it('任务模式失败后 retry：重新发起协作，不追加重复用户消息、不走普通 chat/stream', async () => {
    const runSeq = { n: 0 };
    const jsonOk = (obj: unknown) =>
      new Response(JSON.stringify({ success: true, data: obj }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url.endsWith('/messages')) return jsonOk([]);
      if (url.endsWith('/api/agent/runs') && method === 'POST') {
        runSeq.n += 1;
        return jsonOk({
          id: `run-${runSeq.n}`,
          status: 'running',
          budget: { maxRounds: 3, maxSteps: 20, maxTotalTokens: 80000 },
        });
      }
      if (/\/agent\/runs\/run-\d+\/events/.test(url)) {
        const frame = 'event: done\ndata: {"content":"","usage":null}\n\n';
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(frame));
              controller.close();
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        );
      }
      const detail = /\/agent\/runs\/(run-\d+)$/.exec(url);
      if (detail) {
        return jsonOk({
          run: {
            id: detail[1],
            status: 'failed',
            errorCode: 'AGENT_RUN_FAILED',
            errorMessage: '403 overdue',
            finalOutcome: null,
            budget: { maxRounds: 3, maxSteps: 20, maxTotalTokens: 80000 },
          },
        });
      }
      return new Response(JSON.stringify({ success: false, error: { code: 'X', message: 'unmocked' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useChatSession('a1', 'c1', vi.fn()), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.sendTask('帮我规划职业发展');
    });
    await waitFor(() => expect(result.current.streaming).toBe(false));

    let messages = result.current.messages;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', content: '帮我规划职业发展' });
    expect(messages[1]).toMatchObject({ role: 'assistant', status: 'error' });
    const firstAssistantId = messages[1]!.id;
    expect(result.current.agentCards[firstAssistantId]).toBeTruthy();
    const postRuns = () =>
      fetchMock.mock.calls.filter(
        ([u, i]) => (i as RequestInit | undefined)?.method === 'POST' && String(u).endsWith('/api/agent/runs'),
      );
    expect(postRuns()).toHaveLength(1);

    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.streaming).toBe(false));

    // 重新发起了第二次协作，而非普通 regenerate（那条路在任务模式必报「没有可重新生成的用户消息」）
    expect(postRuns()).toHaveLength(2);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/api/chat/stream'))).toBe(false);
    messages = result.current.messages;
    expect(messages).toHaveLength(2); // 不重复追加用户消息
    expect(messages[0]).toMatchObject({ role: 'user', content: '帮我规划职业发展' });
    expect(messages[1]!.id).not.toBe(firstAssistantId); // 新占位替换旧失败回复
  });
});
