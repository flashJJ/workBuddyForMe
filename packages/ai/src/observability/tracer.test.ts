import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isTracingEnabled, startRun, traceAsync } from './tracer';

describe('tracer（LangSmith 可选追踪）', () => {
  const original = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    delete process.env.LANGSMITH_TRACING;
    delete process.env.LANGSMITH_API_KEY;
    delete process.env.LANGCHAIN_TRACING_V2;
    delete process.env.LANGCHAIN_API_KEY;
  });

  afterEach(() => {
    process.env = { ...original };
    vi.restoreAllMocks();
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
    const handle = await startRun({ name: 'x', runType: 'chain' });
    expect(handle).toBeNull();
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
});
