import { describe, expect, it } from 'vitest';
import {
  HttpResponse,
  delay,
  http,
  setupMsw,
  type JsonBodyType,
} from '../testing/msw';
import { ProviderError } from '../errors/provider-error';
import { fetchJson } from './fetch-with-retry';

/**
 * v4.11 P1-1：本文件已从 `vi.stubGlobal('fetch')` 迁移到 MSW handler。
 * 重试退避使用真实计时（约 0.4–1.2s/次），避免 fake timers 与 MSW 拦截器互相干扰。
 */
const URL = 'https://x/v1/test';

const server = setupMsw();
let calls: Array<{ headers: Headers; body: string | null }> = [];
let steps: Array<() => Response | Promise<Response>> = [];
let cursor = 0;

function respond(next: Array<() => Response | Promise<Response>>): void {
  calls = [];
  steps = next;
  cursor = 0;
  server.use(
    http.all(URL, async ({ request }) => {
      calls.push({ headers: request.headers, body: await request.clone().text() });
      const step = steps[Math.min(cursor, steps.length - 1)]!;
      cursor += 1;
      return step();
    }),
  );
}

function json(status: number, body: JsonBodyType = {}): Response {
  return HttpResponse.json(body, { status });
}

describe('fetchJson 超时/重试/归一化（MSW）', () => {
  it('成功请求注入鉴权头并序列化 body', async () => {
    respond([() => json(200, { ok: true })]);
    const response = await fetchJson(URL, {
      method: 'POST',
      apiKey: 'sk-secret',
      body: { a: 1 },
      maxRetries: 0,
    });

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer sk-secret');
    expect(JSON.parse(calls[0]!.body!)).toEqual({ a: 1 });
  });

  it('5xx 指数退避重试，第三次成功', async () => {
    respond([() => json(503), () => json(502), () => json(200)]);
    const response = await fetchJson(URL, { maxRetries: 2 });
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(3);
  }, 10_000);

  it('5xx 重试耗尽后抛归一化错误（retriable）', async () => {
    respond([() => json(500, { error: { message: '挂了' } })]);
    await expect(fetchJson(URL, { maxRetries: 2 })).rejects.toMatchObject({
      name: 'ProviderError',
      code: 'PROVIDER_ERROR',
      status: 500,
      retriable: true,
      providerMessage: '挂了',
    } satisfies Partial<ProviderError>);
    expect(calls).toHaveLength(3);
  }, 10_000);

  it('4xx 不重试，立即失败', async () => {
    respond([() => json(401, { error: { message: 'invalid api key' } })]);
    await expect(fetchJson(URL, { maxRetries: 2 })).rejects.toMatchObject({
      status: 401,
      retriable: false,
      providerMessage: 'invalid api key',
    } satisfies Partial<ProviderError>);
    expect(calls).toHaveLength(1);
  });

  it('连接错误（网络失败）重试后恢复', async () => {
    respond([() => HttpResponse.error(), () => json(200)]);
    const response = await fetchJson(URL, { maxRetries: 1 });
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);
  }, 10_000);

  it('连接错误持续失败：归一化为不可达错误', async () => {
    respond([() => HttpResponse.error()]);
    await expect(fetchJson(URL, { maxRetries: 0 })).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
    } satisfies Partial<ProviderError>);
  });

  it('超时触发 abort 并归一化', async () => {
    respond([async () => {
      await delay('infinite');
      return json(200);
    }]);
    await expect(
      fetchJson(URL, { timeoutMs: 20, maxRetries: 0 }),
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
  });

  it('外部信号已取消：透传取消错误且不重试', async () => {
    respond([() => json(200)]);
    await expect(
      fetchJson(URL, { maxRetries: 2, signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls.length).toBeLessThanOrEqual(1);
  });
});
