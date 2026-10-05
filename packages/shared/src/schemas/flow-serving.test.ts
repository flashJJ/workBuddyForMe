import { describe, expect, it } from 'vitest';
import {
  FLOW_DESKTOP_CONTROL_TOOLS,
  flowEndpointUpsertSchema,
  flowUnattendedPolicySchema,
} from './flow-serving';

describe('flowUnattendedPolicySchema（v0.9 无人值守策略）', () => {
  it('deny_all 归一为无 allowed', () => {
    expect(flowUnattendedPolicySchema.parse({ mode: 'deny_all' })).toEqual({ mode: 'deny_all' });
    // 多余 allowed 字段被忽略
    expect(
      flowUnattendedPolicySchema.parse({ mode: 'deny_all', allowed: ['x'] }),
    ).toEqual({ mode: 'deny_all' });
  });

  it('allowlist 至少一个工具，且去重', () => {
    const parsed = flowUnattendedPolicySchema.parse({
      mode: 'allowlist',
      allowed: ['fetch_webpage', 'fetch_webpage', 'knowledge_search'],
    });
    expect(parsed).toEqual({
      mode: 'allowlist',
      allowed: ['fetch_webpage', 'knowledge_search'],
    });
  });

  it('allowlist 空清单拒绝', () => {
    expect(flowUnattendedPolicySchema.safeParse({ mode: 'allowlist', allowed: [] }).success).toBe(false);
  });

  it('桌面控制类工具永久禁入白名单', () => {
    for (const banned of FLOW_DESKTOP_CONTROL_TOOLS) {
      const result = flowUnattendedPolicySchema.safeParse({
        mode: 'allowlist',
        allowed: ['fetch_webpage', banned],
      });
      expect(result.success).toBe(false);
    }
    // 抽查一个具体工具给出错误
    const result = flowUnattendedPolicySchema.safeParse({
      mode: 'allowlist',
      allowed: ['mouse_click'],
    });
    expect(result.success).toBe(false);
    // eslint 真机能跑通也只是第二道保险，schema 是第一道
    expect(FLOW_DESKTOP_CONTROL_TOOLS).toContain('mouse_click');
  });
});

describe('flowEndpointUpsertSchema（v0.9 端点配置）', () => {
  it('默认值：两个开关关、60s、30/分、deny_all', () => {
    const parsed = flowEndpointUpsertSchema.parse({});
    expect(parsed.httpEnabled).toBe(false);
    expect(parsed.mcpEnabled).toBe(false);
    expect(parsed.syncTimeoutMs).toBe(60_000);
    expect(parsed.rateLimitPerMin).toBe(30);
    expect(parsed.policy).toEqual({ mode: 'deny_all' });
  });

  it('超时/限速越界拒绝', () => {
    expect(flowEndpointUpsertSchema.safeParse({ syncTimeoutMs: 1000 }).success).toBe(false);
    expect(flowEndpointUpsertSchema.safeParse({ rateLimitPerMin: 0 }).success).toBe(false);
    expect(flowEndpointUpsertSchema.safeParse({ rateLimitPerMin: 100_000 }).success).toBe(false);
  });
});
