import { describe, expect, it, vi } from 'vitest';
import { createDatabase } from '@wbfm/database';
import {
  createWorkflowRepository,
  createWorkflowRunRepository,
} from '@wbfm/database';
import type { FlowGraph } from '@wbfm/shared/schemas';
import { createFlowRunReplayService } from '../run-replay-service';

const graph = {
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 } },
    { id: 'end', type: 'end', position: { x: 1, y: 1 } },
  ],
  edges: [{ id: 'e1', source: 'start', target: 'end' }],
} as FlowGraph;

function setup() {
  const db = createDatabase(':memory:');
  const workflows = createWorkflowRepository(db);
  const runs = createWorkflowRunRepository(db);
  const wf = workflows.createWorkflow({ name: '重放' });
  const flowRunner = { createRunFromGraph: vi.fn(() => 'new-run') };
  const service = createFlowRunReplayService({ runs, workflows, flowRunner });
  return { db, workflows, runs, flowRunner, service, wf };
}

function failedRun(runs: ReturnType<typeof createWorkflowRunRepository>, wfId: string) {
  const run = runs.createRun({
    workflowId: wfId,
    version: 2,
    trigger: 'schedule',
    graphSnapshotJson: JSON.stringify(graph),
    graphHash: 'hash',
  });
  runs.finishRun(run.id, 'failed', { error: { code: 'network', message: 'ECONNRESET' } });
  return runs.getRun(run.id)!;
}

describe('v5.0 单条/批量重放', () => {
  it('snapshot 模式按快照固定图与版本，记录 parentRunId', () => {
    const { runs, flowRunner, service, wf } = setup();
    const parent = failedRun(runs, wf.id);
    const out = service.replayOne({ runId: parent.id, mode: 'snapshot', nodeMode: 'whole' });
    expect(out).toEqual({ runId: 'new-run', parentRunId: parent.id });
    expect(flowRunner.createRunFromGraph).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: wf.id,
        version: 2,
        parentRunId: parent.id,
        resumedFromNode: null,
        graph: expect.objectContaining({ nodes: expect.any(Array) }),
      }),
    );
  });

  it('failed_node 模式定位最近失败节点', () => {
    const { runs, flowRunner, service, wf } = setup();
    const parent = failedRun(runs, wf.id);
    runs.addNodeExecution(parent.id, 'end');
    const nodes = runs.listNodeExecutions(parent.id);
    const last = nodes[nodes.length - 1];
    if (last) runs.finishNodeExecution(last.id, 'failed', { error: 'boom' });

    service.replayOne({ runId: parent.id, mode: 'snapshot', nodeMode: 'failed_node' });
    expect(flowRunner.createRunFromGraph).toHaveBeenCalledWith(
      expect.objectContaining({ resumedFromNode: 'end' }),
    );
  });

  it('latest 模式节点不存在时拒绝；批量部分失败不阻断', () => {
    const { runs, workflows, service } = setup();
    const latestWf = workflows.createWorkflow({ name: '有生产版本' });
    workflows.addVersion(latestWf.id, graph);
    workflows.publishVersion(latestWf.id);
    const parent = failedRun(runs, latestWf.id);
    const v = workflows.createWorkflow({ name: 'no-version' });
    const noSnapshot = runs.createRun({ workflowId: v.id, version: 1, trigger: 'schedule' });
    runs.finishRun(noSnapshot.id, 'failed', { error: { code: 'network', message: 'x' } });

    expect(() =>
      service.replayOne({ runId: parent.id, mode: 'latest', nodeId: 'missing' }),
    ).toThrow(/flow\/replay-node-missing/);

    const result = service.replayBatch({
      runIds: [parent.id, noSnapshot.id, parent.id],
      mode: 'snapshot',
      nodeMode: 'whole',
    });
    expect(result.results).toHaveLength(2); // 去重
    expect(result.summary.started).toBe(1);
    expect(result.summary.failed).toBe(1);
  });

  it('批量超过 20 条拒绝', () => {
    const { service } = setup();
    const runIds = Array.from({ length: 21 }, (_, i) => `r${i}`);
    expect(() => service.replayBatch({ runIds })).toThrow(/flow\/batch-limit-exceeded/);
  });
});
