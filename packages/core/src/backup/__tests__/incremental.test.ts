/**
 * v2.34：基线完整性 + 增量归档 + 链式恢复。
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createConversationRepository,
  createDatabase,
  createMessageRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '../../secrets/cipher';
import { ensureSeedData } from '../../services/base/seed';
import { exportBackup } from '../export';
import { extractArchiveFull } from '../restore-archive';
import { restoreBackup } from '../restore';
import { readBackupHistory } from '../portability/chain/backup-registry';

let db: DatabaseInstance;
let tempRoot: string;

function makeConversation(): string {
  ensureSeedData(db);
  return createConversationRepository(db).create({
    assistantId: 'builtin-general',
    title: '增量会话',
  }).id;
}

describe('增量归档与链式恢复（v2.34）', () => {
  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-incremental-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
    if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('全量导出不再截断 500 条消息，并记录真实 messageCount', async () => {
    const conversationId = makeConversation();
    const messages = createMessageRepository(db);
    for (let i = 0; i < 501; i += 1) {
      messages.add({
        conversationId,
        role: 'user',
        content: `消息 ${i}`,
        status: 'completed',
      });
    }

    const { manifest, archive } = await exportBackup(
      { db, cipher: createWebCipher() },
      { tracks: ['conversations'] },
    );

    expect(manifest.tracks.conversations.entryCount).toBe(1);
    expect(manifest.tracks.conversations.messageCount).toBe(501);
    const extracted = await extractArchiveFull(archive);
    const rows = JSON.parse(
      extracted.files.get('conversations.json')!.toString('utf-8'),
    ) as Array<{ messages: unknown[] }>;
    expect(rows[0]?.messages).toHaveLength(501);
  });

  it('增量只带 since 之后的新消息，链恢复可追加到已有会话', async () => {
    const conversationId = makeConversation();
    const messages = createMessageRepository(db);
    const old = messages.add({
      conversationId,
      role: 'user',
      content: '旧消息',
      status: 'completed',
    });
    // 固定旧消息时间，确保它落在基线水位之前
    db.prepare(`UPDATE messages SET created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?`).run(old.id);

    const full = await exportBackup(
      { db, cipher: createWebCipher() },
      { tracks: ['conversations'] },
    );
    expect(full.chain.kind).toBe('full');
    expect(full.chain.sequence).toBe(0);

    messages.add({
      conversationId,
      role: 'user',
      content: '新消息',
      status: 'completed',
    });
    const incremental = await exportBackup(
      { db, cipher: createWebCipher() },
      { tracks: ['conversations'], mode: 'incremental' },
    );
    expect(incremental.chain.kind).toBe('incremental');
    expect(incremental.chain.sequence).toBe(1);
    expect(incremental.chain.parentArchiveId).toBe(full.chain.archiveId);

    const extracted = await extractArchiveFull(incremental.archive);
    const rows = JSON.parse(
      extracted.files.get('conversations.json')!.toString('utf-8'),
    ) as Array<{ messages: Array<{ content: string }> }>;
    expect(rows.flatMap((row) => row.messages.map((m) => m.content))).toEqual(['新消息']);

    const target = createDatabase(':memory:');
    try {
      const first = await restoreBackup({ db: target, cipher: createWebCipher() }, full.archive);
      expect(first.imported.messages).toBe(1);
      const second = await restoreBackup(
        { db: target, cipher: createWebCipher() },
        incremental.archive,
      );
      expect(second.imported.messages).toBe(1);
      expect(second.verification.written.conversations).toBe(1);
      expect(second.verification.chain?.segments.map((s) => s.sequence)).toEqual([0, 1]);
      const restored = createMessageRepository(target).listAllByConversation(conversationId);
      expect(restored.map((m) => m.content)).toEqual(['旧消息', '新消息']);
    } finally {
      target.close();
    }
  });

  it('无全量基线时拒绝增量导出', async () => {
    await expect(
      exportBackup(
        { db, cipher: createWebCipher() },
        { tracks: ['settings'], mode: 'incremental' },
      ),
    ).rejects.toThrow(/全量基线/);
  });

  it('未恢复基线时拒绝增量恢复，并保留导出历史', async () => {
    const conversationId = makeConversation();
    createMessageRepository(db).add({
      conversationId,
      role: 'user',
      content: '基线消息',
      status: 'completed',
    });
    const full = await exportBackup(
      { db, cipher: createWebCipher() },
      { tracks: ['conversations'] },
    );
    createMessageRepository(db).add({
      conversationId,
      role: 'user',
      content: '增量消息',
      status: 'completed',
    });
    const incremental = await exportBackup(
      { db, cipher: createWebCipher() },
      { tracks: ['conversations'], mode: 'incremental' },
    );

    expect(readBackupHistory(db).map((entry) => entry.sequence)).toEqual([1, 0]);

    const target = createDatabase(':memory:');
    try {
      await expect(
        restoreBackup({ db: target, cipher: createWebCipher() }, incremental.archive),
      ).rejects.toMatchObject({ code: 'BACKUP_CHAIN_INCOMPLETE' });
      // 基线可正常恢复并重置链状态
      const result = await restoreBackup({ db: target, cipher: createWebCipher() }, full.archive);
      expect(result.verification.chain?.segments).toHaveLength(1);
    } finally {
      target.close();
    }
  });
});
