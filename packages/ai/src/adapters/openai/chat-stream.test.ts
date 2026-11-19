import { describe, expect, it } from 'vitest';
import { HttpResponse, http, setupMsw } from '../../testing/msw';
import { createOpenAiCompatibleAdapter, type ProviderConnection } from '../../index';

/**
 * v4.11 P1-1：本文件已从 `vi.stubGlobal('fetch')` 迁移到 MSW handler。
 * 第二个用例用 handler 的 request.signal 验证客户端 abort 会传到上游。
 */
const CONNECTION: ProviderConnection = {
  protocol: 'openai-compatible',
  baseUrl: 'https://api.x.com/v1/',
  apiKey: 'sk-test',
};

const ENDPOINT = 'https://api.x.com/v1/chat/completions';

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

const server = setupMsw();
let lastBody: Record<string, unknown> | null = null;

describe('OpenAI 兼容 chatStream（MSW）', () => {
  it('增量拼接、[DONE] 收尾、usage 提取、请求体正确', async () => {
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        lastBody = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(SSE_FIXTURE, {
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );
    const adapter = createOpenAiCompatibleAdapter(CONNECTION);

    const chunks = await collect(
      adapter.chatStream({
        model: 'gpt-x',
        messages: [{ role: 'user', content: 'hi' }],
        temperature: 0.5,
      }),
    );

    expect(chunks.map((chunk) => chunk.delta).join('')).toBe('你好，世界');
    expect(chunks.at(-1)!.usage).toEqual({
      promptTokens: 5,
      completionTokens: 3,
      totalTokens: 8,
    });
    expect(lastBody).toMatchObject({
      model: 'gpt-x',
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.5,
    });
  });

  it('abort 后上游请求信号被触发且流终止', async () => {
    const encoder = new TextEncoder();
    const upstreamSignal: { value?: AbortSignal } = {};
    let pullArmed = false;

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"首字"}}]}\n\n'));
      },
      pull(controller) {
        if (pullArmed) return;
        pullArmed = true;
        const signal = upstreamSignal.value!;
        const fail = () => controller.error(new DOMException('aborted', 'AbortError'));
        if (signal.aborted) {
          fail();
          return;
        }
        signal.addEventListener('abort', fail, { once: true });
      },
    });

    server.use(
      http.post(ENDPOINT, ({ request }) => {
        upstreamSignal.value = request.signal;
        return new HttpResponse(body, { headers: { 'content-type': 'text/event-stream' } });
      }),
    );

    const external = new AbortController();
    const adapter = createOpenAiCompatibleAdapter(CONNECTION);
    const iterator = adapter
      .chatStream({ model: 'm', messages: [], signal: external.signal })
      [Symbol.asyncIterator]();

    const first = await iterator.next();
    expect(first.value!.delta).toBe('首字');

    external.abort();
    await expect(iterator.next()).rejects.toMatchObject({ name: 'AbortError' });
    expect(upstreamSignal.value!.aborted).toBe(true);
  });
});
