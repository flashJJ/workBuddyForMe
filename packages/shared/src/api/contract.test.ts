import { describe, expect, it } from 'vitest';
import { ApiError, ERROR_CODES, SSE_EVENT, fail, formatSse, ok, unwrapEnvelope } from '../index';

describe('ApiError 与包络', () => {
  it('错误码映射 HTTP 状态', () => {
    expect(ERROR_CODES.NOT_FOUND).toBe(404);
    const err = ApiError.notFound('供应商', 'p1');
    expect(err.status).toBe(404);
    expect(err.toBody()).toEqual({ code: 'NOT_FOUND', message: '供应商不存在：p1' });
  });

  it('ok/fail 包络结构正确', () => {
    expect(ok({ a: 1 })).toEqual({ success: true, data: { a: 1 } });
    const body = new ApiError('CONFLICT', '冲突').toBody();
    expect(fail(body).success).toBe(false);
  });

  it('unwrapEnvelope 成功解包、失败抛错带 code', () => {
    expect(unwrapEnvelope(ok(42))).toBe(42);
    try {
      unwrapEnvelope(fail(new ApiError('PROVIDER_TIMEOUT', '超时').toBody()));
      throw new Error('应当抛错');
    } catch (e) {
      expect((e as Error & { code?: string }).code).toBe('PROVIDER_TIMEOUT');
    }
  });
});

describe('SSE 序列化', () => {
  it('按 SSE wire 格式输出事件名与 JSON data', () => {
    const raw = formatSse(SSE_EVENT.DELTA, { content: '你好' });
    expect(raw).toBe('event: delta\ndata: {"content":"你好"}\n\n');
  });

  it('meta/done 事件载荷可序列化', () => {
    expect(formatSse(SSE_EVENT.META, { messageId: 'm1', conversationId: 'c1' })).toContain(
      '"messageId":"m1"',
    );
    expect(
      formatSse(SSE_EVENT.DONE, { content: '答', usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 } }),
    ).toContain('"totalTokens":3');
  });
});
