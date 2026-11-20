import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHAT_STREAM_IDLE_TIMEOUT_MS } from '@wbfm/shared/constants';
import { createOpenAiCompatibleAdapter } from '../../../index';

/**
 * 空闲看门狗回归（真实本机 SSE 连接，不走 MSW）：
 * 上游吐一帧后保持连接不结束。旧实现用 response.body.cancel() 中止，
 * 但 body 已被 parseSse 的 reader 锁定，cancel 抛 TypeError 被吞 → 永不超时。
 */

function startHangingSse(): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      });
      res.write('data: {"choices":[{"delta":{"content":"半"}}]}\n\n');
      // 故意不 end()：模拟上游僵死
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/v1/` });
    });
  });
}

describe('OpenAI 兼容 chatStream 空闲看门狗', () => {
  const servers: Server[] = [];

  afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.closeAllConnections();
            server.close(() => resolve());
          }),
      ),
    );
  });

  it('上游僵死时按空闲超时中止并报 PROVIDER_TIMEOUT', async () => {
    vi.useFakeTimers();
    const { server, baseUrl } = await startHangingSse();
    servers.push(server);
    const adapter = createOpenAiCompatibleAdapter({
      protocol: 'openai-compatible',
      baseUrl,
      apiKey: 'sk-test',
    });

    const iterator = adapter
      .chatStream({ model: 'm', messages: [] })
      [Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value!.delta).toBe('半');

    const pending = iterator.next();
    const rejected = expect(pending).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(CHAT_STREAM_IDLE_TIMEOUT_MS);
    await rejected;
  });
});
