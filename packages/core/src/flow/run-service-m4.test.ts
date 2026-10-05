import type { FlowGraph, FlowUnattendedPolicy } from '@wbfm/shared';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import {
  createWorkflowEndpointRepository,
  createWorkflowRepository,
  createWorkflowRunRepository,
} from '@wbfm/database';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SecretCipher } from '../secrets/cipher';
import { createPermissionService } from '../services/permission-service';
import { createTaskGrantRegistry } from '../services/task-grants';
import type { ServiceDeps } from '../services/deps';
import { createToolRuntime, type ToolRuntime } from '../tools/tool-runtime';
import type { Tool } from '../tools/types';
import { createFlowRunService, type FlowRunService } from './run-service';

function graphDangerTool(toolName: string): FlowGraph {
  return {
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
      { id: 't1', type: 'tool', position: { x: 200, y: 0 }, config: { toolName, args: {} } },
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

function graphStartEnd(output: string): FlowGraph {
  return {
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, config: {} },
      { id: 'end', type: 'end', position: { x: 100, y: 0 }, config: { output } },
    ],
    edges: [{ id: 'e1', source: 'start', target: 'end' }],
  };
}

async function drain(gen: AsyncGenerator): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

describe('v0.9 M4 无人值守策略门控（api/mcp 触发）', () => {
  let db: DatabaseInstance;
  let workflows: ReturnType<typeof createWorkflowRepository>;
  let runs: ReturnType<typeof createWorkflowRunRepository>;
  let deps: ServiceDeps;
  const dangerTool: Tool = {
    name: 'danger_tool',
    description: '危险工具',
    parameters: { type: 'object' },
    permission: 'danger',
    async run() {
      return { ok: true, output: 'X', summary: '已执行' };
    },
  };
  const runtime = {
    resolveTool: (name: string) =>
      name === 'danger_tool' ? { tool: dangerTool, source: 'builtin' } : null,
  } as unknown as ToolRuntime;

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
  });

  function serviceWithEndpoint(policy: FlowUnattendedPolicy, toolName = 'danger_tool') {
    const endpointRepo = createWorkflowEndpointRepository(db);
    const wf = workflows.createWorkflow({ name: '公开流' });
    workflows.addVersion(wf.id, graphDangerTool(toolName));
    workflows.publishVersion(wf.id);
    const endpointId = endpointRepo.create({
      workflowId: wf.id,
      keyHash: 'h1',
      keyPrefix: 'wfk_11111111',
      httpEnabled: true,
    }).id;
    endpointRepo.updateConfig(endpointId, {
      httpEnabled: true,
      mcpEnabled: false,
      syncTimeoutMs: 60_000,
      rateLimitPerMin: 30,
      policy,
    });
    const svc = createFlowRunService({ deps, runtime, workflows, runs, endpoints: endpointRepo });
    return { svc, wfId: wf.id, endpointId };
  }

  async function runApi(svc: FlowRunService, wfId: string, endpointId: string, trigger: 'api' | 'mcp' = 'api') {
    const runId = svc.createRun({ workflowId: wfId, trigger, endpointId });
    await drain(svc.subscribeRunEvents(runId)!);
    return runId;
  }

  it('deny_all：danger 工具节点被策略拒绝（ok:false + policy_deny 审计文本），运行仍成功收尾', async () => {
    const { svc, wfId, endpointId } = serviceWithEndpoint({ mode: 'deny_all' });
    const runId = await runApi(svc, wfId, endpointId);
    const node = runs.listNodeExecutions(runId).find((n) => n.nodeId === 't1');
    expect(node?.status).toBe('succeeded'); // 拒绝不中断流程：节点正常产出 ok:false
    expect(JSON.stringify(node?.outputs)).toContain('[policy_deny:not_allowlisted]');
    expect(runs.getRun(runId)?.status).toBe('succeeded');
  });

  it('allowlist 命中：工具真正执行', async () => {
    const { svc, wfId, endpointId } = serviceWithEndpoint({
      mode: 'allowlist',
      allowed: ['danger_tool'],
    });
    const runId = await runApi(svc, wfId, endpointId);
    expect(runs.getRun(runId)?.output).toBe('已执行');
  });

  it('桌面控制类工具即使在白名单也永久拒绝（mcp 触发）', async () => {
    const desktopTool: Tool = {
      name: 'mouse_click',
      description: '点击',
      parameters: { type: 'object' },
      permission: 'danger',
      async run() {
        return { ok: true, output: 'clicked', summary: '已点击' };
      },
    };
    const desktopRuntime = {
      resolveTool: (name: string) =>
        name === 'mouse_click' ? { tool: desktopTool, source: 'builtin' } : null,
    } as unknown as ToolRuntime;
    const endpointRepo = createWorkflowEndpointRepository(db);
    const wf = workflows.createWorkflow({ name: '桌面流' });
    workflows.addVersion(wf.id, graphDangerTool('mouse_click'));
    workflows.publishVersion(wf.id);
    const endpointId = endpointRepo.create({
      workflowId: wf.id,
      keyHash: 'h2',
      keyPrefix: 'wfk_22222222',
      mcpEnabled: true,
    }).id;
    endpointRepo.updateConfig(endpointId, {
      httpEnabled: false,
      mcpEnabled: true,
      syncTimeoutMs: 60_000,
      rateLimitPerMin: 30,
      policy: { mode: 'allowlist', allowed: ['mouse_click'] },
    });
    const svc = createFlowRunService({
      deps,
      runtime: desktopRuntime,
      workflows,
      runs,
      endpoints: endpointRepo,
    });

    const runId = await runApi(svc, wf.id, endpointId, 'mcp');
    const output = JSON.stringify(
      runs.listNodeExecutions(runId).find((n) => n.nodeId === 't1')?.outputs,
    );
    expect(output).toContain('[policy_deny:desktop_control_banned]');
  });
});

describe('v0.9 M4 重放（祖先闭包）', () => {
  it('整体重跑：新 run 记录 parentRunId 关联；节点重放携带 resumedFromNode', async () => {
    const db = createDatabase(':memory:');
    const workflows = createWorkflowRepository(db);
    const runs = createWorkflowRunRepository(db);
    const deps: ServiceDeps = {
      db,
      cipher: {} as SecretCipher,
      permissions: createPermissionService({ db, cipher: {} as SecretCipher }),
      taskGrants: createTaskGrantRegistry(),
    };
    const wf = workflows.createWorkflow({ name: '重放流' });
    workflows.addVersion(wf.id, graphStartEnd('RERUN'));
    workflows.publishVersion(wf.id);
    const original = runs.createRun({ workflowId: wf.id, version: 1, trigger: 'manual' });
    const svc = createFlowRunService({ deps, runtime: {} as ToolRuntime, workflows, runs });
    const newRunId = svc.createRun({
      workflowId: wf.id,
      trigger: 'manual',
      replay: { parentRunId: original.id, resumedFromNode: 'end' },
    });
    await drain(svc.subscribeRunEvents(newRunId)!);
    const run = runs.getRun(newRunId);
    expect(run?.status).toBe('succeeded');
    expect(run?.output).toBe('RERUN');
    expect(run?.parentRunId).toBe(original.id);
    expect(run?.resumedFromNode).toBe('end');
  });
});
