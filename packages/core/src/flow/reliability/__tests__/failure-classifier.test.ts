import { describe, expect, it } from 'vitest';
import type { FlowRunError } from '@wbfm/shared/types';
import { classifyFlowRunError } from '../failure-classifier';

const base: FlowRunError = { code: 'flow/run-failed', message: 'unknown' };

describe('classifyFlowRunError（v5.0）', () => {
  it('显式错误码优先：auth → 不可重试', () => {
    const out = classifyFlowRunError({ code: 'flow/auth-failed', message: 'x' });
    expect(out.category).toBe('auth');
    expect(out.retryable).toBe(false);
    expect(out.hint).toContain('密钥');
  });

  it('消息关键词识别网络/超时/限流并可重试（中英）', () => {
    for (const [message, category] of [
      ['connect ECONNREFUSED', 'network'],
      ['request timeout after 30s', 'timeout'],
      ['429 too many requests', 'rate_limit'],
      ['节点 n1 执行超时（30000ms）', 'timeout'],
      ['请求过于频繁，请稍后再试', 'rate_limit'],
      ['网络连接失败', 'network'],
      ['token rate limit exceeded', 'rate_limit'],
      ['额度不足', 'rate_limit'],
    ] as const) {
      const out = classifyFlowRunError({ ...base, message });
      expect(out.category).toBe(category);
      expect(out.retryable).toBe(true);
    }
  });

  it('中文鉴权/配置错误不自动补偿', () => {
    expect(classifyFlowRunError({ ...base, message: '密钥无效' })).toMatchObject({
      category: 'auth',
      retryable: false,
    });
    expect(classifyFlowRunError({ ...base, message: '配置缺失：必填参数' })).toMatchObject({
      category: 'config',
      retryable: false,
    });
  });

  it('配置/数据/版本错误不可重试', () => {
    expect(classifyFlowRunError({ code: 'flow/config-invalid', message: 'x' })).toMatchObject({
      category: 'config',
      retryable: false,
    });
    expect(classifyFlowRunError({ ...base, message: 'JSON parse failed' })).toMatchObject({
      category: 'data',
      retryable: false,
    });
    expect(classifyFlowRunError({ ...base, message: 'version not found' })).toMatchObject({
      category: 'version',
      retryable: false,
    });
  });

  it('无匹配时按节点类型兜底', () => {
    expect(classifyFlowRunError(base, { nodeId: 'n1', nodeType: 'tool' })).toMatchObject({
      category: 'tool',
      retryable: false,
    });
    expect(classifyFlowRunError(base, { nodeId: 'n1', nodeType: 'start' })).toMatchObject({
      category: 'config',
      retryable: false,
    });
  });

  it('完全未知时归为 unknown 且不自动补偿', () => {
    const out = classifyFlowRunError(base);
    expect(out.category).toBe('unknown');
    expect(out.retryable).toBe(false);
    expect(out.hint).toBeTruthy();
  });

  it('已有 hint 不覆盖', () => {
    const out = classifyFlowRunError({ ...base, hint: '自定义建议' });
    expect(out.hint).toBe('自定义建议');
  });
});
