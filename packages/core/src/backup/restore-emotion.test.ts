import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createEmotionStateRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createDefaultEmotionState } from '@wbfm/shared/schemas';
import { exportBackup } from './export';
import { restoreBackup, precheckBackup } from './restore';
import { createWebCipher } from '../secrets/cipher';
import { ensureSeedData } from '../services/seed';

describe('备份恢复 · emotion 轨（v1.6）', () => {
  let srcDb: DatabaseInstance;
  let dstDb: DatabaseInstance;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-restore-emotion-'));
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

  it('roundtrip：内置助手导入、缺失助手跳过、幂等不覆盖、归档版本 v2', async () => {
    ensureSeedData(srcDb);
    const NOW = Date.UTC(2026, 9, 12, 8, 0, 0);
    // 内置助手有真实关系状态；自定义助手仅存在于源库（目标库缺失→跳过）
    const emotionRepo = createEmotionStateRepository(srcDb);
    const builtinState = createDefaultEmotionState(NOW);
    builtinState.mood.happiness = 63;
    builtinState.relation = { intimacy: 71, trust: 66 };
    builtinState.recentEvents = [
      { id: 'e1', type: 'praise', source: 'model', timestamp: NOW },
    ];
    emotionRepo.upsert('builtin-general', builtinState);

    srcDb
      .prepare(
        `INSERT INTO assistants(id,name,created_at,updated_at) VALUES('custom-a','自定义','t','t')`,
      )
      .run();
    const customState = createDefaultEmotionState(NOW);
    customState.relation.intimacy = 40;
    emotionRepo.upsert('custom-a', customState);

    const { archive, manifest } = await exportBackup(
      { db: srcDb, cipher: createWebCipher() },
      { tracks: ['emotion'] },
    );
    expect(manifest.backupSchemaVersion).toBe(2);
    expect(manifest.tracks.emotion?.entryCount).toBe(2);

    const pre = await precheckBackup(archive);
    expect(pre.tracks.emotion).toBe(2);

    // 首次恢复：内置 1 导入、自定义 1 跳过（助手不存在）
    const r1 = await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);
    expect(r1.imported.emotion).toBe(1);
    expect(r1.skipped.emotion).toBe(1);

    const dstRepo = createEmotionStateRepository(dstDb);
    const restored = dstRepo.get('builtin-general');
    expect(restored).not.toBeNull();
    expect(restored?.state.mood.happiness).toBe(63);
    expect(restored?.state.relation).toEqual({ intimacy: 71, trust: 66 });
    expect(restored?.state.recentEvents).toHaveLength(1);

    // 幂等：第二次恢复全部跳过（不覆盖本机关系）
    const r2 = await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);
    expect(r2.imported.emotion).toBe(0);
    expect(r2.skipped.emotion).toBe(2);
  });

  it('损坏 JSON：恢复抛出 VALIDATION_ERROR', async () => {
    ensureSeedData(srcDb);
    const { packTarGz } = await import('./export-archive');
    const { backupManifestSchema, CURRENT_BACKUP_SCHEMA_VERSION } = await import(
      '@wbfm/shared/backup'
    );
    const manifest = backupManifestSchema.parse({
      backupSchemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
      appVersion: '1.6.0',
      createdAt: new Date().toISOString(),
      tracks: {
        conversations: { files: 'conversations.json', entryCount: 0 },
        knowledge: { files: 'knowledge.json', knowledgeBaseCount: 0, documentCount: 0 },
        settings: { files: 'settings.json' },
        attachments: { files: 'attachments/', entryCount: 0, totalBytes: 0 },
        emotion: { files: 'emotion.json', entryCount: 1 },
      },
    });
    const archive = await packTarGz({ 'emotion.json': 'not-json' }, [], manifest);

    await expect(
      restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive),
    ).rejects.toThrow(/emotion\.json/);
  });
});
