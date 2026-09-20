import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../errors/provider-error';
import { fetchJson } from './fetch-with-retry';

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchJson 超时/重试/归一化', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('成功请求注入鉴权头并序列化 body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const response = await fetchJson('https://x/v1/test', {
      apiKey: 'sk-secret',
      body: { a: 1 },
      maxRetries: 0,
    });
    expect(response.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers.get('Authorization')).toBe('Bearer sk-secret');
    expect(JSON.parse(init.body)).toEqual({ a: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('5xx 指数退避重试，第三次成功', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(503))
      .mockResolvedValueOnce(jsonResponse(502))
      .mockResolvedValueOnce(jsonResponse(200));
    const promise = fetchJson('https://x/v1/test', { maxRetries: 2 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await promise).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('5xx 重试耗尽后抛归一化错误（retriable）', async () => {
    fetchMock.mockImplementation(() => jsonResponse(500, { error: { message: '挂了' } }));
    const promise = fetchJson('https://x/v1/test', { maxRetries: 2 });
    const expectation = expect(promise).rejects.toMatchObject({
      name: 'ProviderError',
      code: 'PROVIDER_ERROR',
      status: 500,
      retriable: true,
      providerMessage: '挂了',
    });
    await vi.advanceTimersByTimeAsync(5000);
    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('4xx 不重试，立即失败', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { error: { message: 'invalid api key' } }),
    );
    await expect(fetchJson('https://x/v1/test', { maxRetries: 2 })).rejects.toMatchObject({
      status: 401,
      retriable: false,
      providerMessage: 'invalid api key',
    } satisfies Partial<ProviderError>);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('连接错误（TypeError）重试后恢复', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(jsonResponse(200));
    const promise = fetchJson('https://x/v1/test', { maxRetries: 1 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await promise).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('连接错误持续失败：归一化为不可达错误', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const promise = fetchJson('https://x/v1/test', { maxRetries: 0 });
    await expect(promise).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });

  it('超时触发 abort 并归一化', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        }),
    );
    const promise = fetchJson('https://x/v1/test', { timeoutMs: 20, maxRetries: 0 });
    const expectation = expect(promise).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(50);
    await expectation;
  });

  it('外部信号已取消：透传取消错误且不重试', async () => {
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    await expect(
      fetchJson('https://x/v1/test', { maxRetries: 2, signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
