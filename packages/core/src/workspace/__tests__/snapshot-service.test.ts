import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
import { createSnapshotService, sha256OfBuffer } from '../snapshot-service';

/** v5.1 M3：快照生成、超大/配额策略、清理 */

const T0 = new Date('2026-11-24T00:00:00.000Z');

function memorySettings(initial: Record<string, unknown> = {}): SettingsRepository {
  const map = new Map<string, unknown>(Object.entries(initial));
  return {
    getJson: (key: string, fallback: unknown) => (map.has(key) ? map.get(key) : fallback),
    setJson: (key: string, value: unknown) => {
      map.set(key, value);
    },
  } as unknown as SettingsRepository;
}

function setup(settingsInit: Record<string, unknown> = {}) {
  const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-snapshot-'));
  const dataRoot = join(tempRoot, 'data');
  const settings = memorySettings(settingsInit);
  const guard = createFileGuard({ dataRoot, settings });
  const db = createDatabase(':memory:');
  const workflows = createWorkflowRepository(db);
  const runs = createWorkflowRunRepository(db);
  const snapshots = createFileSnapshotRepository(db);
  const wf = workflows.createWorkflow({ name: '快照' });
  const run = runs.createRun({ workflowId: wf.id, version: 1 });
  const service = createSnapshotService({
    dataRoot,
    guard,
    snapshots,
    settings,
    now: () => new Date(T0),
  });
  return { tempRoot, dataRoot, guard, db, snapshots, wf, run, service };
}

const ctx = (h: ReturnType<typeof setup>) => ({
  runId: h.run.id,
  workflowId: h.wf.id,
  toolName: 'write_file',
});

describe('v5.1 快照服务', () => {
  let h: ReturnType<typeof setup>;

  beforeEach(() => {
    h = setup();
  });

  afterEach(() => {
    h.db.close();
    rmSync(h.tempRoot, { recursive: true, force: true });
  });

  it('覆盖写抓取旧内容并按 sha256 内容寻址', () => {
    const file = join(h.guard.defaultRoot, 'a.txt');
    writeFileSync(file, 'old-content');
    const snapshot = h.service.beforeWrite({ ...ctx(h), path: file })!;
    expect(snapshot).toMatchObject({ action: 'write_overwrite', existedBefore: true });
    const blob = readFileSync(join(h.dataRoot, 'snapshots', 'blobs', snapshot.sha256!));
    expect(blob.toString('utf8')).toBe('old-content');
    expect(snapshot.sha256).toBe(sha256OfBuffer(Buffer.from('old-content')));

    h.service.afterWrite({ snapshotId: snapshot.id, writtenSha256: 'f'.repeat(64) });
    const row = h.db
      .prepare('SELECT written_sha256 FROM file_snapshots WHERE id = ?')
      .get(snapshot.id) as { written_sha256: string };
    expect(row.written_sha256).toBe('f'.repeat(64));
  });

  it('新建写只记元数据，回滚时可删除', () => {
    const file = join(h.guard.defaultRoot, 'new.txt');
    const snapshot = h.service.beforeWrite({ ...ctx(h), path: file })!;
    expect(snapshot).toMatchObject({ action: 'write_new', existedBefore: false, sha256: null });
  });

  it('删除与移动都抓取源内容；移动记录目标是否已存在', () => {
    const source = join(h.guard.defaultRoot, 'move-src.txt');
    const target = join(h.guard.defaultRoot, 'move-dst.txt');
    writeFileSync(source, 'move-me');
    writeFileSync(target, 'existing-target');

    const moved = h.service.beforeMove({ ...ctx(h), sourcePath: source, targetPath: target })!;
    expect(moved).toMatchObject({
      action: 'move',
      path: source,
      targetPath: target,
      existedBefore: true,
    });

    const deleted = h.service.beforeDelete({ ...ctx(h), path: source })!;
    expect(deleted.action).toBe('delete');
    expect(deleted.sha256).toBe(sha256OfBuffer(Buffer.from('move-me')));
  });

  it('超大文件：人工只记元数据，无人值守直接拒绝', () => {
    const file = join(h.guard.defaultRoot, 'big.bin');
    writeFileSync(file, Buffer.alloc(64, 1));
    const limited = createSnapshotService({
      dataRoot: h.dataRoot,
      guard: h.guard,
      snapshots: h.snapshots,
      settings: memorySettings({ 'flows.fileSnapshots.maxBytes': 8 }),
      now: () => new Date(T0),
    });
    const snapshot = limited.beforeWrite({ ...ctx(h), path: file })!;
    expect(snapshot).toMatchObject({ truncated: true, truncationReason: 'too_large', sha256: null });
    expect(() => limited.beforeWrite({ ...ctx(h), path: file, unattended: true })).toThrow(
      /快照上限/,
    );
  });

  it('配额不足先清理，仍不足则 fail-closed', () => {
    h.snapshots.createSnapshot({
      runId: h.run.id,
      workflowId: h.wf.id,
      toolName: 'write_file',
      action: 'write_new',
      path: join(h.guard.defaultRoot, 'used.txt'),
      existedBefore: false,
      byteSize: 8,
    });
    const limited = createSnapshotService({
      dataRoot: h.dataRoot,
      guard: h.guard,
      snapshots: h.snapshots,
      settings: memorySettings({ 'flows.fileSnapshots.quotaBytes': 10 }),
      now: () => new Date(T0),
    });
    const file = join(h.guard.defaultRoot, 'b.txt');
    writeFileSync(file, '12345');
    expect(() => limited.beforeWrite({ ...ctx(h), path: file })).toThrow(/配额不足/);
  });

  it('关闭快照返回 null，越界仍拒绝', () => {
    const disabled = createSnapshotService({
      dataRoot: h.dataRoot,
      guard: h.guard,
      snapshots: h.snapshots,
      settings: memorySettings({ 'flows.fileSnapshots.enabled': false }),
      now: () => new Date(T0),
    });
    const file = join(h.guard.defaultRoot, 'off.txt');
    writeFileSync(file, 'x');
    expect(disabled.beforeWrite({ ...ctx(h), path: file })).toBeNull();
    expect(() => disabled.beforeWrite({ ...ctx(h), path: join(h.tempRoot, 'out.txt') })).toThrow(
      /path-denied/,
    );
  });

  it('清理：dry-run 只统计，正式清理同时回收无引用 blob', () => {
    const file = join(h.guard.defaultRoot, 'old.txt');
    writeFileSync(file, 'expire-me');
    const snapshot = h.service.beforeWrite({ ...ctx(h), path: file })!;
    h.db
      .prepare("UPDATE file_snapshots SET created_at = '2026-10-01T00:00:00.000Z' WHERE id = ?")
      .run(snapshot.id);
    const blob = join(h.dataRoot, 'snapshots', 'blobs', snapshot.sha256!);
    expect(existsSync(blob)).toBe(true);

    expect(h.service.cleanup({ dryRun: true })).toMatchObject({ removed: 1, dryRun: true });
    expect(existsSync(blob)).toBe(true);

    expect(h.service.cleanup()).toMatchObject({ removed: 1, dryRun: false });
    expect(existsSync(blob)).toBe(false);
    expect(h.service.usage()).toMatchObject({ count: 0, bytes: 0 });
  });

  it('目录删除与不存在文件被拒绝', () => {
    const dir = join(h.guard.defaultRoot, 'folder');
    mkdirSync(dir, { recursive: true });
    expect(() => h.service.beforeDelete({ ...ctx(h), path: dir })).toThrow(/不是文件/);
    expect(() =>
      h.service.beforeDelete({ ...ctx(h), path: join(h.guard.defaultRoot, 'missing.txt') }),
    ).toThrow(/不存在/);
  });
});
