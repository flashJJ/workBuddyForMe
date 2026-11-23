import type { FlowGraph } from '@wbfm/shared/schemas';
import {
  createDatabase,
  createWorkflowRepository,
  createWorkflowRunRepository,
} from '@wbfm/database';
import { describe, expect, it } from 'vitest';
import type { SecretCipher } from '../../secrets/cipher';
import type { ServiceDeps } from '../../services/base/deps';
import { createTaskGrantRegistry } from '../../services/task/task-grants';
import type { ToolRuntime } from '../../tools/tool-runtime';
import type { Tool } from '../../tools/types';
import { createFlowRunService } from '../run/run-service';

function graphTool(toolName: string): FlowGraph {
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

/** 构造把全局权限放到最宽的场景：修复前 schedule 会直接执行写工具 */
function setup(permission: 'read' | 'write') {
  const db = createDatabase(':memory:');
  const workflows = createWorkflowRepository(db);
  const runs = createWorkflowRunRepository(db);
  const tool: Tool = {
    name: 'demo_tool',
    description: '演示工具',
    parameters: { type: 'object' },
    permission,
    async run() {
      return { ok: true, output: 'EXECUTED', summary: '已执行' };
    },
  };
  const runtime = {
    resolveTool: (name: string) =>
      name === 'demo_tool' ? { tool, source: 'builtin' } : null,
  } as unknown as ToolRuntime;
  // 全局权限全部允许：验证 schedule 仍被无人值守门拦截
  const deps = {
    db,
    cipher: {} as SecretCipher,
    permissions: { isAllowed: () => true },
    taskGrants: createTaskGrantRegistry(),
  } as unknown as ServiceDeps;
  const wf = workflows.createWorkflow({ name: '定时流' });
  workflows.addVersion(wf.id, graphTool('demo_tool'));
  workflows.publishVersion(wf.id);
  const svc = createFlowRunService({ deps, runtime, workflows, runs });
  return { svc, runs, wfId: wf.id };
}

async function drain(gen: AsyncGenerator): Promise<void> {
  for await (const _event of gen) void _event;
}

describe('v4.24 定时触发（schedule）接入无人值守门控', () => {
  it('写工具：即使全局权限允许也被 deny_all 拒绝，流程仍成功收尾', async () => {
    const { svc, runs, wfId } = setup('write');
    const runId = svc.createRun({ workflowId: wfId, trigger: 'schedule' });
    await drain(svc.subscribeRunEvents(runId)!);
    const node = runs.listNodeExecutions(runId).find((n) => n.nodeId === 't1');
    expect(node?.status).toBe('succeeded');
    expect(JSON.stringify(node?.outputs)).toContain('[policy_deny:not_allowlisted]');
    expect(runs.getRun(runId)?.status).toBe('succeeded');
  });

  it('只读工具：正常执行', async () => {
    const { svc, runs, wfId } = setup('read');
    const runId = svc.createRun({ workflowId: wfId, trigger: 'schedule' });
    await drain(svc.subscribeRunEvents(runId)!);
    expect(runs.getRun(runId)?.output).toBe('已执行');
  });
});
