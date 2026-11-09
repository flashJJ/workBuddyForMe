/**
 * v2.32 M3：产物批量打包。
 * 断言：manifest 条目数/字节数与归档文件一致；超限与非法输入返回可读错误。
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import zlib from 'node:zlib';
import tar from 'tar-stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { createAttachmentService } from '@wbfm/core/services';
import {
  ARTIFACT_BATCH_MAX_BYTES,
  exportArtifactsBatch,
} from './export-artifacts';

async function listArchive(archive: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    const files = new Map<string, Buffer>();
    const gunzip = zlib.createGunzip();
    const extract = tar.extract();
    extract.on('entry', (header, stream, next) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: unknown) => chunks.push(chunk as Buffer));
      stream.on('end', () => {
        files.set(header.name, Buffer.concat(chunks));
        next();
      });
    });
    extract.on('finish', () => resolve(files));
    extract.on('error', reject);
    gunzip.on('error', reject);
    gunzip.pipe(extract);
    gunzip.end(archive);
  });
}

describe('exportArtifactsBatch（v2.32 M3）', () => {
  let db: DatabaseInstance;
  let tempRoot: string;
  let service: ReturnType<typeof createAttachmentService>;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-artifacts-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    service = createAttachmentService({ db, cipher: createWebCipher() });
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
    if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true });
  });

  it('manifest 条目数、字节数与归档内文件一致', async () => {
    const a = service.saveArtifact({
      title: '图表 A',
      format: 'html',
      filename: 'chart.html',
      content: '<html>a</html>',
    });
    const b = service.saveArtifact({
      title: '图表 B',
      format: 'svg',
      filename: 'chart.svg',
      content: '<svg></svg>',
    });

    const result = await exportArtifactsBatch(db, [a.attachmentId, b.attachmentId]);
    expect(result.count).toBe(2);
    expect(result.manifest.entries).toHaveLength(2);
    expect(result.manifest.totalBytes).toBe(
      result.manifest.entries.reduce((sum, entry) => sum + entry.bytes, 0),
    );

    const files = await listArchive(result.archive);
    expect(files.has('manifest.json')).toBe(true);
    const manifest = JSON.parse(files.get('manifest.json')!.toString('utf-8')) as {
      count: number;
      entries: Array<{ id: string; archivePath: string; bytes: number }>;
    };
    expect(manifest.count).toBe(2);
    for (const entry of manifest.entries) {
      const file = files.get(entry.archivePath);
      expect(file).toBeDefined();
      expect(file!.byteLength).toBe(entry.bytes);
    }
  });

  it('超过 200MB 在读取文件前拒绝，且不产生归档', async () => {
    const a = service.saveArtifact({
      title: '大图',
      format: 'html',
      filename: 'big.html',
      content: '<html>x</html>',
    });
    db.prepare('UPDATE attachments SET byte_size = ? WHERE id = ?').run(
      ARTIFACT_BATCH_MAX_BYTES + 1,
      a.attachmentId,
    );
    await expect(exportArtifactsBatch(db, [a.attachmentId])).rejects.toThrow(/200MB/);
  });

  it('空列表、超量、非产物附件与缺失文件均返回可读错误', async () => {
    await expect(exportArtifactsBatch(db, [])).rejects.toThrow(/至少选择/);
    await expect(
      exportArtifactsBatch(db, Array.from({ length: 101 }, (_, i) => `id-${i}`)),
    ).rejects.toThrow(/最多打包 100/);

    const image = service.save({
      filename: 'photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from([1, 2, 3]),
    });
    await expect(exportArtifactsBatch(db, [image.id])).rejects.toThrow(/不是可打包产物/);

    const artifact = service.saveArtifact({
      title: '缺失',
      format: 'md',
      filename: 'lost.md',
      content: '# lost',
    });
    rmSync(join(tempRoot, 'attachments'), { recursive: true, force: true });
    await expect(exportArtifactsBatch(db, [artifact.attachmentId])).rejects.toThrow(/文件缺失/);
  });
});
