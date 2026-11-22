import { createDatabase, createWorkflowRepository, createWorkflowRunRepository } from '@wbfm/database';
import { describe, expect, it } from 'vitest';
import { compileFlow } from '../compiler/compiler';
import type { FlowGraph } from '@wbfm/shared/schemas';
import type { Tool } from '../../tools/types';
import { loadCheckpoint } from './checkpoint';
import { decideResume, type DecideResumeParams } from './resume-policy';

function graph(withTool = false): FlowGraph {
  const nodes = withTool
    ? [
        { id: 'start', type: 'start' as const, position: { x: 0, y: 0 }, config: {} },
        { id: 't1', type: 'tool' as const, position: { x: 100, y: 0 }, config: { toolName: 'writer' } },
        { id: 'end', type: 'end' as const, position: { x: 200, y: 0 }, config: { output: 'x' } },
      ]
    : [
        { id: 'start', type: 'start' as const, position: { x: 0, y: 0 }, config: {} },
        { id: 'review', type: 'human' as const, position: { x: 100, y: 0 }, config: {} },
        { id: 'end', type: 'end' as const, position: { x: 200, y: 0 }, config: { output: 'x' } },
      ];
  const edges = withTool
    ? [
        { id: 'e1', source: 'start', target: 't1' },
        { id: 'e2', source: 't1', target: 'end' },
      ]
    : [
        { id: 'e1', source: 'start', target: 'review' },
        { id: 'e2', source: 'review', target: 'end' },
      ];
  return { nodes, edges };
}

function compiledOf(g: FlowGraph) {
  const result = compileFlow(g);
  if (!result.compiled) throw new Error('图编译失败');
  return result.compiled;
}

describe('loadCheckpoint（节点终态 → 续跑检查点）', () => {
  it('只收 succeeded/skipped，同节点取最后一行', () => {
    const db = createDatabase(':memory:');
    const workflows = createWorkflowRepository(db);
    const runs = createWorkflowRunRepository(db);
    const wf = workflows.createWorkflow({ name: '续跑' });
    const run = runs.createRun({ workflowId: wf.id, version: 1, trigger: 'manual' });

    const start = runs.addNodeExecution(run.id, 'start', {});
    runs.finishNodeExecution(start.id, 'succeeded', { outputs: {} });
    const first = runs.addNodeExecution(run.id, 'A', {});
    runs.finishNodeExecution(first.id, 'succeeded', { outputs: { text: '旧' } });
    const second = runs.addNodeExecution(run.id, 'A', {});
    runs.finishNodeExecution(second.id, 'succeeded', { outputs: { text: '新' } });
    const skipped = runs.addNodeExecution(run.id, 'B', {});
    runs.finishNodeExecution(skipped.id, 'skipped', {});
    runs.addNodeExecution(run.id, 'C', {}); // running：不进入检查点

    const checkpoint = loadCheckpoint(runs, run.id);
    expect(checkpoint?.nodes.map((n) => n.nodeId)).toEqual(['start', 'A', 'B']);
    expect(checkpoint?.nodes.find((n) => n.nodeId === 'A')?.outputs).toEqual({ text: '新' });
    expect(checkpoint?.lastSucceededNodeId).toBe('A');
  });

  it('没有任何终态节点时返回 null', () => {
    const db = createDatabase(':memory:');
    const workflows = createWorkflowRepository(db);
    const runs = createWorkflowRunRepository(db);
    const wf = workflows.createWorkflow({ name: '空' });
    const run = runs.createRun({ workflowId: wf.id, version: 1, trigger: 'manual' });
    expect(loadCheckpoint(runs, run.id)).toBeNull();
  });
});

describe('decideResume（启动续跑安全矩阵）', () => {
  const readTool: Tool = {
    name: 'writer',
    description: 't',
    parameters: { type: 'object' },
    permission: 'read',
    async run() {
      return { ok: true, output: '', summary: '' };
    },
  };
  const writeTool: Tool = { ...readTool, permission: 'write' };

  function setup(options: { tool?: boolean } = {}) {
    const db = createDatabase(':memory:');
    const workflows = createWorkflowRepository(db);
    const runs = createWorkflowRunRepository(db);
    const wf = workflows.createWorkflow({ name: '判定' });
    const run = runs.createRun({ workflowId: wf.id, version: 1, trigger: 'manual' });
    const compiled = compiledOf(graph(options.tool === true));
    return { runs, run, compiled };
  }

  function decide(
    ctx: ReturnType<typeof setup>,
    overrides: Partial<DecideResumeParams> = {},
  ) {
    return decideResume({
      run: ctx.runs.getRun(ctx.run.id)!,
      nodes: ctx.runs.listNodeExecutions(ctx.run.id),
      compiled: ctx.compiled,
      compiledVersion: 1,
      activeRunIds: new Set<string>(),
      ...overrides,
    });
  }

  it('chat 触发不自动续跑', () => {
    const ctx = setup();
    ctx.runs.finishRun(ctx.run.id, 'interrupted');
    expect(decide(ctx, { run: { ...ctx.runs.getRun(ctx.run.id)!, trigger: 'chat' } })).toMatchObject({
      eligible: false,
      reason: 'chat_request_gone',
    });
  });

  it('版本不一致时不续跑', () => {
    const ctx = setup();
    ctx.runs.finishRun(ctx.run.id, 'interrupted');
    expect(decide(ctx, { compiledVersion: 2 })).toMatchObject({
      eligible: false,
      reason: 'version_missing',
    });
  });

  it('无节点进度按空检查点续跑', () => {
    const ctx = setup();
    ctx.runs.claimQueued(ctx.run.id);
    expect(decide(ctx)).toMatchObject({ eligible: true, reason: 'empty_checkpoint' });
  });

  it('等待人工的运行续跑并重新进入等待', () => {
    const ctx = setup();
    ctx.runs.claimQueued(ctx.run.id);
    ctx.runs.markWaitingHuman(ctx.run.id, 'review');
    expect(decide(ctx)).toMatchObject({ eligible: true, reason: 'waiting_human' });
  });

  it('只读工具在途可续跑，写工具在途保持中断', () => {
    const readCtx = setup({ tool: true });
    readCtx.runs.claimQueued(readCtx.run.id);
    readCtx.runs.addNodeExecution(readCtx.run.id, 't1', { toolName: 'writer' });
    expect(decide(readCtx, { resolveTool: () => readTool })).toMatchObject({
      eligible: true,
      reason: 'safe_in_flight',
    });

    const writeCtx = setup({ tool: true });
    writeCtx.runs.claimQueued(writeCtx.run.id);
    writeCtx.runs.addNodeExecution(writeCtx.run.id, 't1', { toolName: 'writer' });
    expect(decide(writeCtx, { resolveTool: () => writeTool })).toMatchObject({
      eligible: false,
      reason: 'unsafe_in_flight',
      nodeId: 't1',
    });
  });

  it('human 在途不自动续跑', () => {
    const ctx = setup();
    ctx.runs.claimQueued(ctx.run.id);
    ctx.runs.addNodeExecution(ctx.run.id, 'review', {});
    expect(decide(ctx)).toMatchObject({ eligible: false, reason: 'unsafe_in_flight', nodeId: 'review' });
  });

  it('本进程仍在执行时拒绝', () => {
    const ctx = setup();
    expect(
      decide(ctx, { activeRunIds: new Set([ctx.run.id]) }),
    ).toMatchObject({ eligible: false, reason: 'already_active' });
  });
});
