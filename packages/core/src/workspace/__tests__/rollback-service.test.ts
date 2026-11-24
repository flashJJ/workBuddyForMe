import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createFileSnapshotRepository,
  createWorkflowRepository,
  createWorkflowRunRepository,
  type SettingsRepository,
} from '@wbfm/database';
import { createFileGuard } from '../file-guard';
import { createRollbackService } from '../rollback-service';
import { createSnapshotService, sha256OfBuffer } from '../snapshot-service';

/** v5.1 M3：按运行回滚的正常、冲突、强制与路径失效 */

const T0 = new Date('2026-11-24T00:00:00.000Z');

function memorySettings(): SettingsRepository {
  const map = new Map<string, unknown>();
  return {
    getJson: (key: string, fallback: unknown) => (map.has(key) ? map.get(key) : fallback),
    setJson: (key: string, value: unknown) => {
      map.set(key, value);
    },
  } as unknown as SettingsRepository;
}

function setup() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-rollback-'));
  const dataRoot = join(tempRoot, 'data');
  const settings = memorySettings();
  const guard = createFileGuard({ dataRoot, settings });
  const db = createDatabase(':memory:');
  const workflows = createWorkflowRepository(db);
  const runs = createWorkflowRunRepository(db);
  const snapshots = createFileSnapshotRepository(db);
  const wf = workflows.createWorkflow({ name: '回滚' });
  const run = runs.createRun({ workflowId: wf.id, version: 1 });
  const snapshotService = createSnapshotService({
    dataRoot,
    guard,
    snapshots,
    settings,
    now: () => new Date(T0),
  });
  const rollback = createRollbackService({
    guard,
    snapshots,
    blobDir: join(dataRoot, 'snapshots', 'blobs'),
  });
  return { tempRoot, dataRoot, guard, db, snapshots, wf, run, snapshotService, rollback };
}

const ctx = (h: ReturnType<typeof setup>) => ({
  runId: h.run.id,
  workflowId: h.wf.id,
  toolName: 'write_file',
});

describe('v5.1 按运行回滚', () => {
  let h: ReturnType<typeof setup>;

  beforeEach(() => {
    h = setup();
  });

  afterEach(() => {
    h.db.close();
    rmSync(h.tempRoot, { recursive: true, force: true });
  });

  it('覆盖写：dry-run 不改文件，正式回滚恢复旧内容', () => {
    const file = join(h.guard.defaultRoot, 'overwrite.txt');
    writeFileSync(file, 'old');
    const snapshot = h.snapshotService.beforeWrite({ ...ctx(h), path: file })!;
    writeFileSync(file, 'new');
    h.snapshotService.afterWrite({
      snapshotId: snapshot.id,
      writtenSha256: sha256OfBuffer(Buffer.from('new')),
    });

    expect(h.rollback.rollback({ runId: h.run.id, dryRun: true })).toMatchObject({
      totals: { restored: 1 },
    });
    expect(readFileSync(file, 'utf8')).toBe('new');

    expect(h.rollback.rollback({ runId: h.run.id, dryRun: false }).totals.restored).toBe(1);
    expect(readFileSync(file, 'utf8')).toBe('old');
  });

  it('新建写：哈希一致时删除；被修改则冲突，force 后删除', () => {
    const file = join(h.guard.defaultRoot, 'created.txt');
    const snapshot = h.snapshotService.beforeWrite({ ...ctx(h), path: file })!;
    writeFileSync(file, 'created');
    h.snapshotService.afterWrite({
      snapshotId: snapshot.id,
      writtenSha256: sha256OfBuffer(Buffer.from('created')),
    });
    writeFileSync(file, 'modified');

    const blocked = h.rollback.rollback({ runId: h.run.id, dryRun: false });
    expect(blocked.entries[0]).toMatchObject({ status: 'conflict', reason: 'new_file_modified' });
    expect(existsSync(file)).toBe(true);

    const forced = h.rollback.rollback({
      runId: h.run.id,
      dryRun: false,
      force: [file],
    });
    expect(forced.entries[0]?.status).toBe('deleted');
    expect(existsSync(file)).toBe(false);
  });

  it('删除文件：回滚恢复内容', () => {
    const file = join(h.guard.defaultRoot, 'deleted.txt');
    writeFileSync(file, 'to-delete');
    h.snapshotService.beforeDelete({ ...ctx(h), path: file });
    unlinkSync(file);

    expect(h.rollback.rollback({ runId: h.run.id, dryRun: false }).totals.restored).toBe(1);
    expect(readFileSync(file, 'utf8')).toBe('to-delete');
  });

  it('移动：恢复源文件并删除本次新增的目标', () => {
    const source = join(h.guard.defaultRoot, 'move-src.txt');
    const target = join(h.guard.defaultRoot, 'move-dst.txt');
    writeFileSync(source, 'move-content');
    const snapshot = h.snapshotService.beforeMove({
      ...ctx(h),
      sourcePath: source,
      targetPath: target,
    })!;
    renameSync(source, target);
    h.snapshotService.afterWrite({
      snapshotId: snapshot.id,
      writtenSha256: sha256OfBuffer(Buffer.from('move-content')),
    });

    expect(h.rollback.rollback({ runId: h.run.id, dryRun: false }).totals.restored).toBe(1);
    expect(readFileSync(source, 'utf8')).toBe('move-content');
    expect(existsSync(target)).toBe(false);
  });

  it('路径不再授权时跳过并报 path_not_allowed', () => {
    const userRoot = join(h.tempRoot, 'projects');
    mkdirSync(userRoot, { recursive: true });
    h.guard.setRoots([userRoot]);
    const file = join(userRoot, 'doc.txt');
    writeFileSync(file, 'doc');
    h.snapshotService.beforeWrite({ ...ctx(h), path: file });
    h.guard.setRoots([]);

    const result = h.rollback.rollback({ runId: h.run.id, dryRun: false });
    expect(result.entries[0]).toMatchObject({ status: 'skipped', reason: 'path_not_allowed' });
  });

  it('多个失败文件不互相阻断', () => {
    const good = join(h.guard.defaultRoot, 'good.txt');
    const bad = join(h.guard.defaultRoot, 'bad.txt');
    for (const file of [good, bad]) {
      writeFileSync(file, 'old');
      h.snapshotService.beforeWrite({ ...ctx(h), path: file });
      writeFileSync(file, 'new');
    }
    // 仅 good 记录写入哈希；bad 未记录 → 冲突，但不影响 good
    const snapshots = h.snapshots.listByRun(h.run.id);
    const goodSnapshot = snapshots.find((item) => item.path === good)!;
    h.snapshotService.afterWrite({
      snapshotId: goodSnapshot.id,
      writtenSha256: sha256OfBuffer(Buffer.from('new')),
    });

    const result = h.rollback.rollback({ runId: h.run.id, dryRun: false });
    expect(result.totals.restored).toBe(1);
    expect(result.totals.conflict).toBe(1);
    expect(readFileSync(good, 'utf8')).toBe('old');
    expect(readFileSync(bad, 'utf8')).toBe('new');
  });
});
