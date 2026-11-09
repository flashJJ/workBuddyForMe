/**
 * v2.32 M4：存储占用分项与孤儿附件回收。
 * 断言：分项之和等于合计；dry-run 不移动；回收后可恢复；到期清理只动旧日期目录。
 */
import fs from 'node:fs';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { ensureDataDirs, getDataDir, resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { createAttachmentService } from '@wbfm/core/services';
import {
  getStorageUsage,
  listTrash,
  purgeTrash,
  resetStorageUsageCache,
  restoreFromTrash,
  scanOrphanAttachments,
  trashOrphanAttachments,
} from './storage-usage';

describe('storage usage & orphan cleanup（v2.32 M4）', () => {
  let db: DatabaseInstance;
  let tempRoot: string;
  let service: ReturnType<typeof createAttachmentService>;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-storage-'));
    setDataRootForTest(tempRoot);
    ensureDataDirs();
    db = createDatabase(':memory:');
    service = createAttachmentService({ db, cipher: createWebCipher() });
    resetStorageUsageCache();
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
    resetStorageUsageCache();
    if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('分项之和等于合计，且按顶层目录分桶', () => {
    fs.writeFileSync(join(getDataDir('files'), 'a.txt'), Buffer.alloc(100));
    fs.writeFileSync(join(getDataDir('spills'), 'b.txt'), Buffer.alloc(200));
    fs.writeFileSync(join(getDataDir('logs'), 'c.log'), Buffer.alloc(50));
    fs.writeFileSync(join(tempRoot, 'root.txt'), Buffer.alloc(10));
    resetStorageUsageCache();

    const usage = getStorageUsage();
    const sum = Object.values(usage.items).reduce((acc, value) => acc + value, 0);
    expect(sum).toBe(usage.totalBytes);
    expect(usage.items.files).toBe(100);
    expect(usage.items.spills).toBe(200);
    expect(usage.items.logs).toBe(50);
    expect(usage.items.other).toBeGreaterThanOrEqual(10);
    expect(usage.truncated).toBe(false);
  });

  it('dry-run 只统计不移动；移入回收后可恢复', () => {
    const artifact = service.saveArtifact({
      title: '图',
      format: 'svg',
      filename: 'a.svg',
      content: '<svg></svg>',
    });
    const orphanName = 'orphan.bin';
    fs.writeFileSync(join(getDataDir('attachments'), orphanName), Buffer.alloc(32));

    const scan = scanOrphanAttachments(db);
    expect(scan.candidates).toEqual([{ name: orphanName, bytes: 32 }]);
    expect(fs.existsSync(join(getDataDir('attachments'), orphanName))).toBe(true);

    // 有记录的产物不在候选中
    expect(scan.candidates.some((item) => item.name.includes(artifact.attachmentId))).toBe(false);

    const result = trashOrphanAttachments(db, [orphanName]);
    expect(result.moved).toBe(1);
    expect(fs.existsSync(join(getDataDir('attachments'), orphanName))).toBe(false);
    expect(scanOrphanAttachments(db).candidates).toHaveLength(0);

    const listing = listTrash();
    expect(listing.entries).toHaveLength(1);
    expect(listing.entries[0]).toMatchObject({ name: orphanName, bytes: 32 });

    restoreFromTrash(result.date, orphanName);
    expect(fs.existsSync(join(getDataDir('attachments'), orphanName))).toBe(true);
    expect(listTrash().entries).toHaveLength(0);
  });

  it('拒绝非候选文件；到期清理只删除 7 天前的日期目录', () => {
    fs.writeFileSync(join(getDataDir('attachments'), 'keep.bin'), Buffer.alloc(4));
    expect(() => trashOrphanAttachments(db, ['../../escape.bin'])).toThrow(/非法/);

    const trashDir = join(getDataDir('attachments'), '.trash');
    mkdirSync(join(trashDir, '2020-01-01'), { recursive: true });
    fs.writeFileSync(join(trashDir, '2020-01-01', 'old.bin'), Buffer.alloc(8));
    const today = new Date().toISOString().slice(0, 10);
    mkdirSync(join(trashDir, today), { recursive: true });
    fs.writeFileSync(join(trashDir, today, 'new.bin'), Buffer.alloc(6));

    const purged = purgeTrash(7);
    expect(purged.removedDates).toEqual(['2020-01-01']);
    expect(purged.bytes).toBe(8);
    expect(fs.existsSync(join(trashDir, '2020-01-01'))).toBe(false);
    expect(fs.existsSync(join(trashDir, today, 'new.bin'))).toBe(true);
  });
});
