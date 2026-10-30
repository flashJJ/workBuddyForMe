import { describe, expect, it } from 'vitest';
import { createDatabase } from '@wbfm/database';
import {
  DEFAULT_AGENT_POLICY,
  type AgentPolicy,
} from '@wbfm/shared/schemas';
import { createWebCipher } from '../secrets';
import { createApprovalRegistry } from '../work-signal/approval-registry';
import { createPendingConfirmations } from '../services/pending-confirmations';
import { createPermissionService } from '../services/permission-service';
import type { ServiceDeps } from '../services/deps';
import type { Tool } from '../tools/types';
import { gateToolPermission } from './tool-permission-gate';

const tool: Tool = {
  name: 'keyboard_type',
  description: '',
  parameters: { type: 'object' },
  permission: 'danger',
  run: async () => ({ ok: true, output: '', summary: '' }),
};

function makeDeps(policy: AgentPolicy, db = createDatabase(':memory:')): ServiceDeps {
  const approvals = createApprovalRegistry();
  return {
    db,
    cipher: createWebCipher(),
    permissions: createPermissionService({ db, cipher: createWebCipher() }),
    confirmations: createPendingConfirmations(),
    approvals,
    agentPolicy: () => policy,
  };
}

async function collect(
  deps: ServiceDeps,
  overrides: { toolName?: string; permission?: 'read' | 'write' | 'danger'; mode?: AgentPolicy['defaultMode'] } = {},
) {
  const generator = gateToolPermission({
    deps,
    tool,
    toolName: overrides.toolName ?? 'keyboard_type',
    callId: 'c1',
    argsSummary: 'x=1',
    args: { x: 1 },
    assistantId: 'a1',
    source: 'builtin',
    permission: overrides.permission ?? 'danger',
    ...(overrides.mode ? { mode: overrides.mode } : {}),
  });
  const events: unknown[] = [];
  let next = await generator.next();
  while (!next.done) {
    events.push(next.value);
    next = await generator.next();
  }
  return { result: next.value, events };
}

describe('工具门控策略与绑定（v2.13 M2）', () => {
  it('策略 deny 优先：full_access 也拒绝且不发起审批', async () => {
    const policy: AgentPolicy = {
      ...DEFAULT_AGENT_POLICY,
      tools: { deny: ['mouse_click'], allow: [], dangerAllow: [] },
    };
    const deps = makeDeps(policy);
    const { result } = await collect(deps, { toolName: 'mouse_click', mode: 'full_access' });
    expect(result.denied).toBe(true);
    expect(deps.approvals!.list()).toHaveLength(0);
  });

  it('plan_only 拒绝变更类工具', async () => {
    const deps = makeDeps(DEFAULT_AGENT_POLICY);
    const { result } = await collect(deps, { permission: 'write', mode: 'plan_only' });
    expect(result.denied).toBe(true);
  });

  it('confirm_each 对 danger 发起审批，拒绝后回灌结构化结果', async () => {
    const deps = makeDeps(DEFAULT_AGENT_POLICY);
    const generator = gateToolPermission({
      deps,
      tool,
      toolName: 'keyboard_type',
      callId: 'c2',
      argsSummary: 'x=1',
      args: { x: 1 },
      assistantId: 'a1',
      source: 'builtin',
      permission: 'danger',
      mode: 'confirm_each',
    });
    const first = await generator.next();
    expect(first.done).toBe(false);
    expect((first.value as { event: string }).event).toBe('tool_confirmation_required');
    expect(deps.approvals!.list()[0]?.bindingSummary).toContain('keyboard_type');
    deps.confirmations!.resolve('c2', 'deny');
    const deniedEvent = await generator.next();
    expect(deniedEvent.done).toBe(false);
    expect((deniedEvent.value as { event: string }).event).toBe('tool');
    const final = await generator.next();
    expect(final.done).toBe(true);
    expect((final.value as { denied: boolean }).denied).toBe(true);
  });

  it('显式权限 deny 记录阻止审批绕过', async () => {
    const deps = makeDeps(DEFAULT_AGENT_POLICY);
    deps.permissions!.grantPermission('keyboard_type', 'all', 'deny');
    const { result } = await collect(deps, { mode: 'confirm_each' });
    expect(result.denied).toBe(true);
  });

  it('策略 allow 只放宽 write；read 默认放行', async () => {
    const policy: AgentPolicy = {
      ...DEFAULT_AGENT_POLICY,
      tools: { deny: [], allow: ['write_file'], dangerAllow: [] },
    };
    const deps = makeDeps(policy);
    const { result } = await collect(deps, { toolName: 'write_file', permission: 'write' });
    expect(result.denied).toBe(false);
    const read = await collect(deps, { toolName: 'knowledge_search', permission: 'read' });
    expect(read.result.denied).toBe(false);
  });
});
