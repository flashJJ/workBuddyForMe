import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createAssistantRepository,
  createDatabase,
  createRelationshipMilestoneRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { setDataRootForTest, resetDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '../secrets/cipher';
import { ensureSeedData } from '../services/seed';
import { exportBackup } from './export';
import { precheckBackup, restoreBackup } from './restore';
import {
  readRelationshipMilestonesPayload,
  restoreRelationshipMilestones,
} from './restore-milestones';

function customAssistant(db: DatabaseInstance, id: string): void {
  createAssistantRepository(db).create({
    id,
    name: id,
    emoji: null,
    color: null,
    systemPrompt: '测试助手',
    temperature: 1,
    topP: 1,
    maxTokens: null,
    modelId: null,
    knowledgeBaseIds: [],
    enabledTools: [],
    retrieveAlways: false,
    isBuiltin: false,
    sortOrder: 0,
  });
}

describe('v2.0 M2 备份恢复（events 轨：relationshipMilestones）', () => {
  let srcDb: DatabaseInstance;
  let dstDb: DatabaseInstance;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-v20-backup-'));
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

  it('全链路 roundtrip：导出计数/manifest/precheck/恢复一致，重复恢复幂等', async () => {
    ensureSeedData(srcDb);
    customAssistant(srcDb, 'a1');
    const repo = createRelationshipMilestoneRepository(srcDb);
    repo.achieve({
      assistantId: 'a1',
      milestoneKey: 'day_1',
      achievedAt: '2026-10-15T08:00:00.000Z',
      payload: { sceneId: 'ev.milestone.day1' },
    });
    repo.achieve({
      assistantId: 'a1',
      milestoneKey: 'collab_10',
      achievedAt: '2026-11-01T08:00:00.000Z',
    });

    const { archive, manifest } = await exportBackup(
      { db: srcDb, cipher: createWebCipher() },
      { tracks: ['events'] },
    );
    expect(manifest.backupSchemaVersion).toBe(7);
    expect(manifest.tracks.events?.relationshipMilestoneCount).toBe(2);

    const pre = await precheckBackup(archive);
    expect(pre.tracks.relationshipMilestones).toBe(2);

    await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);
    const dstRepo = createRelationshipMilestoneRepository(dstDb);
    const restored = dstRepo.findByAssistant('a1').map((m) => m.milestoneKey);
    expect(restored).toEqual(['day_1', 'collab_10']);
    const day1 = dstRepo.findByAssistant('a1').find((m) => m.milestoneKey === 'day_1')!;
    expect(day1.payload).toEqual({ sceneId: 'ev.milestone.day1' });

    // 幂等：二次恢复不覆盖不新增
    await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);
    expect(dstRepo.listAll()).toHaveLength(2);
    expect(
      dstRepo.findByAssistant('a1').find((m) => m.milestoneKey === 'collab_10')!.achievedAt,
    ).toBe('2026-11-01T08:00:00.000Z');
  });

  it('直接恢复：外键缺失/非法 key 跳过；合法行导入', () => {
    ensureSeedData(dstDb);
    customAssistant(dstDb, 'a1');
    const counts = restoreRelationshipMilestones(dstDb, [
      {
        id: 'm1',
        assistantId: 'a1',
        milestoneKey: 'day_30',
        achievedAt: '2026-11-14T00:00:00.000Z',
        payload: {},
      },
      { id: 'm2', assistantId: 'ghost', milestoneKey: 'day_1', achievedAt: 't' },
      { id: 'm3', assistantId: 'ghost', milestoneKey: 'day_1', achievedAt: '2026-10-15T00:00:00.000Z' },
      { id: 'm4', assistantId: 'a1', milestoneKey: 'BAD KEY', achievedAt: '2026-10-15T00:00:00.000Z' },
    ]);
    expect(counts).toEqual({ imported: 1, skipped: 3 });
    expect(createRelationshipMilestoneRepository(dstDb).findByAssistant('a1').map((m) => m.milestoneKey)).toEqual(['day_30']);
  });

  it('损坏 JSON 抛归档级校验错误；v5 风格无文件由调用方按空数组降级', () => {
    expect(() => readRelationshipMilestonesPayload(Buffer.from('not-json'))).toThrow(
      /relationshipMilestones\.json/,
    );
  });
});
