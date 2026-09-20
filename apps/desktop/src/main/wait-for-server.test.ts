import { describe, expect, it, vi } from 'vitest';
import { waitForServer } from './wait-for-server';

describe('waitForServer 端口探测（TR-30.2）', () => {
  it('健康检查 200 即就绪，携带托管 token', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response('ok', { status: 200 }));
    await waitForServer('http://127.0.0.1:51000', 'tok', { fetchImpl, intervalMs: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('http://127.0.0.1:51000/api/health');
    const init = fetchImpl.mock.calls[0]?.[1];
    expect((init?.headers as Record<string, string>)['x-wbfm-token']).toBe('tok');
  });

  it('非 200 持续失败直到超时并抛错', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad', { status: 503 }));
    await expect(
      waitForServer('http://127.0.0.1:51001', 'tok', {
        fetchImpl,
        timeoutMs: 0,
        intervalMs: 1,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow(/未就绪/);
  });

  it('连接拒绝（fetch 抛错）后重试至就绪', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    await waitForServer('http://127.0.0.1:51002', 'tok', {
      fetchImpl,
      timeoutMs: 5000,
      intervalMs: 1,
      sleep: async () => undefined,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
