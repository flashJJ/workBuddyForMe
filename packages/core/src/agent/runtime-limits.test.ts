import { describe, expect, it } from 'vitest';
import { DEFAULT_AGENT_POLICY, type AgentPolicy } from '@wbfm/shared/schemas';
import type { Tool } from '../tools/types';
import { createRuntimeLimits } from './runtime-limits';

function tool(name: string, permission: Tool['permission'] = 'read'): Tool {
  return {
    name,
    description: '',
    parameters: { type: 'object' },
    permission,
    run: async () => ({ ok: true, output: '', summary: '' }),
  };
}

function policy(limits: Partial<AgentPolicy['limits']>): AgentPolicy {
  return { ...DEFAULT_AGENT_POLICY, limits: { ...DEFAULT_AGENT_POLICY.limits, ...limits } };
}

describe('任务运行时策略限额（v2.13 M4）', () => {
  it('运行时长到期', () => {
    let now = 1000;
    const limits = createRuntimeLimits({
      policy: policy({ maxRuntimeMs: 500 }),
      startedAtMs: 1000,
      now: () => now,
    });
    expect(limits.expired()).toBe(false);
    now = 1600;
    expect(limits.expired()).toBe(true);
  });

  it('写入次数上限', () => {
    const limits = createRuntimeLimits({
      policy: policy({ maxWritesPerRun: 2 }),
      startedAtMs: 0,
    });
    expect(limits.checkTool(tool('write_file', 'write'), 'builtin')).toEqual({ allowed: true });
    expect(limits.checkTool(tool('write_file', 'write'), 'builtin')).toEqual({ allowed: true });
    expect(limits.checkTool(tool('write_file', 'write'), 'builtin')).toEqual({
      allowed: false,
      reason: 'max_writes',
    });
    expect(limits.checkTool(tool('read_file'), 'builtin')).toEqual({ allowed: true });
  });

  it('外部调用上限（MCP / 网页）', () => {
    const limits = createRuntimeLimits({
      policy: policy({ maxExternalCallsPerRun: 1 }),
      startedAtMs: 0,
    });
    expect(limits.checkTool(tool('mcp_call'), 'mcp')).toEqual({ allowed: true });
    expect(limits.checkTool(tool('mcp_call'), 'mcp')).toEqual({
      allowed: false,
      reason: 'max_external_calls',
    });
    expect(limits.checkTool(tool('fetch_webpage'), 'builtin')).toEqual({
      allowed: false,
      reason: 'max_external_calls',
    });
  });
});
