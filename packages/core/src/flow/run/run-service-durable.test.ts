import { createDatabase, createWorkflowRepository, createWorkflowRunRepository, type DatabaseInstance } from '@wbfm/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SecretCipher } from '../../secrets/cipher';
import { createPermissionService } from '../../services/permission/permission-service';
import { createTaskGrantRegistry } from '../../services/task/task-grants';
import type { ToolRuntime } from '../../tools/tool-runtime';
import type { Tool } from '../../tools/types';
import type { ServiceDeps } from '../../services/base/deps';
import { createFlowRunService } from './run-service';
import { drain, graphDangerTool } from './run-service.helpers';

describe('FlowRunService v4.23 持久化执行', () => {
  let db: DatabaseInstance;
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
      resolveTool: (name: string) => (name === 'danger_tool' ? { tool: dangerTool, source: 'builtin' } : null),
    } as unknown as ToolRuntime;
    // 让启动恢复扫描在无旧服务的干净进程内执行
    createFlowRunService({ deps, runtime, workflows, runs });
  });

  it('写工具在途的运行保持 interrupted', () => {
    const wf = workflows.createWorkflow({ name: '危险图' });
    workflows.addVersion(wf.id, graphDangerTool());
    const runId = runs.createRun({ workflowId: wf.id, version: 1, trigger: 'manual' }).id;
    runs.claimQueued(runId);
    runs.addNodeExecution(runId, 'start', {});
    runs.addNodeExecution(runId, 't1', { toolName: 'danger_tool' });

    const recovered = createFlowRunService({ deps, runtime, workflows, runs });

    expect(runs.getRun(runId)?.status).toBe('interrupted');
    expect(runs.getRun(runId)?.interruptReason).toBe('process_restart');
    expect(recovered.isActive(runId)).toBe(false);
  });

  it('续跑：已成功节点复用输出，只执行剩余节点', async () => {
    const readTool: Tool = {
      name: 'read_tool',
      description: '只读工具',
      parameters: { type: 'object' },
      permission: 'read',
      async run() {
        return { ok: true, output: 'X', summary: 'ok' };
      },
    };
    const resolveSpy = vi.fn((name: string) =>
      name === 'read_tool' ? { tool: readTool, source: 'builtin' as const } : null,
    );
    const runtimeWithRead = { resolveTool: resolveSpy } as unknown as ToolRuntime;
    const wf = workflows.createWorkflow({ name: '续跑图' });
    workflows.addVersion(wf.id, {
      nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
        { id: 't1', type: 'tool', position: { x: 200, y: 0 }, config: { toolName: 'read_tool' } },
        {
          id: 'end',
          type: 'end',
          position: { x: 400, y: 0 },
          config: { output: '{{$nodes.t1.outputs.output}}' },
        },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 't1' },
        { id: 'e2', source: 't1', target: 'end' },
      ],
    });
    const runId = runs.createRun({ workflowId: wf.id, version: 1, trigger: 'manual' }).id;
    runs.claimQueued(runId);
    const startExec = runs.addNodeExecution(runId, 'start', {});
    runs.finishNodeExecution(startExec.id, 'succeeded', { outputs: {} });
    const toolExec = runs.addNodeExecution(runId, 't1', { toolName: 'read_tool' });
    runs.finishNodeExecution(toolExec.id, 'succeeded', { outputs: { output: 'X', summary: 'ok' } });

    const recovered = createFlowRunService({ deps, runtime: runtimeWithRead, workflows, runs });
    const all = await drain(recovered.subscribeRunEvents(runId)!);

    expect(all.find((e) => e.type === 'run_started')).toMatchObject({ resumed: true });
    expect(all.at(-1)?.type).toBe('run_succeeded');
    expect(all.at(-1)).toMatchObject({ output: 'X' });
    const started = all
      .filter((e) => e.type === 'node_started')
      .map((e) => (e as { nodeId: string }).nodeId);
    expect(started).not.toContain('t1');
    expect(started).toContain('end');
    // t1 只有原来那一行，没有重复执行
    expect(runs.listNodeExecutions(runId).filter((n) => n.nodeId === 't1')).toHaveLength(1);
    expect(runs.getRun(runId)?.status).toBe('succeeded');
  });
});
