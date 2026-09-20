import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiGet, apiPost, apiUpload } from './client';

describe('类型安全 API 客户端（TR-24.1）', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('成功包络解包返回 data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ success: true, data: { id: 'x' } }), { status: 200 }),
      ),
    );
    const data = await apiGet<{ id: string }>('/api/test');
    expect(data).toEqual({ id: 'x' });
  });

  it('失败包络抛出携带 code/status 的 ApiClientError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: '参数错误' },
          }),
          { status: 422 },
        ),
      ),
    );
    await expect(apiPost('/api/test', { a: 1 })).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'VALIDATION_ERROR',
      status: 422,
    });
  });

  it('非 JSON 响应抛 INTERNAL_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('oops', { status: 502 })));
    await expect(apiGet('/api/test')).rejects.toBeInstanceOf(ApiClientError);
  });

  it('上传：multipart 不强制 content-type，直接透传 FormData', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, data: { id: 'd1' } }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const form = new FormData();
    form.append('file', new Blob(['abc']), 'a.txt');
    const result = await apiUpload('/api/upload', form);
    expect(result).toEqual({ id: 'd1' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBe(form);
    expect(new Headers(init.headers).get('content-type')).toBeNull();
  });
});
