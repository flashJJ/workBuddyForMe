import type { FlowGraph, FlowHumanSubmitInput } from '@wbfm/shared/schemas';
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
  let deps: ServiceDeps;
  let runtime: ToolRuntime;
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
    deps = {
      db,
      cipher: {} as SecretCipher,
      permissions: createPermissionService({ db, cipher: {} as SecretCipher }),
      taskGrants: createTaskGrantRegistry(),
    };
    runtime = {
      resolveTool: (name: string) =>
        name === 'danger_tool' ? { tool: dangerTool, source: 'builtin' } : null,
    } as unknown as ToolRuntime;
    service = createFlowRunService({ deps, runtime, workflows, runs });
  });

  /** v0.9：createRun 即入队（队列驱动执行）；订阅返回只读事件生成器 */
  function startManual(workflowId: string): {
    runId: string;
    events: NonNullable<ReturnType<FlowRunService['subscribeRunEvents']>>;
  } {
    const runId = service.createRun({ workflowId, trigger: 'manual' });
    const events = service.subscribeRunEvents(runId)!;
    return { runId, events };
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
    const seen: string[] = [];
    const result = await tool!.run(
      { topic: '本周' },
      {
        knowledgeBaseId: '',
        retrieve: async () => [],
        onSubstep: (s) => seen.push(`${s.id}:${s.status}`),
      },
    );
    expect(result.ok).toBe(true);
    expect(result.output).toBe('WEEKLY');

    // v0.8 M3：节点执行映射为工具子步骤（实时回调 + 结果快照一致）
    expect(seen).toEqual(['start:running', 'start:ok', 'end:running', 'end:ok']);
    expect(result.substeps?.map((s) => `${s.id}:${s.status}`)).toEqual([
      'start:ok',
      'end:ok',
    ]);
    expect(result.substeps?.[0]?.label).toBe('开始');

    // 已发布流程出现在 listPublishedTools
    expect(service.listPublishedTools().map((t) => t.name)).toEqual([`flow:${wf.id}`]);
  });

  it('取消运行：cancel 后事件流收敛为 cancelled', async () => {
    const wf = workflows.createWorkflow({ name: '人工长流' });
    workflows.addVersion(wf.id, graphHuman());
    const { runId, events } = startManual(wf.id);

    const seen: FlowEventPayload[] = [];
    for await (const event of events) {
      seen.push(event);
      if (event.type === 'run_started') {
        expect(service.cancel(runId)).toBe(true);
      }
    }
    expect(seen.at(-1)?.type).toBe('run_cancelled');
    expect(runs.getRun(runId)?.status).toBe('cancelled');
  });

  it('v0.9 多观察者：两个订阅看到一致事件序列，订阅断开不影响执行', async () => {
    const wf = workflows.createWorkflow({ name: '最简' });
    workflows.addVersion(wf.id, graphStartEnd());
    const runId = service.createRun({ workflowId: wf.id, trigger: 'manual' });

    // 第一个订阅收到 run_started 后立即断开（return 结束生成器）
    async function firstEvents(): Promise<FlowEventPayload['type'][]> {
      const types: FlowEventPayload['type'][] = [];
      for await (const event of service.subscribeRunEvents(runId)!) {
        types.push(event.type);
        if (types.length >= 1) return types; // 提前断开
      }
      return types;
    }
    const first = await firstEvents();
    expect(first).toEqual(['run_started']);

    // 第二个订阅仍可完整观察（缓冲补发 + 实时），运行终态 succeeded
    const all = await drain(service.subscribeRunEvents(runId)!);
    expect(all.at(-1)?.type).toBe('run_succeeded');
    expect(runs.getRun(runId)?.status).toBe('succeeded');
  });

  it('v0.9 终态运行无缓冲时 subscribeRunEvents 返回 null（交路由落库回放）', async () => {
    const wf = workflows.createWorkflow({ name: '最简' });
    workflows.addVersion(wf.id, graphStartEnd());
    await drain(startManual(wf.id).events);
    // 模拟进程重启：新建 service（新总线无缓冲），终态运行订阅返回 null，在途行恢复
    const second = createFlowRunService({ deps, runtime, workflows, runs });
    const runId = runs.listRunsByWorkflow(wf.id, 1)[0]!.id;
    expect(second.subscribeRunEvents(runId)).toBeNull();
    expect(second.isActive(runId)).toBe(false);
  });

  it('v0.9 启动恢复：上一进程 running 行收敛 interrupted，queued 行自动续跑成功', async () => {
    const done = workflows.createWorkflow({ name: '已完成图' });
    workflows.addVersion(done.id, graphStartEnd());
    // 模拟上一进程残留：一条 queued、一条 running（无 active 执行者）
    const queuedId = runs.createRun({ workflowId: done.id, version: 1, trigger: 'manual' }).id;
    const stuckId = runs.createRun({ workflowId: done.id, version: 1, trigger: 'manual' }).id;
    runs.claimQueued(stuckId);
    expect(runs.getRun(stuckId)?.status).toBe('running');

    // 新服务构造时执行恢复扫描：stuck 收敛 interrupted，queued 重新入队续跑
    const recovered = createFlowRunService({ deps, runtime, workflows, runs });
    // 给 setImmediate 队列链一点时间跑完
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(runs.getRun(stuckId)?.status).toBe('interrupted');
    expect(runs.getRun(stuckId)?.interruptReason).toBe('process_restart');
    expect(runs.getRun(queuedId)?.status).toBe('succeeded');
    expect(recovered.isActive(stuckId)).toBe(false);
  });

});
