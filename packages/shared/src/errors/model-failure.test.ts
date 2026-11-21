import { describe, expect, it } from 'vitest';
import {
  MAX_MODEL_SWITCH_ATTEMPTS,
  MODEL_FAILURE_AUTO_SWITCH,
  MODEL_FAILURE_CODES,
  canAutoSwitchModel,
  isModelFailureCode,
} from './model-failure';

describe('v4.18 模型失败分类契约', () => {
  it('七类错误码唯一且固定顺序', () => {
    expect(MODEL_FAILURE_CODES).toEqual([
      'auth_failed',
      'rate_limited',
      'timeout',
      'stream_interrupted',
      'context_overflow',
      'provider_5xx',
      'unknown',
    ]);
    expect(new Set(MODEL_FAILURE_CODES).size).toBe(MODEL_FAILURE_CODES.length);
  });

  it('仅限流、超时、断流与 5xx 可自动切换', () => {
    expect(MODEL_FAILURE_AUTO_SWITCH).toEqual({
      auth_failed: false,
      rate_limited: true,
      timeout: true,
      stream_interrupted: true,
      context_overflow: false,
      provider_5xx: true,
      unknown: false,
    });
  });

  it('首字后即使错误码可切换也必须停止', () => {
    expect(canAutoSwitchModel({ code: 'rate_limited', phase: 'before_first_token' })).toBe(true);
    expect(canAutoSwitchModel({ code: 'rate_limited', phase: 'after_first_token' })).toBe(false);
    expect(canAutoSwitchModel({ code: 'auth_failed', phase: 'before_first_token' })).toBe(false);
  });

  it('最多自动切换 2 次', () => {
    expect(MAX_MODEL_SWITCH_ATTEMPTS).toBe(2);
  });

  it('只接受已知错误码', () => {
    expect(isModelFailureCode('timeout')).toBe(true);
    expect(isModelFailureCode('Timeout')).toBe(false);
    expect(isModelFailureCode(undefined)).toBe(false);
    expect(isModelFailureCode(429)).toBe(false);
  });
});
