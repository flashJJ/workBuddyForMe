/**
 * v2.33 M4：导出核对报告 + 恢复核对（声明 vs 写入/跳过、缺失附件、未引用计数）。
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
import { packTarGz } from '../export-archive';
import { extractArchiveFull } from '../restore-archive';
import { precheckBackup } from '../restore-precheck';
import { restoreBackup } from '../restore';
import { seedAttachment } from '../restore.helpers';

let db: DatabaseInstance;
let tempRoot: string;

function seedReportData(): void {
  ensureSeedData(db);
  const conv = createConversationRepository(db).create({
    assistantId: 'builtin-general',
    title: '报告核对',
  });
  createMessageRepository(db).add({
    conversationId: conv.id,
    role: 'user',
    content: '你好',
    status: 'completed',
  });
}

describe('导出报告与恢复核对（v2.33 M4）', () => {
  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-report-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
    if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('导出报告：逐轨条目/字节与 manifest 一致，总字节等于归档大小', async () => {
    seedReportData();
    seedAttachment(db, tempRoot);

    const { size, report, manifest } = await exportBackup(
      { db, cipher: createWebCipher() },
      { tracks: ['conversations', 'attachments'] },
    );

    const byTrack = Object.fromEntries(report.tracks.map((row) => [row.track, row]));
    expect(byTrack.conversations?.entryCount).toBe(
      manifest.tracks.conversations.entryCount +
        (manifest.tracks.conversations.messageCount ?? 0),
    );
    expect(byTrack.attachments?.entryCount).toBe(manifest.tracks.attachments.entryCount);
    expect(byTrack.conversations?.bytes).toBeGreaterThan(0);
    expect(byTrack.attachments?.bytes).toBeGreaterThan(0);
    expect(report.tracks.every((row) => row.elapsedMs >= 0)).toBe(true);
    expect(report.totalBytes).toBe(size);
    expect(report.encrypted).toBe(false);
  });

  it('加密导出：报告标记 encrypted 且总字节为容器大小', async () => {
    const plain = await exportBackup(
      { db, cipher: createWebCipher() },
      { tracks: ['settings'] },
    );
    const sealed = await exportBackup(
      { db, cipher: createWebCipher() },
      { tracks: ['settings'], password: 'password123' },
    );

    expect(sealed.encrypted).toBe(true);
    expect(sealed.report.encrypted).toBe(true);
    expect(sealed.report.totalBytes).toBe(sealed.size);
    expect(sealed.size).toBeGreaterThan(plain.size);
  });

  it('恢复核对：声明与写入同口径，并统计无引用附件', async () => {
    seedReportData();
    seedAttachment(db, tempRoot);
    const exported = await exportBackup(
      { db, cipher: createWebCipher() },
      { tracks: ['conversations', 'attachments'] },
    );

    const target = createDatabase(':memory:');
    try {
      const result = await restoreBackup(
        { db: target, cipher: createWebCipher() },
        exported.archive,
      );
      const declared = Object.fromEntries(
        result.verification.declared.map((row) => [row.track, row.entries]),
      );
      expect(declared.conversations).toBe(2);
      expect(declared.attachments).toBe(1);
      expect(result.verification.written.conversations).toBe(2);
      expect(result.verification.written.attachments).toBe(1);
      expect(result.verification.skipped.conversations).toBe(0);
      expect(result.verification.missingAttachments).toEqual([]);
      // seedAttachment 的附件行未挂任何消息/产物
      expect(result.verification.unreferencedAttachments).toBe(1);
    } finally {
      target.close();
    }
  });

  it('缺失附件：预检与恢复核对都给出清单，恢复仍成功', async () => {
    seedReportData();
    const att = seedAttachment(db, tempRoot);
    const exported = await exportBackup(
      { db, cipher: createWebCipher() },
      { tracks: ['attachments'] },
    );

    // 模拟归档内缺附件二进制：删掉 binaries 后重打包
    const extracted = await extractArchiveFull(exported.archive);
    const files: Record<string, string> = {};
    for (const [name, content] of extracted.files) files[name] = content.toString('utf-8');
    const broken = await packTarGz(files, [], extracted.manifest);

    const pre = await precheckBackup(broken);
    expect(pre.verification.missingAttachments).toEqual([att.storage_path]);

    const target = createDatabase(':memory:');
    try {
      const result = await restoreBackup(
        { db: target, cipher: createWebCipher() },
        broken,
      );
      expect(result.verification.missingAttachments).toEqual([att.storage_path]);
      expect(result.verification.written.attachments).toBe(1);
    } finally {
      target.close();
    }
  });
});
