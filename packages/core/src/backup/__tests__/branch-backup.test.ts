import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, createConversationBranchRepository, createConversationRepository, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '../../secrets/cipher';
import { ensureSeedData } from '../../services/base/seed';
import { exportBackup } from '../export';
import { restoreBackup } from '../restore';
import { restoreBranches } from '../branches/restore-branches';
import { packGzipArchive } from '../restore.helpers';

function seedBranches(db: DatabaseInstance) {
  ensureSeedData(db);
  const convRepo = createConversationRepository(db);
  const branchRepo = createConversationBranchRepository(db);
  const parent = convRepo.create({ assistantId: 'builtin-general', title: '父会话' });
  const childA = convRepo.create({ assistantId: 'builtin-general', title: '分支 A' });
  const childB = convRepo.create({ assistantId: 'builtin-general', title: '分支 B' });
  const a = branchRepo.create({
    id: 'br-a',
    parentConversationId: parent.id,
    childConversationId: childA.id,
    rootConversationId: parent.id,
    title: '分支 A',
    goal: '查竞品',
    depth: 1,
  });
  const b = branchRepo.create({
    id: 'br-b',
    parentConversationId: parent.id,
    childConversationId: childB.id,
    rootConversationId: parent.id,
    title: '分支 B',
    goal: '写摘要',
    depth: 1,
  });
  branchRepo.patch(a.id, {
    status: 'succeeded',
    reservedTokens: 0,
    endedAt: '2026-11-04T00:00:00.000Z',
    evidence: {
      branchId: 'br-a',
      parentConversationId: parent.id,
      childConversationId: childA.id,
      rootConversationId: parent.id,
      status: 'succeeded',
      summary: '竞品 A 领先',
      artifacts: [],
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      needsReview: true,
      createdAt: '2026-11-04T00:00:00.000Z',
    },
  });
  // 模拟进程中断：运行中 + 预留
  branchRepo.patch(b.id, { status: 'running', reservedTokens: 1000 });
  branchRepo.patch(b.id, { archivedAt: '2026-11-04T00:00:00.000Z' });
  return { parent, childA, childB };
}

describe('v2.21 备份：分支关联', () => {
  let tempRoot: string;
  let source: DatabaseInstance;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-branch-bak-'));
    setDataRootForTest(tempRoot);
    source = createDatabase(':memory:');
  });

  afterEach(() => {
    source.close();
    resetDataRootForTest();
  });

  it('导出含 branches.json 与 branchCount；恢复后运行中→中断、证据/归档保留', async () => {
    seedBranches(source);
    const cipher = createWebCipher();
    const { archive, manifest } = await exportBackup({ db: source, cipher }, { tracks: ['conversations'] });

    expect(manifest.tracks.conversations.branchCount).toBe(2);

    const target = createDatabase(':memory:');
    ensureSeedData(target);
    const result = await restoreBackup({ db: target, cipher }, archive, { tracks: ['conversations'] });
    const repo = createConversationBranchRepository(target);

    expect(result.imported.branches).toBe(2);
    expect(result.skipped.branches).toBe(0);
    expect(repo.get('br-a')).toMatchObject({ status: 'succeeded', archivedAt: null });
    expect(repo.get('br-a')?.evidence?.summary).toBe('竞品 A 领先');
    expect(repo.get('br-b')).toMatchObject({
      status: 'interrupted',
      reservedTokens: 0,
      archivedAt: '2026-11-04T00:00:00.000Z',
      statusReason: '恢复时运行中断',
    });
    target.close();
  });

  it('旧档缺 branches.json：不写分支、不报错', async () => {
    const cipher = createWebCipher();
    const legacyArchive = await packGzipArchive([
      {
        name: 'manifest.json',
        data: JSON.stringify({
          backupSchemaVersion: 7,
          appVersion: '2.20.0',
          createdAt: '2026-11-04T00:00:00.000Z',
          tracks: {
            conversations: { files: 'conversations.json', entryCount: 0 },
            knowledge: { files: 'knowledge.json', knowledgeBaseCount: 0, documentCount: 0 },
            settings: { files: 'settings.json' },
            attachments: { files: 'attachments/', entryCount: 0, totalBytes: 0 },
          },
        }),
      },
      { name: 'conversations.json', data: '[]' },
    ]);
    const target = createDatabase(':memory:');
    ensureSeedData(target);
    const result = await restoreBackup({ db: target, cipher }, legacyArchive, { tracks: ['conversations'] });
    expect(result.imported.branches).toBe(0);
    expect(result.skipped.branches).toBe(0);
    target.close();
  });

  it('父/子会话缺失的分支跳过并计数', () => {
    const db = createDatabase(':memory:');
    ensureSeedData(db);
    const counts = restoreBranches(
      db,
      Buffer.from(
        JSON.stringify([
          {
            id: 'orphan',
            parentConversationId: 'missing-parent',
            childConversationId: 'missing-child',
            rootConversationId: 'missing-parent',
            title: '孤儿分支',
            goal: '无父会话',
            status: 'queued',
            depth: 1,
            createdAt: '2026-11-04T00:00:00.000Z',
            updatedAt: '2026-11-04T00:00:00.000Z',
          },
        ]),
      ),
    );
    expect(counts).toEqual({ imported: 0, skipped: 1 });
    db.close();
  });
});
