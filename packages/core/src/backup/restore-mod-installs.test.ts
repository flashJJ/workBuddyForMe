import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createModInstallRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { setDataRootForTest, resetDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '../secrets/cipher';
import { exportBackup } from './export';
import { precheckBackup, restoreBackup } from './restore';
import {
  readModInstallsPayload,
  readVrmAvatarsPayload,
  restoreModInstalls,
  restoreVrmAvatars,
} from './restore-mod-installs';

function insertVrmRow(
  db: DatabaseInstance,
  ref: string,
  name: string,
  createdAt = '2026-11-20T08:00:00.000Z',
): void {
  db.prepare(
    `INSERT INTO vrm_avatars(id, name, file_ref, byte_length, meta_json, created_at)
     VALUES (@id, @name, @ref, 1024, '{"name":"M","vrmVersion":"1.0"}', @createdAt)`,
  ).run({ id: `id-${ref}`, name, ref, createdAt });
}

describe('v2.0 M5 备份恢复（events 轨：modInstalls + vrmAvatars 引用）', () => {
  let srcDb: DatabaseInstance;
  let dstDb: DatabaseInstance;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-v20-m5-backup-'));
    setDataRootForTest(tempRoot);
    srcDb = createDatabase(':memory:');
    dstDb = createDatabase(':memory:');
  });

  afterEach(() => {
    srcDb.close();
    dstDb.close();
    resetDataRootForTest();
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('roundtrip：mod 登记与 VRM 引用计数/预检告警/恢复一致；VRM 二进制不入档', async () => {
    createModInstallRepository(srcDb).record({
      packId: 'p_demo-pack',
      name: '搭档套装',
      packVersion: '1.2.0',
      authorName: 'tester',
      importedAt: '2026-11-19T08:00:00.000Z',
      summary: {
        characterCardIds: ['card-1'],
        stageSceneIds: ['scene-1'],
        stageBackgroundFileRefs: ['bg-1.png'],
      },
    });
    insertVrmRow(srcDb, 'vrm-abc.vrm', '我的 VRM');

    const { archive, manifest } = await exportBackup(
      { db: srcDb, cipher: createWebCipher() },
      { tracks: ['events'] },
    );
    expect(manifest.backupSchemaVersion).toBe(7);
    expect(manifest.tracks.events?.modInstallCount).toBe(1);
    expect(manifest.tracks.events?.vrmAvatarCount).toBe(1);

    const pre = await precheckBackup(archive);
    expect(pre.tracks.modInstalls).toBe(1);
    expect(pre.tracks.vrmAvatars).toBe(1);
    expect(pre.warnings.some((w) => w.includes('VRM'))).toBe(true);

    const result = await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);
    const installs = createModInstallRepository(dstDb).listAll();
    expect(installs).toHaveLength(1);
    expect(installs[0]?.packId).toBe('p_demo-pack');
    expect(installs[0]?.summary.stageBackgroundFileRefs).toEqual(['bg-1.png']);
    const vrm = dstDb.prepare('SELECT id, name, file_ref, byte_length FROM vrm_avatars').all() as Array<{
      id: string;
      name: string;
      file_ref: string;
      byte_length: number;
    }>;
    expect(vrm).toEqual([
      { id: 'id-vrm-abc.vrm', name: '我的 VRM', file_ref: 'vrm-abc.vrm', byte_length: 1024 },
    ]);
    expect(result.warnings.some((w) => w.includes('vrm-abc.vrm'))).toBe(true);

    // 幂等：二次恢复不再产生悬空告警
    const again = await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);
    expect(createModInstallRepository(dstDb).listAll()).toHaveLength(1);
    expect(again.warnings).toEqual([]);
  });

  it('直接恢复：非法行逐项跳过，file_ref 唯一冲突跳过', () => {
    insertVrmRow(dstDb, 'vrm-exists.vrm', '本机已有');
    const modCounts = restoreModInstalls(dstDb, [
      {
        id: 'mi1',
        packId: 'p_ok',
        name: '合法包',
        packVersion: '1.0.0',
        authorName: null,
        importedAt: '2026-11-19T08:00:00.000Z',
        summary: { characterCardIds: [], stageSceneIds: [], stageBackgroundFileRefs: [] },
      },
      { id: 'bad', packId: 'p_ok' }, // 缺字段
    ]);
    expect(modCounts).toEqual({ imported: 1, skipped: 1 });

    const vrmCounts = restoreVrmAvatars(dstDb, [
      {
        id: 'v1',
        name: '外来形象',
        fileRef: 'vrm-new.vrm',
        byteLength: 2048,
        meta: {},
        createdAt: '2026-11-20T08:00:00.000Z',
      },
      {
        id: 'v2',
        name: '冲突形象',
        fileRef: 'vrm-exists.vrm',
        byteLength: 1,
        meta: {},
        createdAt: '2026-11-20T08:00:00.000Z',
      },
      { id: 'v3', fileRef: 'vrm-x.vrm' }, // 非法
    ]);
    expect(vrmCounts.imported).toBe(1);
    expect(vrmCounts.skipped).toBe(2);
    expect(vrmCounts.importedRefs).toEqual(['vrm-new.vrm']);
  });

  it('损坏 JSON 抛归档级校验错误', () => {
    expect(() => readModInstallsPayload(Buffer.from('xxx'))).toThrow(/modInstalls\.json/);
    expect(() => readVrmAvatarsPayload(Buffer.from('xxx'))).toThrow(/vrmAvatars\.json/);
  });
});
