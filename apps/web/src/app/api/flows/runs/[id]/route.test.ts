import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createWorkflowRepository,
  createWorkflowRunRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import type { FlowGraph } from '@wbfm/shared/schemas';
import type { FlowRunVersionCheck } from '@wbfm/shared/types';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { GET } from './route';

/**
 * v5.0.1 回归：运行详情里的失败节点必须取「最后一个 failed」。
 * 构造两个失败节点，并让当前生产图只与其中一个不同：
 * - 只删最后一个 → node_removed / 禁止从失败节点续跑；
 * - 只删第一个 → version_changed / 仍可从最后失败节点续跑。
 * 若实现回退成取第一个失败节点，两条断言都会翻转。
 */

const graph = (withA: boolean, withB: boolean): FlowGraph => {
  const nodes = [
    { id: 'start', type: 'start' as const, position: { x: 0, y: 0 }, config: {} },
    ...(withA ? [{ id: 'a', type: 'llm' as const, position: { x: 100, y: 0 }, config: {} }] : []),
    ...(withB ? [{ id: 'b', type: 'llm' as const, position: { x: 200, y: 0 }, config: {} }] : []),
    { id: 'end', type: 'end' as const, position: { x: 300, y: 0 }, config: {} },
  ];
  const chain = nodes.map((node) => node.id);
  return {
    nodes,
    edges: chain.slice(1).map((target, index) => ({
      id: `e${index + 1}`,
      source: chain[index]!,
      target,
    })),
  };
};

describe('GET /api/flows/runs/[id] 失败节点选择', () => {
  let db: DatabaseInstance;
  let workflows: ReturnType<typeof createWorkflowRepository>;
  let runs: ReturnType<typeof createWorkflowRunRepository>;
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wbfm-run-detail-'));
    setDataRootForTest(root);
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());
    workflows = createWorkflowRepository(db);
    runs = createWorkflowRunRepository(db);
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
    rmSync(root, { recursive: true, force: true });
  });

  function seed(current: FlowGraph): string {
    const wf = workflows.createWorkflow({ name: '运行详情' });
    const snapshot = graph(true, true);
    workflows.addVersion(wf.id, snapshot);
    workflows.addVersion(wf.id, current);
    workflows.setProductionVersion(wf.id, 2);

    const run = runs.createRun({
      workflowId: wf.id,
      version: 1,
      graphSnapshotJson: JSON.stringify(snapshot),
      graphHash: 'hash-v1',
    });
    for (const nodeId of ['a', 'b']) {
      const execution = runs.addNodeExecution(run.id, nodeId);
      runs.finishNodeExecution(execution.id, 'failed', { error: `${nodeId} failed` });
    }
    runs.finishRun(run.id, 'failed', { error: { code: 'flow/node-failed', message: 'boom' } });
    return run.id;
  }

  async function versionCheck(runId: string): Promise<FlowRunVersionCheck> {
    const response = await GET(new Request(`http://x/api/flows/runs/${runId}`), {
      params: Promise.resolve({ id: runId }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { versionCheck: FlowRunVersionCheck } };
    return body.data.versionCheck;
  }

  it('最后一个失败节点被删：判定 node_removed 且禁止节点续跑', async () => {
    const runId = seed(graph(true, false));
    const check = await versionCheck(runId);
    expect(check.removedNodeIds).toEqual(['b']);
    expect(check.reason).toBe('node_removed');
    expect(check.canResumeFromFailedNode).toBe(false);
  });

  it('第一个失败节点被删、最后一个仍在：仍可从最后失败节点续跑', async () => {
    const runId = seed(graph(false, true));
    const check = await versionCheck(runId);
    expect(check.removedNodeIds).toEqual(['a']);
    expect(check.reason).toBe('version_changed');
    expect(check.canResumeFromFailedNode).toBe(true);
  });
});
