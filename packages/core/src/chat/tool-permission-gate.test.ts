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
import { createAuditService, type AuditService } from '../governance/audit';
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
    audit: createAuditService(db),
    agentPolicy: () => policy,
  };
}

function auditKinds(deps: ServiceDeps): string[] {
  return deps.audit!.list({ limit: 50 }).events.map((event) => event.kind);
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

  it('策略拒绝写 policy_denied（含工具与决策）', async () => {
    const policy: AgentPolicy = {
      ...DEFAULT_AGENT_POLICY,
      tools: { deny: ['mouse_click'], allow: [], dangerAllow: [] },
    };
    const deps = makeDeps(policy);
    await collect(deps, { toolName: 'mouse_click', mode: 'full_access' });
    const event = deps.audit!.list({ limit: 10 }).events[0]!;
    expect(event.kind).toBe('policy_denied');
    expect(event.tool).toBe('mouse_click');
    expect(event.decision).toBe('deny');
    expect(event.policyHash).toBeTruthy();
  });

  it('审批通过写 requested + granted，拒绝写 denied', async () => {
    const deps = makeDeps(DEFAULT_AGENT_POLICY);
    const generator = gateToolPermission({
      deps,
      tool,
      toolName: 'keyboard_type',
      callId: 'c3',
      argsSummary: 'x=1',
      args: { x: 1 },
      assistantId: 'a1',
      source: 'builtin',
      permission: 'danger',
      mode: 'confirm_each',
    });
    const first = await generator.next();
    expect(first.done).toBe(false);
    deps.confirmations!.resolve('c3', 'allow');
    const final = await generator.next();
    expect(final.done).toBe(true);
    expect((final.value as { denied: boolean }).denied).toBe(false);
    expect(auditKinds(deps)).toEqual(['approval_granted', 'approval_requested']);

    const denied = makeDeps(DEFAULT_AGENT_POLICY);
    const other = gateToolPermission({
      deps: denied,
      tool,
      toolName: 'keyboard_type',
      callId: 'c4',
      argsSummary: 'x=1',
      args: { x: 1 },
      assistantId: 'a1',
      source: 'builtin',
      permission: 'danger',
      mode: 'confirm_each',
    });
    await other.next();
    denied.confirmations!.resolve('c4', 'deny');
    const endEvent = await other.next();
    expect(endEvent.done).toBe(false);
    const done = await other.next();
    expect(done.done).toBe(true);
    expect((done.value as { denied: boolean }).denied).toBe(true);
    expect(auditKinds(denied)).toEqual(['approval_denied', 'approval_requested']);
  });

  it('审批后参数漂移写 binding_drift 并拒绝执行', async () => {
    const deps = makeDeps(DEFAULT_AGENT_POLICY);
    const args: Record<string, unknown> = { x: 1 };
    const generator = gateToolPermission({
      deps,
      tool,
      toolName: 'keyboard_type',
      callId: 'c5',
      argsSummary: 'x=1',
      args,
      assistantId: 'a1',
      source: 'builtin',
      permission: 'danger',
      mode: 'confirm_each',
    });
    await generator.next();
    args.x = 2;
    deps.confirmations!.resolve('c5', 'allow');
    let next = await generator.next();
    while (!next.done) next = await generator.next();
    expect((next.value as { denied: boolean }).denied).toBe(true);
    expect(auditKinds(deps)).toContain('binding_drift');
  });

  it('审计不可用时审批路径 fail-closed，不登记审批', async () => {
    const broken: AuditService = {
      append() {
        throw new Error('audit db down');
      },
      safeAppend() {
        return null;
      },
      list() {
        return { events: [], nextCursor: null };
      },
      verify() {
        return { ok: true, checked: 0, firstBrokenSeq: null };
      },
      count() {
        return 0;
      },
      *iterateJsonl() {},
    };
    const deps = { ...makeDeps(DEFAULT_AGENT_POLICY), audit: broken };
    const { result } = await collect(deps, { mode: 'confirm_each' });
    expect(result.denied).toBe(true);
    expect(deps.approvals!.list()).toHaveLength(0);
  });
});
