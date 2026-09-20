import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenAiCompatibleAdapter, type ProviderConnection } from '../../index';

const CONNECTION: ProviderConnection = {
  protocol: 'openai-compatible',
  baseUrl: 'https://api.x.com/v1/',
  apiKey: 'sk-test',
};

const SSE_FIXTURE =
  'data: {"choices":[{"delta":{"content":"你好，"}}]}\n\n' +
  'data: {"choices":[{"delta":{"content":"世界"}}]}\n\n' +
  'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":5,"completion_tokens":3,"total_tokens":8}}\n\n' +
  'data: [DONE]\n\n' +
  'data: {"choices":[{"delta":{"content":"不应出现"}}]}\n\n';

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of iterable) result.push(item);
  return result;
}

describe('OpenAI 兼容 chatStream（TR-10.1）', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('增量拼接、[DONE] 收尾、usage 提取、请求体正确', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(SSE_FIXTURE, { headers: { 'content-type': 'text/event-stream' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = createOpenAiCompatibleAdapter(CONNECTION);

    const chunks = await collect(
      adapter.chatStream({
        model: 'gpt-x',
        messages: [{ role: 'user', content: 'hi' }],
        temperature: 0.5,
      }),
    );

    const text = chunks.map((c) => c.delta).join('');
    expect(text).toBe('你好，世界');
    expect(chunks.at(-1)!.usage).toEqual({
      promptTokens: 5,
      completionTokens: 3,
      totalTokens: 8,
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.x.com/v1/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: 'gpt-x',
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.5,
    });
  });

  it('abort 后上游请求信号被触发且流终止', async () => {
    const encoder = new TextEncoder();
    const signalHolder: { signal?: AbortSignal } = {};
    let pullArmed = false;

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"首字"}}]}\n\n'),
        );
      },
      pull(controller) {
        if (pullArmed) return;
        pullArmed = true;
        const signal = signalHolder.signal!;
        const fail = () => controller.error(new DOMException('aborted', 'AbortError'));
        // 消费者可能在 pull 注册监听前就已 abort，需立即检查
        if (signal.aborted) {
          fail();
          return;
        }
        signal.addEventListener('abort', fail, { once: true });
      },
    });
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      signalHolder.signal = init.signal!;
      return Promise.resolve(
        new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const external = new AbortController();
    const adapter = createOpenAiCompatibleAdapter(CONNECTION);
    const iterator = adapter
      .chatStream({ model: 'm', messages: [], signal: external.signal })
      [Symbol.asyncIterator]();

    const first = await iterator.next();
    expect(first.value!.delta).toBe('首字');

    external.abort();
    await expect(iterator.next()).rejects.toMatchObject({ name: 'AbortError' });
    expect(signalHolder.signal!.aborted).toBe(true);
  });
});
