import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
  DEFAULT_AGENT_POLICY,
  resolveAgentPolicy,
  type AgentPolicy,
} from '@wbfm/shared/schemas';
import { agentPolicyHash, evaluateAgentPolicy } from './policy';

function policy(overrides: Partial<AgentPolicy> = {}): AgentPolicy {
  return { ...DEFAULT_AGENT_POLICY, ...overrides };
}

describe('Agent 策略求值（v2.13 M2）', () => {
  it('默认策略：read 放行，write/danger 询问；plan_only 拒绝', () => {
    expect(
      evaluateAgentPolicy({
        policy: policy(),
        toolName: 'knowledge_search',
        permission: 'read',
        mode: 'confirm_each',
      }).decision,
    ).toBe('allow');
    expect(
      evaluateAgentPolicy({
        policy: policy(),
        toolName: 'keyboard_type',
        permission: 'danger',
        mode: 'confirm_each',
      }).decision,
    ).toBe('ask');
    expect(
      evaluateAgentPolicy({
        policy: policy(),
        toolName: 'mouse_click',
        permission: 'danger',
        mode: 'plan_only',
      }),
    ).toMatchObject({ decision: 'deny', reasonCode: 'MODE_DENY' });
  });

  it('deny wins：策略 deny 覆盖 full_access 与持久授权', () => {
    const decision = evaluateAgentPolicy({
      policy: policy({ tools: { deny: ['mouse_click'], allow: [], dangerAllow: [] } }),
      toolName: 'mouse_click',
      permission: 'danger',
      mode: 'full_access',
    });
    expect(decision).toMatchObject({ decision: 'deny', reasonCode: 'POLICY_DENY' });
  });

  it('smart_approve：桌面控制即使进 dangerAllow 也不自动放行', () => {
    const p = policy({
      tools: { deny: [], allow: [], dangerAllow: ['mouse_click', 'fetch_webpage'] },
    });
    expect(
      evaluateAgentPolicy({
        policy: p,
        toolName: 'mouse_click',
        permission: 'danger',
        mode: 'smart_approve',
      }).decision,
    ).toBe('ask');
    expect(
      evaluateAgentPolicy({
        policy: p,
        toolName: 'fetch_webpage',
        permission: 'danger',
        mode: 'smart_approve',
      }).decision,
    ).toBe('allow');
  });

  it('工作目录：越界拒绝；缺目录时询问', () => {
    const escape = evaluateAgentPolicy({
      policy: policy(),
      toolName: 'write_file',
      permission: 'write',
      mode: 'auto_edits',
      workspacePath: resolve('ws'),
      pathTargets: [resolve('other', 'file.txt')],
    });
    expect(escape).toMatchObject({ decision: 'deny', reasonCode: 'WORKSPACE_ESCAPE' });
    expect(
      evaluateAgentPolicy({
        policy: policy(),
        toolName: 'write_file',
        permission: 'write',
        mode: 'auto_edits',
        workspacePath: null,
        pathTargets: ['file.txt'],
      }).decision,
    ).toBe('ask');
  });

  it('域名：deny 优先；allow 非空时未命中拒绝', () => {
    const p = policy({
      domains: { allow: ['*.example.com'], deny: ['*.bad.com'] },
      tools: { deny: [], allow: [], dangerAllow: ['fetch_webpage'] },
    });
    expect(
      evaluateAgentPolicy({
        policy: p,
        toolName: 'fetch_webpage',
        permission: 'danger',
        mode: 'smart_approve',
        domain: 'sub.example.com',
      }).decision,
    ).toBe('allow');
    expect(
      evaluateAgentPolicy({
        policy: p,
        toolName: 'fetch_webpage',
        permission: 'danger',
        mode: 'smart_approve',
        domain: 'evil.com',
      }).decision,
    ).toBe('deny');
  });

  it('策略哈希稳定且与键顺序无关', () => {
    const a = policy();
    const b = JSON.parse(JSON.stringify(a)) as AgentPolicy;
    expect(agentPolicyHash(a)).toHaveLength(64);
    expect(agentPolicyHash(a)).toBe(agentPolicyHash(b));
  });

  it('resolveAgentPolicy 补默认值并丢弃未知字段', () => {
    const resolved = resolveAgentPolicy({ defaultMode: 'plan_only', unknown: true });
    expect(resolved.defaultMode).toBe('plan_only');
    expect(resolved.tools.deny).toEqual([]);
    expect((resolved as unknown as Record<string, unknown>).unknown).toBeUndefined();
  });
});
