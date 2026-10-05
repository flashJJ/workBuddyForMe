import { createDatabase } from '../client';
import { createWorkflowRepository } from './workflow-repo';
import { createWorkflowRunRepository } from './workflow-run-repo';
import { createWorkflowEndpointRepository } from './workflow-endpoint-repo';
import type { FlowGraph } from '@wbfm/shared';
import { describe, beforeEach, expect, it } from 'vitest';

const graph: FlowGraph = {
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
    { id: 'end', type: 'end', position: { x: 100, y: 0 }, config: { output: 'OK' } },
  ],
  edges: [{ id: 'e1', source: 'start', target: 'end' }],
};

describe('workflow-endpoint-repo（v0.9）', () => {
  let db: ReturnType<typeof createDatabase>;
  let workflows: ReturnType<typeof createWorkflowRepository>;
  let runs: ReturnType<typeof createWorkflowRunRepository>;
  let endpoints: ReturnType<typeof createWorkflowEndpointRepository>;

  beforeEach(() => {
    db = createDatabase(':memory:');
    workflows = createWorkflowRepository(db);
    runs = createWorkflowRunRepository(db);
    endpoints = createWorkflowEndpointRepository(db);
  });

  function seedPublished(): string {
    const wf = workflows.createWorkflow({ name: '摘要器' });
    workflows.addVersion(wf.id, graph);
    workflows.publishVersion(wf.id);
    return wf.id;
  }

  it('创建端点默认 deny_all/60s/30 限速；按 workflow 与 hash 可取', () => {
    const wfId = seedPublished();
    const view = endpoints.create({
      workflowId: wfId,
      keyHash: 'hash-1',
      keyPrefix: 'wfk_abcd1234',
      httpEnabled: true,
    })!;
    expect(view.policy).toEqual({ mode: 'deny_all' });
    expect(view.syncTimeoutMs).toBe(60_000);
    expect(view.rateLimitPerMin).toBe(30);
    expect(view.httpEnabled).toBe(true);
    expect(view.mcpEnabled).toBe(false);
    expect(view.status).toBe('enabled');

    expect(endpoints.getByWorkflowId(wfId)?.id).toBe(view.id);
    expect(endpoints.getRowByKeyHash('hash-1')?.workflow_id).toBe(wfId);
    expect(endpoints.getRowByKeyHash('nope')).toBeNull();
  });

  it('重置密钥更新 hash/prefix；配置更新合并字段；开关停用', () => {
    const wfId = seedPublished();
    const ep = endpoints.create({ workflowId: wfId, keyHash: 'h1', keyPrefix: 'wfk_11111111' })!;
    endpoints.rotateKey(ep.id, 'h2', 'wfk_22222222');
    expect(endpoints.getRowByKeyHash('h1')).toBeNull();
    expect(endpoints.getById(ep.id)?.keyPrefix).toBe('wfk_22222222');

    endpoints.updateConfig(ep.id, {
      mcpEnabled: true,
      policy: { mode: 'allowlist', allowed: ['fetch_webpage'] },
    });
    const updated = endpoints.getById(ep.id)!;
    expect(updated.mcpEnabled).toBe(true);
    expect(updated.httpEnabled).toBe(false); // 未提供字段保持原值
    expect(updated.policy).toEqual({ mode: 'allowlist', allowed: ['fetch_webpage'] });

    endpoints.setStatus(ep.id, 'disabled');
    expect(endpoints.getById(ep.id)?.status).toBe('disabled');
  });

  it('listMcpEnabledWorkflowIds 只返回启用 MCP 且端点 enabled 的流程', () => {
    const a = seedPublished();
    const b = seedPublished();
    endpoints.create({ workflowId: a, keyHash: 'ha', keyPrefix: 'wfk_a', mcpEnabled: true });
    const epB = endpoints.create({ workflowId: b, keyHash: 'hb', keyPrefix: 'wfk_b', mcpEnabled: true });
    endpoints.setStatus(epB.id, 'disabled');
    expect(endpoints.listMcpEnabledWorkflowIds()).toEqual([a]);
  });
});

describe('workflow-run-repo v0.9 扩展（认领/中断/恢复扫描/过滤）', () => {
  let db: ReturnType<typeof createDatabase>;
  let runs: ReturnType<typeof createWorkflowRunRepository>;
  let wfId: string;

  beforeEach(() => {
    db = createDatabase(':memory:');
    const workflows = createWorkflowRepository(db);
    runs = createWorkflowRunRepository(db);
    const wf = workflows.createWorkflow({ name: 'x' });
    workflows.addVersion(wf.id, graph);
    workflows.publishVersion(wf.id);
    wfId = wf.id;
  });

  it('createRun 携带端点/重放字段；listRuns 按 trigger/status 过滤', () => {
    runs.createRun({ workflowId: wfId, version: 1, trigger: 'api', endpointId: 'ep1' });
    runs.createRun({ workflowId: wfId, version: 1, trigger: 'manual' });
    runs.createRun({
      workflowId: wfId,
      version: 1,
      trigger: 'mcp',
      endpointId: 'ep1',
      parentRunId: 'r0',
      resumedFromNode: 'n1',
    });

    expect(runs.listRuns({ trigger: 'api' })).toHaveLength(1);
    expect(runs.listRuns({ status: 'queued' })).toHaveLength(3);
    const replay = runs.listRuns({ trigger: 'mcp' })[0]!;
    expect(replay.parentRunId).toBe('r0');
    expect(replay.resumedFromNode).toBe('n1');
    expect(replay.endpointId).toBe('ep1');
  });

  it('claimQueued 原子性：仅 queued 可认领，重复认领失败', () => {
    const run = runs.createRun({ workflowId: wfId, version: 1 });
    expect(runs.claimQueued(run.id)).toBe(true);
    expect(runs.getRun(run.id)?.status).toBe('running');
    expect(runs.claimQueued(run.id)).toBe(false);
  });

  it('markInterrupted 只收敛 running/waiting_human，并写原因与 finished_at', () => {
    const queued = runs.createRun({ workflowId: wfId, version: 1 });
    const running = runs.createRun({ workflowId: wfId, version: 1 });
    runs.claimQueued(running.id);
    runs.markInterrupted(running.id, 'process_restart');
    const view = runs.getRun(running.id)!;
    expect(view.status).toBe('interrupted');
    expect(view.interruptReason).toBe('process_restart');
    expect(view.finishedAt).not.toBeNull();
    // queued 不被该函数改动
    expect(runs.getRun(queued.id)?.status).toBe('queued');
    expect(runs.markInterrupted(queued.id, 'process_restart')).toBeNull();
  });

  it('findRecoverableRuns：queued 重入队、在途标中断、内存 active 中的跳过', () => {
    const q = runs.createRun({ workflowId: wfId, version: 1 });
    const r = runs.createRun({ workflowId: wfId, version: 1 });
    runs.claimQueued(r.id);
    const active = runs.createRun({ workflowId: wfId, version: 1 });
    runs.claimQueued(active.id);

    const recover = runs.findRecoverableRuns(new Set([active.id]));
    expect(recover.queued).toEqual([q.id]);
    expect(recover.interrupted).toEqual([r.id]);
  });
});
