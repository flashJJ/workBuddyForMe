import { afterEach, describe, expect, it, vi } from 'vitest';
import { openSseChannel } from './sse-channel';
import { parseSse } from './sse-parser';

function sseResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index]!);
      else controller.close();
      index += 1;
    },
  });
}

describe('openSseChannel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('成功打开并保留可读流', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse('data: ok\n\n'));
    vi.stubGlobal('fetch', fetchMock);
    const channel = await openSseChannel('https://x/v1/chat', {
      apiKey: 'sk',
      body: { model: 'm' },
    });
    expect(channel.response.body).toBeTruthy();
    expect(typeof channel.dispose).toBe('function');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers.Authorization).toBe('Bearer sk');
  });

  it('非 2xx 归一化且流式通道不重试', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse(JSON.stringify({ error: { message: '限流' } }), 429));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      openSseChannel('https://x/v1/chat', { body: {} }),
    ).rejects.toMatchObject({ status: 429, code: 'PROVIDER_ERROR' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('parseSse', () => {
  const encoder = new TextEncoder();

  it('解析增量块、多行 data、注释与 [DONE]', async () => {
    const raw =
      ': ping\n\n' +
      'event: meta\ndata: {"id":"1"}\n\n' +
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\n' +
      'data: line1\ndata: line2\n\n' +
      'data: [DONE]\n\n';
    // 故意从字节中间切断，验证缓冲拼接
    const bytes = encoder.encode(raw);
    const cut = Math.floor(bytes.length / 2);
    const stream = streamFromChunks([bytes.slice(0, cut), bytes.slice(cut)]);

    const events = [];
    for await (const event of parseSse(stream)) events.push(event);
    expect(events).toHaveLength(4);
    expect(events[0]).toEqual({ event: 'meta', data: '{"id":"1"}' });
    expect(JSON.parse(events[1]!.data).choices[0].delta.content).toBe('你');
    expect(events[2]!.data).toBe('line1\nline2');
    expect(events[3]!.data).toBe('[DONE]');
  });

  it('兼容 CRLF 与无结尾空行', async () => {
    const stream = streamFromChunks([
      encoder.encode('event: delta\r\ndata: {"x":1}\r\n\r\ndata: tail'),
    ]);
    const events = [];
    for await (const event of parseSse(stream)) events.push(event);
    expect(events[0]).toEqual({ event: 'delta', data: '{"x":1}' });
    expect(events[1]).toEqual({ event: 'message', data: 'tail' });
  });
});
