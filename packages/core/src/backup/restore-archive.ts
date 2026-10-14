/**
 * 备份归档解包（从 restore.ts 拆出以满足 300 行门禁）：
 * tar.gz → manifest（schema 校验）+ JSON 文件表 + 附件二进制。
 */
import zlib from 'node:zlib';
import tar from 'tar-stream';
import { backupManifestSchema, type BackupManifest } from '@wbfm/shared/backup';
import { ApiError } from '@wbfm/shared/errors';

export interface ExtractedArchive {
  manifest: BackupManifest;
  files: Map<string, Buffer>;
  binaries: Array<{ name: string; data: Buffer }>;
}

export async function extractArchive(buf: Buffer): Promise<{
  manifest: BackupManifest;
  files: Map<string, Buffer>;
}> {
  const r = await extractArchiveFull(buf);
  return { manifest: r.manifest, files: r.files };
}

export async function extractArchiveFull(buf: Buffer): Promise<ExtractedArchive> {
  return new Promise((resolve, reject) => {
    const gunzip = zlib.createGunzip();
    const extract = tar.extract();
    const files = new Map<string, Buffer>();
    const binaries: Array<{ name: string; data: Buffer }> = [];
    let manifest: BackupManifest | null = null;

    extract.on('entry', (header, stream, next) => {
      const chunks: Buffer[] = [];
      stream.on('data', (c: unknown) => chunks.push(c as Buffer));
      stream.on('end', () => {
        const full = Buffer.concat(chunks);
        if (header.name === 'manifest.json') {
          try { manifest = backupManifestSchema.parse(JSON.parse(full.toString('utf-8'))); }
          catch { reject(new ApiError('VALIDATION_ERROR', 'manifest.json schema 校验失败')); return; }
        } else if (header.name.startsWith('attachments/')) {
          binaries.push({ name: header.name, data: full });
        } else {
          files.set(header.name, full);
        }
        next();
      });
      stream.on('error', reject);
    });

    extract.on('finish', () => {
      if (!manifest) { reject(new ApiError('VALIDATION_ERROR', '归档缺少 manifest.json')); return; }
      resolve({ manifest, files, binaries });
    });
    gunzip.on('error', reject); extract.on('error', reject);
    gunzip.pipe(extract); gunzip.end(buf);
  });
}
