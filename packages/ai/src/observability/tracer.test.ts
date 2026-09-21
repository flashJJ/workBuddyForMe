import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isTracingEnabled, startRun, traceAsync } from './tracer';

describe('tracer（LangSmith 可选追踪）', () => {
  const original = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.LANGSMITH_TRACING;
    delete process.env.LANGSMITH_API_KEY;
    delete process.env.LANGCHAIN_TRACING_V2;
    delete process.env.LANGCHAIN_API_KEY;
    delete process.env.LANGSMITH_PROJECT;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it('默认未启用：开关为 false', () => {
    expect(isTracingEnabled()).toBe(false);
  });

  it('同时配置开关与 Key 才启用（兼容 LANGCHAIN_ 前缀）', () => {
    process.env.LANGCHAIN_TRACING_V2 = 'true';
    expect(isTracingEnabled()).toBe(false);
    process.env.LANGCHAIN_API_KEY = 'lsv2_test';
    expect(isTracingEnabled()).toBe(true);
  });

  it('未启用时 startRun 返回 null 且不发起任何请求', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const handle = await startRun({ name: 'x', runType: 'chain' });
    expect(handle).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('未启用时 traceAsync 直通结果，异常原样抛出', async () => {
    const ok = await traceAsync({ name: 'x', runType: 'tool' }, async () => 42);
    expect(ok).toBe(42);

    await expect(
      traceAsync(
        { name: 'x', runType: 'tool' },
        async () => {
          throw new Error('boom');
        },
      ),
    ).rejects.toThrow('boom');
  });

  describe('启用时（HTTP 上报）', () => {
    beforeEach(() => {
      process.env.LANGSMITH_TRACING = 'true';
      process.env.LANGSMITH_API_KEY = 'lsv2_test';
      process.env.LANGSMITH_PROJECT = 'workbuddy-test';
    });

    it('startRun/end 分别 POST /runs 与 PATCH /runs/:id', async () => {
      const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
        async () => new Response(null, { status: 202 }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const handle = await startRun({
        name: 'root',
        runType: 'chain',
        inputs: { q: 'hi' },
        metadata: { app: 'wbfm' },
      });
      expect(handle).not.toBeNull();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [postUrl, postInit] = fetchMock.mock.calls[0]!;
      expect(postUrl).toBe('https://api.smith.langchain.com/runs');
      expect(postInit.method).toBe('POST');
      expect((postInit.headers as Record<string, string>)['x-api-key']).toBe('lsv2_test');
      const postBody = JSON.parse(postInit.body as string);
      expect(postBody).toMatchObject({
        name: 'root',
        run_type: 'chain',
        inputs: { q: 'hi' },
        session_name: 'workbuddy-test',
      });
      expect(postBody.trace_id).toMatch(/^[\da-f-]{36}$/);
      expect(postBody.dotted_order).toContain(postBody.id.replace(/-/g, ''));
      expect(postBody.extra.metadata).toEqual({ app: 'wbfm' });

      await handle!.end({ answer: 'done' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [patchUrl, patchInit] = fetchMock.mock.calls[1]!;
      expect(patchUrl).toBe(`https://api.smith.langchain.com/runs/${postBody.id}`);
      expect(patchInit.method).toBe('PATCH');
      expect(JSON.parse(patchInit.body as string).outputs).toEqual({ answer: 'done' });
    });

    it('子 span 携带 parent_run_id 且共用 trace_id', async () => {
      const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
        async () => new Response(null, { status: 202 }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const parent = await startRun({ name: 'turn', runType: 'chain' });
      const child = await startRun({ name: 'llm', runType: 'llm', parent });
      expect(child).not.toBeNull();

      const parentBody = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
      const childBody = JSON.parse(fetchMock.mock.calls[1]![1].body as string);
      expect(childBody.trace_id).toBe(parentBody.trace_id);
      expect(childBody.parent_run_id).toBe(parentBody.id);
      expect(childBody.dotted_order.startsWith(parentBody.dotted_order)).toBe(true);
    });

    it('traceAsync 成功时上报 mapOutput 的输出', async () => {
      const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
        async () => new Response(null, { status: 202 }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const result = await traceAsync(
        { name: 'tool:t', runType: 'tool', inputs: { a: 1 } },
        async () => ({ ok: true, summary: 'x' }),
        (v) => ({ ok: v.ok }),
      );
      expect(result.ok).toBe(true);

      const patchBody = JSON.parse(fetchMock.mock.calls[1]![1].body as string);
      expect(patchBody.outputs).toEqual({ ok: true });
      expect(patchBody.error).toBeUndefined();
    });

    it('traceAsync 抛错时上报 error 且异常原样抛出', async () => {
      const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
        async () => new Response(null, { status: 202 }),
      );
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        traceAsync(
          { name: 'llm', runType: 'llm' },
          async () => {
            throw new Error('upstream 500');
          },
        ),
      ).rejects.toThrow('upstream 500');

      const patchBody = JSON.parse(fetchMock.mock.calls[1]![1].body as string);
      expect(patchBody.error).toContain('upstream 500');
    });

    it('上报返回非 2xx 或网络失败时不影响主链路', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()
        .mockResolvedValueOnce(new Response('bad dotted order', { status: 400 }))
        .mockResolvedValueOnce(new Response(null, { status: 400 }))
        .mockRejectedValueOnce(new TypeError('network down'))
        .mockRejectedValueOnce(new TypeError('network down'));
      vi.stubGlobal('fetch', fetchMock);

      const handle = await startRun({ name: 'x', runType: 'chain' });
      expect(handle).not.toBeNull();
      await expect(handle!.end()).resolves.toBeUndefined();

      const value = await traceAsync({ name: 'y', runType: 'chain' }, async () => 'still works');
      expect(value).toBe('still works');
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });
});
