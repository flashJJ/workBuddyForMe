import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../client';
import { createWorkflowRepository } from '../workflow/workflow-repo';
import { createWorkflowRunRepository } from '../workflow/workflow-run-repo';
import { createFlowRunCompensationRepository } from './flow-run-compensation-repo';

function setup() {
  const db = createDatabase(':memory:');
  const workflows = createWorkflowRepository(db);
  const runs = createWorkflowRunRepository(db);
  const compensations = createFlowRunCompensationRepository(db);
  const wf = workflows.createWorkflow({ name: '兜底' });
  return { db, workflows, runs, compensations, wf };
}

describe('v5.0 补偿仓储', () => {
  it('创建/认领/推进/恢复/计数', () => {
    const { runs, compensations, wf } = setup();
    const run = runs.createRun({ workflowId: wf.id, version: 1 });
    const item = compensations.create({
      rootRunId: run.id,
      workflowId: wf.id,
      attempt: 1,
      nextRetryAt: '2026-11-24T00:00:30.000Z',
      lastErrorJson: '{"code":"net"}',
    });
    expect(compensations.getByRootRun(run.id)?.id).toBe(item.id);
    expect(compensations.countsByState()).toEqual({ pending: 1, exhausted: 0 });
    expect(compensations.claim(item.id, 'wrong')).toBe(false);
    expect(compensations.claim(item.id, '2026-11-24T00:00:30.000Z')).toBe(true);

    runs.createRun({ workflowId: wf.id, version: 1, id: 'retry-run' });
    compensations.markRetrying(item.id, 'retry-run');
    expect(compensations.getByLastRun('retry-run')?.state).toBe('retrying');
    expect(compensations.listRetrying().map((row) => row.id)).toEqual([item.id]);

    compensations.markPending(item.id, 2, '2026-11-24T00:02:00.000Z', '{"code":"net2"}');
    expect(compensations.getByRootRun(run.id)).toMatchObject({ attempt: 2, state: 'pending' });
    expect(compensations.listRetrying()).toHaveLength(0);

    compensations.markRecovered(item.id);
    expect(compensations.getByRootRun(run.id)?.state).toBe('recovered');
    expect(compensations.countsByState()).toEqual({ pending: 0, exhausted: 0 });
  });

  it('流程删除级联清理补偿行', () => {
    const { workflows, runs, compensations, wf } = setup();
    const run = runs.createRun({ workflowId: wf.id, version: 1 });
    compensations.create({
      rootRunId: run.id,
      workflowId: wf.id,
      attempt: 1,
      nextRetryAt: '2026-11-24T00:00:30.000Z',
      lastErrorJson: '{}',
    });
    workflows.deleteWorkflow(wf.id);
    expect(compensations.getByRootRun(run.id)).toBeNull();
  });
});

describe('v5.0 运行仓储扩展', () => {
  it('快照读取、批次 id、终态清理与删除', () => {
    const { db, runs, wf } = setup();
    const first = runs.createRun({
      workflowId: wf.id,
      version: 1,
      graphSnapshotJson: '{"nodes":[]}',
      graphHash: 'hash-1',
    });
    expect(runs.getGraphSnapshot(first.id)).toEqual({ graphJson: '{"nodes":[]}', hash: 'hash-1' });
    runs.setReplayBatch(first.id, 'batch-1');
    expect(runs.getRun(first.id)?.replayBatchId).toBe('batch-1');

    const second = runs.createRun({ workflowId: wf.id, version: 1 });
    const third = runs.createRun({ workflowId: wf.id, version: 1 });
    runs.finishRun(second.id, 'succeeded');
    runs.finishRun(third.id, 'failed', { error: { code: 'x', message: 'x' } });
    db.prepare(
      `UPDATE workflow_runs SET created_at = '2020-01-01T00:00:00.000Z',
         finished_at = '2020-01-01T00:00:00.000Z' WHERE id = ?`,
    ).run(second.id);
    db.prepare(
      `UPDATE workflow_runs SET created_at = '2020-01-02T00:00:00.000Z',
         finished_at = '2020-01-02T00:00:00.000Z' WHERE id = ?`,
    ).run(third.id);

    const old = runs.listTerminalBefore('2021-01-01T00:00:00.000Z');
    expect(old.map((run) => run.id).sort()).toEqual([second.id, third.id].sort());

    const beyond = runs.listTerminalBeyondPerWorkflow(wf.id, 1);
    expect(beyond).toHaveLength(1);
    expect(beyond[0]?.id).toBe(second.id);

    expect(runs.deleteRuns([first.id])).toBe(0); // queued 不删
    expect(runs.deleteRuns([second.id, third.id])).toBe(2);
    expect(runs.getRun(second.id)).toBeNull();
  });

  it('listRuns 在 SQL 内按 workflowId 过滤，不受全局 limit 影响', () => {
    const { runs, workflows, wf } = setup();
    const other = workflows.createWorkflow({ name: '另一个流程' });
    for (let i = 0; i < 3; i += 1) {
      runs.createRun({ workflowId: wf.id, version: 1 });
    }
    const target = runs.createRun({ workflowId: other.id, version: 1 });
    const result = runs.listRuns({ workflowId: other.id });
    expect(result.map((run) => run.id)).toEqual([target.id]);
  });
});
