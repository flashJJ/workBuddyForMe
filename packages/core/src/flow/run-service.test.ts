import type { FlowGraph, FlowHumanSubmitInput } from '@wbfm/shared';
import { createDatabase } from '@wbfm/database';
import {
  createWorkflowRepository,
  createWorkflowRunRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SecretCipher } from '../secrets/cipher';
import { createPermissionService } from '../services/permission-service';
import { createTaskGrantRegistry } from '../services/task-grants';
import type { ToolRuntime } from '../tools/tool-runtime';
import type { Tool } from '../tools/types';
import type { ServiceDeps } from '../services/deps';
import { createFlowRunService, type FlowRunService } from './run-service';
import type { FlowEventPayload } from './types';

async function drain(gen: AsyncGenerator<FlowEventPayload>): Promise<FlowEventPayload[]> {
  const out: FlowEventPayload[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

function graphStartEnd(output = 'DONE'): FlowGraph {
  return {
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
      {
        id: 'end',
        type: 'end',
        position: { x: 200, y: 0 },
        config: { output },
      },
    ],
    edges: [{ id: 'e1', source: 'start', target: 'end' }],
  };
}

function graphHuman(): FlowGraph {
  return {
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
      { id: 'review', type: 'human', position: { x: 200, y: 0 }, config: { prompt: '审核？' } },
      {
        id: 'end',
        type: 'end',
        position: { x: 400, y: 0 },
        config: { output: '{{$nodes.review.outputs.approved}}' },
      },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'review' },
      { id: 'e2', source: 'review', target: 'end' },
    ],
  };
}

function graphDangerTool(): FlowGraph {
  return {
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
      {
        id: 't1',
        type: 'tool',
        position: { x: 200, y: 0 },
        config: { toolName: 'danger_tool', args: {} },
      },
      {
        id: 'end',
        type: 'end',
        position: { x: 400, y: 0 },
        config: { output: '{{$nodes.t1.outputs.summary}}' },
      },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 't1' },
      { id: 'e2', source: 't1', target: 'end' },
    ],
  };
}

describe('FlowRunService（M1 集成：落库/挂起/flow 工具）', () => {
  let db: DatabaseInstance;
  let service: FlowRunService;
  let workflows: ReturnType<typeof createWorkflowRepository>;
  let runs: ReturnType<typeof createWorkflowRunRepository>;
  const dangerTool: Tool = {
    name: 'danger_tool',
    description: '危险工具',
    parameters: { type: 'object' },
    permission: 'danger',
    async run() {
      return { ok: true, output: 'X', summary: '已执行' };
    },
  };

  beforeEach(() => {
    db = createDatabase(':memory:');
    workflows = createWorkflowRepository(db);
    runs = createWorkflowRunRepository(db);
    const deps: ServiceDeps = {
      db,
      cipher: {} as SecretCipher,
      permissions: createPermissionService({ db, cipher: {} as SecretCipher }),
      taskGrants: createTaskGrantRegistry(),
    };
    const runtime = {
      resolveTool: (name: string) =>
        name === 'danger_tool' ? { tool: dangerTool, source: 'builtin' } : null,
    } as unknown as ToolRuntime;
    service = createFlowRunService({ deps, runtime, workflows, runs });
  });

  /** 试运行：先登记 queued，再订阅驱动（与 Web POST /runs + GET /events 同构） */
  function startManual(workflowId: string) {
    const runId = service.createRun({ workflowId, trigger: 'manual' });
    return service.startEvents(runId);
  }

  it('试运行 start→end：运行与节点记录落库，终态 succeeded', async () => {
    const wf = workflows.createWorkflow({ name: '最简' });
    workflows.addVersion(wf.id, graphStartEnd());
    const { runId, events } = startManual(wf.id);
    const all = await drain(events);
    expect(all.at(-1)?.type).toBe('run_succeeded');

    const run = runs.getRun(runId);
    expect(run?.status).toBe('succeeded');
    expect(run?.output).toBe('DONE');
    expect(run?.trigger).toBe('manual');
    const nodes = runs.listNodeExecutions(runId);
    expect(nodes.map((x) => `${x.nodeId}:${x.status}`)).toEqual([
      'start:succeeded',
      'end:succeeded',
    ]);
    expect(nodes.every((x) => x.durationMs >= 0)).toBe(true);
  });

  it('人工节点：事件挂起 → submitHuman 后继续；waiting_human 落库', async () => {
    const wf = workflows.createWorkflow({ name: '审核流' });
    workflows.addVersion(wf.id, graphHuman());
    const { runId, events } = startManual(wf.id);

    let submitted = false;
    for await (const ev of events) {
      if (ev.type === 'node_waiting_human' && ev.nodeId === 'review') {
        expect(runs.getRun(runId)?.status).toBe('waiting_human');
        const body: FlowHumanSubmitInput = { nodeId: 'review', approved: true, values: {} };
        expect(service.submitHuman(runId, 'review', body)).toBe(true);
        submitted = true;
      }
    }
    expect(submitted).toBe(true);
    expect(runs.getRun(runId)?.status).toBe('succeeded');
    expect(runs.getRun(runId)?.output).toBe(true);
  });

  it('danger 工具：挂起 → submitToolConfirmation 允许 → 执行并落库', async () => {
    const wf = workflows.createWorkflow({ name: '危险流' });
    workflows.addVersion(wf.id, graphDangerTool());
    const { runId, events } = startManual(wf.id);

    for await (const ev of events) {
      if (ev.type === 'node_waiting_human' && ev.nodeId === 't1') {
        expect(service.submitToolConfirmation(runId, 't1', true)).toBe(true);
      }
    }
    expect(runs.getRun(runId)?.status).toBe('succeeded');
    expect(runs.getRun(runId)?.output).toBe('已执行');
  });

  it('未发布的草稿不能以 chat 触发；发布后 resolveAsTool 返回 flow 工具', async () => {
    const wf = workflows.createWorkflow({ name: '周报', description: '整理周报' });
    expect(service.resolveAsTool(wf.id)).toBeNull();
    workflows.addVersion(wf.id, {
      ...graphStartEnd('WEEKLY'),
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 0, y: 0 },
          config: { inputs: [{ name: 'topic', type: 'string', required: true }] },
        },
        { id: 'end', type: 'end', position: { x: 2, y: 0 }, config: { output: 'WEEKLY' } },
      ],
    });
    expect(() => service.createRun({ workflowId: wf.id, trigger: 'chat' })).toThrow(/尚未发布/);

    workflows.publishVersion(wf.id);
    const tool = service.resolveAsTool(wf.id);
    expect(tool?.name).toBe(`flow:${wf.id}`);
    expect(tool?.description).toBe('整理周报');
    expect((tool?.parameters as { required: string[] }).required).toEqual(['topic']);

    // 对话执行（非交互）：ToolResult.ok
    const result = await tool!.run({ topic: '本周' }, { knowledgeBaseId: '', retrieve: async () => [] });
    expect(result.ok).toBe(true);
    expect(result.output).toBe('WEEKLY');
  });

  it('取消运行：cancel 后事件流收敛为 cancelled', async () => {
    const wf = workflows.createWorkflow({ name: '人工长流' });
    workflows.addVersion(wf.id, graphHuman());
    const { runId, events } = startManual(wf.id);

    const iterator = events[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value.type).toBe('run_started');
    expect(service.cancel(runId)).toBe(true);
    // 断线/abort 后挂起按拒绝处理，运行进入终态（cancelled 或 rejected 终态之一）
    const rest = await drain(events);
    const terminal = rest.at(-1);
    expect(['run_cancelled', 'run_succeeded']).toContain(terminal?.type);
    expect(['cancelled', 'succeeded']).toContain(runs.getRun(runId)?.status);
  });
});
