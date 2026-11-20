import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { extractArchiveFull } from '../restore/restore-archive';
import { packGzipArchive } from '../restore/restore.helpers';
import { writeAttachmentBinaries, writeSkillFolders } from '../portability/restore-post-write';

let tempRoot: string | null = null;

afterEach(() => {
  resetDataRootForTest();
  if (tempRoot) {
    rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  }
});

describe('备份归档恢复边界（v4.16）', () => {
  it('拒绝 .. 路径穿越条目', async () => {
    const archive = await packGzipArchive([
      { name: 'attachments/../escape.bin', data: 'pwn' },
    ]);
    await expect(extractArchiveFull(archive)).rejects.toThrow(/路径穿越/);
  });

  it('拒绝反斜杠与绝对路径条目', async () => {
    await expect(
      extractArchiveFull(
        await packGzipArchive([{ name: 'attachments\\..\\escape.bin', data: 'x' }]),
      ),
    ).rejects.toThrow(/反斜杠/);
    await expect(
      extractArchiveFull(await packGzipArchive([{ name: '/etc/passwd', data: 'x' }])),
    ).rejects.toThrow(/绝对路径/);
  });

  it('单条解压超过上限时中止（gzip 炸弹）', async () => {
    const big = Buffer.alloc(33 * 1024 * 1024);
    const archive = await packGzipArchive([{ name: 'attachments/big.bin', data: big }]);
    await expect(extractArchiveFull(archive)).rejects.toThrow(/体积超过上限/);
  }, 30_000);

  it('附件落盘拒绝跨层路径', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-restore-'));
    setDataRootForTest(tempRoot);
    expect(() =>
      writeAttachmentBinaries([{ name: 'attachments/../escape.bin', data: Buffer.from('x') }]),
    ).toThrow(/非法/);
    expect(existsSync(join(tempRoot, '..', 'escape.bin'))).toBe(false);
  });

  it('技能名非法时跳过，不写出数据根', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-restore-'));
    setDataRootForTest(tempRoot);
    const counts = writeSkillFolders({ skills: [{ name: '../escape', skillJson: '{}' }] }, 1);
    expect(counts).toEqual({ imported: 0, skipped: 1 });
    expect(existsSync(join(tempRoot, '..', 'escape'))).toBe(false);
  });
});
