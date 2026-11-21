import { describe, expect, it } from 'vitest';
import { ProviderError } from './provider-error';
import { classifyModelFailure } from './classify-failure';

function httpError(status: number, providerMessage?: string): ProviderError {
  return new ProviderError({
    code: 'PROVIDER_ERROR',
    message: `上游失败 ${status}`,
    status,
    providerMessage,
  });
}

describe('v4.18 模型失败分类', () => {
  it('401 / 403 归为认证失败且不自动切换', () => {
    for (const status of [401, 403]) {
      const failure = classifyModelFailure(httpError(status), 'before_first_token');
      expect(failure).toMatchObject({
        code: 'auth_failed',
        status,
        retriable: false,
        phase: 'before_first_token',
      });
    }
  });

  it('429 归为限流且可自动切换', () => {
    expect(classifyModelFailure(httpError(429), 'before_first_token')).toMatchObject({
      code: 'rate_limited',
      retriable: true,
    });
  });

  it('连接或读取超时归为 timeout', () => {
    expect(classifyModelFailure(ProviderError.timeout('SSE', 1), 'before_first_token')).toMatchObject(
      { code: 'timeout', retriable: true },
    );
    expect(classifyModelFailure(new Error('request timed out'), 'before_first_token')).toMatchObject({
      code: 'timeout',
    });
  });

  it('5xx 归为供应商错误', () => {
    expect(classifyModelFailure(httpError(503), 'before_first_token')).toMatchObject({
      code: 'provider_5xx',
      status: 503,
      retriable: true,
    });
  });

  it('上下文超限优先于状态码且不自动切换', () => {
    expect(
      classifyModelFailure(
        httpError(400, 'context_length_exceeded: maximum context length is 4096'),
        'before_first_token',
      ),
    ).toMatchObject({ code: 'context_overflow', retriable: false });
  });

  it('已建立连接后的读取错误归为断流', () => {
    const error = new ProviderError({
      code: 'PROVIDER_ERROR',
      message: 'SSE 流式读取中断',
      reason: 'stream_interrupted',
    });
    expect(classifyModelFailure(error, 'after_first_token')).toMatchObject({
      code: 'stream_interrupted',
      phase: 'after_first_token',
      retriable: true,
    });
  });

  it('主动取消不是模型故障', () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(classifyModelFailure(abort, 'before_first_token')).toBeNull();
  });

  it('无法归类时归为 unknown', () => {
    expect(classifyModelFailure(new Error('boom'), 'before_first_token')).toMatchObject({
      code: 'unknown',
      retriable: false,
    });
  });
});
