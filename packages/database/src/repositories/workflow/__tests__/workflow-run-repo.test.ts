import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../../client';
import { createWorkflowRepository } from '../workflow-repo';
import { createWorkflowRunRepository } from '../workflow-run-repo';

/**
 * v5.0.1 回归：运行列表筛选必须下推 SQL，且清理查询按 finished_at 判定。
 * 同时锁定列表/清理投影不读取 graph_snapshot_json。
 */

function setup() {
  const db = createDatabase(':memory:');
  const workflows = createWorkflowRepository(db);
  const runs = createWorkflowRunRepository(db);
  const a = workflows.createWorkflow({ name: 'A' });
  const b = workflows.createWorkflow({ name: 'B' });
  return { db, workflows, runs, a, b };
}

function setCreatedAt(db: ReturnType<typeof createDatabase>, id: string, iso: string): void {
  db.prepare('UPDATE workflow_runs SET created_at = ? WHERE id = ?').run(iso, id);
}

describe('v5.0.1 运行列表与清理查询', () => {
  it('workflowId 下推 SQL：小 limit 不被其他流程的运行挤掉', () => {
    const { db, runs, a, b } = setup();
    const a1 = runs.createRun({ workflowId: a.id, version: 1 }).id;
    const a2 = runs.createRun({ workflowId: a.id, version: 1 }).id;
    const b1 = runs.createRun({ workflowId: b.id, version: 1 }).id;
    const b2 = runs.createRun({ workflowId: b.id, version: 1 }).id;
    const b3 = runs.createRun({ workflowId: b.id, version: 1 }).id;
    setCreatedAt(db, a1, '2026-11-24T00:00:01.000Z');
    setCreatedAt(db, a2, '2026-11-24T00:00:02.000Z');
    setCreatedAt(db, b1, '2026-11-24T00:00:05.000Z');
    setCreatedAt(db, b2, '2026-11-24T00:00:06.000Z');
    setCreatedAt(db, b3, '2026-11-24T00:00:07.000Z');

    const rows = runs.listRuns({ workflowId: a.id, limit: 2 });
    expect(rows.map((row) => row.id)).toEqual([a2, a1]);
  });

  it('workflowId 与 trigger/status 组合过滤', () => {
    const { runs, a, b } = setup();
    const aSchedule = runs.createRun({ workflowId: a.id, version: 1, trigger: 'schedule' }).id;
    const aApi = runs.createRun({ workflowId: a.id, version: 1, trigger: 'api' }).id;
    runs.finishRun(aApi, 'succeeded');
    runs.createRun({ workflowId: b.id, version: 1, trigger: 'schedule' });

    expect(runs.listRuns({ workflowId: a.id, trigger: 'schedule' }).map((r) => r.id)).toEqual([
      aSchedule,
    ]);
    expect(runs.listRuns({ workflowId: a.id, status: 'queued' }).map((r) => r.id)).toEqual([
      aSchedule,
    ]);
    expect(
      runs.listRuns({ workflowId: a.id, trigger: 'api', status: 'succeeded' }).map((r) => r.id),
    ).toEqual([aApi]);
  });

  it('列表返回 graphHash 但不读取 graph_snapshot_json', () => {
    const { runs, a } = setup();
    const id = runs.createRun({
      workflowId: a.id,
      version: 1,
      graphSnapshotJson: '{"nodes":[]}',
      graphHash: 'hash-1',
    }).id;

    const [row] = runs.listRuns({ workflowId: a.id, limit: 1 });
    expect(row?.graphHash).toBe('hash-1');
    expect(row && 'graphSnapshotJson' in row).toBe(false);
    expect(runs.getGraphSnapshot(id)?.graphJson).toBe('{"nodes":[]}');
  });

  it('listTerminalBefore 按 finished_at 判定，缺失时回退 created_at', () => {
    const { db, runs, a } = setup();
    const recentFinish = runs.createRun({ workflowId: a.id, version: 1 }).id;
    runs.finishRun(recentFinish, 'succeeded');
    db.prepare(
      "UPDATE workflow_runs SET created_at = '2025-01-01T00:00:00.000Z', finished_at = '2026-11-20T00:00:00.000Z' WHERE id = ?",
    ).run(recentFinish);

    const missingFinish = runs.createRun({ workflowId: a.id, version: 1 }).id;
    runs.finishRun(missingFinish, 'failed', { error: { code: 'x', message: 'x' } });
    db.prepare(
      "UPDATE workflow_runs SET created_at = '2025-01-01T00:00:00.000Z', finished_at = NULL WHERE id = ?",
    ).run(missingFinish);

    const active = runs.createRun({ workflowId: a.id, version: 1 }).id;
    setCreatedAt(db, active, '2025-01-01T00:00:00.000Z');

    const rows = runs.listTerminalBefore('2026-11-01T00:00:00.000Z');
    expect(rows.map((row) => row.id)).toEqual([missingFinish]);
  });

  it('listTerminalBeyondPerWorkflow 只返回超出保留数的最旧终态', () => {
    const { db, runs, a } = setup();
    const ids = ['01', '02', '03', '04'].map((suffix, index) => {
      const run = runs.createRun({ workflowId: a.id, version: 1 });
      runs.finishRun(run.id, 'succeeded');
      db.prepare('UPDATE workflow_runs SET finished_at = ? WHERE id = ?').run(
        `2026-11-24T00:00:0${index + 1}.000Z`,
        run.id,
      );
      return { id: run.id, suffix };
    });

    const beyond = runs.listTerminalBeyondPerWorkflow(a.id, 2);
    expect(beyond.map((row) => row.id)).toEqual([ids[1]!.id, ids[0]!.id]);
  });
});
