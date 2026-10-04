import { describe, expect, it } from 'vitest';
import type { FlowGraph } from '@wbfm/shared';
import { createDatabase, type DatabaseInstance } from '../client';
import { createWorkflowRepository } from './workflow-repo';
import { createWorkflowRunRepository } from './workflow-run-repo';

const graph: FlowGraph = {
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
    { id: 'end', type: 'end', position: { x: 200, y: 0 }, config: {} },
  ],
  edges: [{ id: 'e1', source: 'start', target: 'end' }],
};

describe('workflow-repo：版本与发布状态机', () => {
  function setup(): { db: DatabaseInstance; workflows: ReturnType<typeof createWorkflowRepository> } {
    const db = createDatabase(':memory:');
    return { db, workflows: createWorkflowRepository(db) };
  }

  it('创建默认 draft/currentVersion=0，元信息可更新', () => {
    const { workflows } = setup();
    const wf = workflows.createWorkflow({ name: '研究助手' });
    expect(wf.status).toBe('draft');
    expect(wf.currentVersion).toBe(0);
    const updated = workflows.updateWorkflow(wf.id, { description: 'd' });
    expect(updated?.description).toBe('d');
  });

  it('addVersion 版本号在工作流内自增并跟随 currentVersion，图可原样读回', () => {
    const { workflows } = setup();
    const wf = workflows.createWorkflow({ name: 'w' });
    const v1 = workflows.addVersion(wf.id, graph);
    const v2 = workflows.addVersion(wf.id, { ...graph, viewport: { x: 1, y: 2, zoom: 0.8 } });
    expect(v1?.version).toBe(1);
    expect(v2?.version).toBe(2);
    expect(workflows.getCurrentVersion(wf.id)?.version).toBe(2);
    expect(workflows.getVersion(wf.id, 1)?.graph.edges).toHaveLength(1);
    expect(workflows.getWorkflow(wf.id)?.status).toBe('draft');
  });

  it('发布后再存图回到 draft；发布不存在的版本抛错', () => {
    const { workflows } = setup();
    const wf = workflows.createWorkflow({ name: 'w' });
    workflows.addVersion(wf.id, graph);
    const published = workflows.publishVersion(wf.id);
    expect(published?.status).toBe('published');

    workflows.addVersion(wf.id, graph);
    expect(workflows.getWorkflow(wf.id)?.status).toBe('draft');
    expect(() => workflows.publishVersion(wf.id, 99)).toThrow();
  });

  it('删除工作流（级联清理由 v012 外键保证；run repo 写入受影响）', () => {
    const db = createDatabase(':memory:');
    const workflows = createWorkflowRepository(db);
    const runs = createWorkflowRunRepository(db);
    const wf = workflows.createWorkflow({ name: 'w' });
    workflows.addVersion(wf.id, graph);
    runs.createRun({ workflowId: wf.id, version: 1, input: { topic: 'x' } });
    expect(runs.listRunsByWorkflow(wf.id)).toHaveLength(1);
    workflows.deleteWorkflow(wf.id);
    expect(runs.listRunsByWorkflow(wf.id)).toHaveLength(0);
    db.close();
  });
});

describe('workflow-run-repo：运行状态机与节点记录', () => {
  it('queued→running→waiting_human→succeeded 全链路与字段序列化', () => {
    const db = createDatabase(':memory:');
    const workflows = createWorkflowRepository(db);
    const runs = createWorkflowRunRepository(db);
    const wf = workflows.createWorkflow({ name: 'w' });

    const run = runs.createRun({
      workflowId: wf.id,
      version: 1,
      trigger: 'chat',
      input: { topic: '周报' },
      conversationId: 'c1',
    });
    expect(run.status).toBe('queued');
    expect(runs.startRun(run.id)?.status).toBe('running');
    expect(runs.markWaitingHuman(run.id, 'review')?.waitNodeId).toBe('review');

    const node = runs.addNodeExecution(run.id, 'start', { topic: '周报' });
    expect(node.status).toBe('running');
    const finished = runs.finishNodeExecution(node.id, 'succeeded', { outputs: { ok: true } });
    expect(finished?.status).toBe('succeeded');
    expect(finished?.durationMs).toBeGreaterThanOrEqual(0);
    expect(finished?.outputs).toEqual({ ok: true });

    const done = runs.finishRun(run.id, 'succeeded', { output: { answer: 'done' } });
    expect(done?.status).toBe('succeeded');
    expect(done?.finishedAt).not.toBeNull();
    expect(done?.output).toEqual({ answer: 'done' });

    const nodes = runs.listNodeExecutions(run.id);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.inputs).toEqual({ topic: '周报' });
    db.close();
  });

  it('failed 终态保存结构化错误', () => {
    const db = createDatabase(':memory:');
    const workflows = createWorkflowRepository(db);
    const runs = createWorkflowRunRepository(db);
    const wf = workflows.createWorkflow({ name: 'w' });
    const run = runs.createRun({ workflowId: wf.id, version: 1 });
    const failed = runs.finishRun(run.id, 'failed', {
      error: { code: 'flow/node-failed', message: 'boom', nodeId: 'llm1' },
    });
    expect(failed?.error).toEqual({ code: 'flow/node-failed', message: 'boom', nodeId: 'llm1' });
    db.close();
  });
});
