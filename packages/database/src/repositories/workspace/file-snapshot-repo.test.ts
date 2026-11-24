import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../client';
import { createFileSnapshotRepository } from './file-snapshot-repo';
import { createWorkflowRepository } from '../workflow/workflow-repo';
import { createWorkflowRunRepository } from '../workflow/workflow-run-repo';

/** v5.1 M2：文件快照仓储的排序、过滤、配额统计、清理与级联 */

function setup() {
  const db = createDatabase(':memory:');
  const workflows = createWorkflowRepository(db);
  const runs = createWorkflowRunRepository(db);
  const snapshots = createFileSnapshotRepository(db);
  const wf = workflows.createWorkflow({ name: '快照' });
  const run = runs.createRun({ workflowId: wf.id, version: 1 });
  return { db, workflows, runs, snapshots, wf, run };
}

describe('v5.1 文件快照仓储', () => {
  it('按运行/节点过滤并按时间倒序', () => {
    const { snapshots, run, wf } = setup();
    snapshots.createSnapshot({
      runId: run.id,
      workflowId: wf.id,
      toolName: 'write_file',
      action: 'write_overwrite',
      path: 'D:/workspace/a.txt',
      existedBefore: true,
      byteSize: 10,
      sha256: 'a'.repeat(64),
      createdAt: '2026-11-24T00:00:01.000Z',
    });
    snapshots.createSnapshot({
      runId: run.id,
      workflowId: wf.id,
      nodeId: 'node-2',
      toolName: 'write_file',
      action: 'write_new',
      path: 'D:/workspace/b.txt',
      existedBefore: false,
      createdAt: '2026-11-24T00:00:02.000Z',
    });
    snapshots.createSnapshot({
      runId: run.id,
      workflowId: wf.id,
      toolName: 'delete_file',
      action: 'delete',
      path: 'D:/workspace/c.txt',
      existedBefore: true,
      byteSize: 5,
      sha256: 'b'.repeat(64),
      createdAt: '2026-11-24T00:00:03.000Z',
    });

    expect(snapshots.listByRun(run.id).map((item) => item.path)).toEqual([
      'D:/workspace/c.txt',
      'D:/workspace/b.txt',
      'D:/workspace/a.txt',
    ]);
    expect(snapshots.listByRun(run.id, { nodeId: 'node-2' }).map((item) => item.path)).toEqual([
      'D:/workspace/b.txt',
    ]);
    expect(snapshots.getUsage()).toEqual({ count: 3, bytes: 15 });
  });

  it('deleteBefore 按截止时间批删并返回待回收 blob', () => {
    const { snapshots, run, wf } = setup();
    const old = snapshots.createSnapshot({
      runId: run.id,
      workflowId: wf.id,
      toolName: 'write_file',
      action: 'write_overwrite',
      path: 'D:/workspace/old.txt',
      existedBefore: true,
      byteSize: 100,
      sha256: 'c'.repeat(64),
      blobPath: 'cc/cc.bin',
      createdAt: '2026-10-01T00:00:00.000Z',
    });
    snapshots.createSnapshot({
      runId: run.id,
      workflowId: wf.id,
      toolName: 'write_file',
      action: 'write_overwrite',
      path: 'D:/workspace/new.txt',
      existedBefore: true,
      byteSize: 50,
      blobPath: 'cc/cc.bin',
      createdAt: '2026-11-20T00:00:00.000Z',
    });

    const removed = snapshots.deleteBefore('2026-11-01T00:00:00.000Z', 10);
    expect(removed).toEqual({ removed: 1, freedBytes: 100, blobPaths: ['cc/cc.bin'] });
    expect(snapshots.listByRun(run.id).map((item) => item.id)).not.toContain(old.id);
    expect(snapshots.deleteBefore('2026-11-01T00:00:00.000Z', 10).removed).toBe(0);
  });

  it('deleteByRun 返回去重后的 blob，引用表随之收敛', () => {
    const { snapshots, run, wf } = setup();
    for (const path of ['a.txt', 'b.txt']) {
      snapshots.createSnapshot({
        runId: run.id,
        workflowId: wf.id,
        toolName: 'write_file',
        action: 'write_overwrite',
        path: `D:/workspace/${path}`,
        existedBefore: true,
        byteSize: 10,
        blobPath: 'dd/dd.bin',
      });
    }
    expect(snapshots.listReferencedBlobs()).toEqual(['dd/dd.bin']);
    expect(snapshots.deleteByRun(run.id)).toMatchObject({ removed: 2, freedBytes: 20 });
    expect(snapshots.listReferencedBlobs()).toEqual([]);
    expect(snapshots.listByRun(run.id)).toEqual([]);
  });

  it('运行删除级联清理快照', () => {
    const { db, snapshots, run, wf } = setup();
    snapshots.createSnapshot({
      runId: run.id,
      workflowId: wf.id,
      toolName: 'write_file',
      action: 'write_new',
      path: 'D:/workspace/new.txt',
      existedBefore: false,
    });
    db.prepare('DELETE FROM workflow_runs WHERE id = ?').run(run.id);
    expect(snapshots.listByRun(run.id)).toEqual([]);
  });

  it('按运行查询走 run_id 索引，不做全表扫描', () => {
    const { db } = setup();
    const plan = db
      .prepare(
        `EXPLAIN QUERY PLAN SELECT * FROM file_snapshots
         WHERE run_id = ? ORDER BY created_at DESC`,
      )
      .all('run-x') as Array<{ detail: string }>;
    const detail = plan.map((row) => row.detail).join(' ');
    expect(detail).toContain('idx_file_snapshots_run');
    expect(detail).not.toMatch(/SCAN file_snapshots(?! USING)/);
  });

  it('listExpired 预览与 setWrittenSha256 更新', () => {
    const { snapshots, run, wf } = setup();
    const old = snapshots.createSnapshot({
      runId: run.id,
      workflowId: wf.id,
      toolName: 'write_file',
      action: 'write_new',
      path: 'D:/workspace/a.txt',
      existedBefore: false,
      createdAt: '2026-10-01T00:00:00.000Z',
    });
    snapshots.setWrittenSha256(old.id, 'e'.repeat(64));
    expect(snapshots.listByRun(run.id)[0]?.sha256).toBeNull();
    expect(
      (snapshots.listExpired('2026-11-01T00:00:00.000Z', 10)).map((item) => item.id),
    ).toEqual([old.id]);
  });
});
