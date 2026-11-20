/**
 * 备份归档解包（从 restore.ts 拆出以满足 300 行门禁）：
 * tar.gz → manifest（schema 校验）+ JSON 文件表 + 附件二进制。
 */
import zlib from 'node:zlib';
import tar from 'tar-stream';
import { backupManifestSchema, type BackupManifest } from '@wbfm/shared/backup';
import { ApiError } from '@wbfm/shared/errors';
import { openArchive } from '../portability/archive-cipher';

export interface ExtractedArchive {
  manifest: BackupManifest;
  files: Map<string, Buffer>;
  binaries: Array<{ name: string; data: Buffer }>;
}

export async function extractArchive(buf: Buffer, password?: string): Promise<{
  manifest: BackupManifest;
  files: Map<string, Buffer>;
}> {
  const r = await extractArchiveFull(buf, password);
  return { manifest: r.manifest, files: r.files };
}

/** v2.33：加密容器先解密（未加密归档原样返回），再按 tar.gz 解包 */
/** 解压上限：防 gzip 炸弹（单条 32MB / 整包 1GB / 条目数 10 万） */
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const MAX_ENTRIES = 100_000;

/** 归档条目名校验：恢复端落盘路径由条目名拼接，必须拒绝穿越与非法字符 */
function assertSafeEntryName(name: string): void {
  if (!name) throw new ApiError('VALIDATION_ERROR', '归档存在空文件名条目');
  if (name.includes('\\')) throw new ApiError('VALIDATION_ERROR', `归档条目不允许反斜杠：${name}`);
  if (name.startsWith('/') || /^[a-z]:/i.test(name) || name.includes(':')) {
    throw new ApiError('VALIDATION_ERROR', `归档条目不允许绝对路径：${name}`);
  }
  if (name.split('/').includes('..')) {
    throw new ApiError('VALIDATION_ERROR', `归档条目路径穿越被拒绝：${name}`);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(name)) {
    throw new ApiError('VALIDATION_ERROR', `归档条目含控制字符：${name}`);
  }
}

export async function extractArchiveFull(buf: Buffer, password?: string): Promise<ExtractedArchive> {
  const plain = openArchive(buf, password);
  return new Promise((resolve, reject) => {
    const gunzip = zlib.createGunzip();
    const extract = tar.extract();
    const files = new Map<string, Buffer>();
    const binaries: Array<{ name: string; data: Buffer }> = [];
    let manifest: BackupManifest | null = null;
    let settled = false;
    let totalBytes = 0;
    let entryCount = 0;

    /** 校验失败统一中止：销毁流并只 reject 一次，避免继续解压占内存 */
    const fail = (message: string): void => {
      if (settled) return;
      settled = true;
      extract.destroy();
      gunzip.destroy();
      reject(new ApiError('VALIDATION_ERROR', message));
    };

    extract.on('entry', (header, stream, next) => {
      if (settled) return;
      try {
        assertSafeEntryName(header.name);
      } catch (error) {
        fail(error instanceof Error ? error.message : '归档条目非法');
        return;
      }
      entryCount += 1;
      if (entryCount > MAX_ENTRIES) {
        fail(`归档条目数超过上限（${MAX_ENTRIES}）`);
        return;
      }
      const chunks: Buffer[] = [];
      let entryBytes = 0;
      stream.on('data', (c: unknown) => {
        if (settled) return;
        const chunk = c as Buffer;
        entryBytes += chunk.length;
        totalBytes += chunk.length;
        if (entryBytes > MAX_ENTRY_BYTES || totalBytes > MAX_TOTAL_BYTES) {
          fail(`归档解压后体积超过上限（单条 ${MAX_ENTRY_BYTES / 1024 / 1024}MB / 整包 ${MAX_TOTAL_BYTES / 1024 / 1024}MB），已中止恢复`);
          return;
        }
        chunks.push(chunk);
      });
      stream.on('end', () => {
        if (settled) return;
        const full = Buffer.concat(chunks);
        if (header.name === 'manifest.json') {
          try { manifest = backupManifestSchema.parse(JSON.parse(full.toString('utf-8'))); }
          catch { fail('manifest.json schema 校验失败'); return; }
        } else if (header.name.startsWith('attachments/')) {
          binaries.push({ name: header.name, data: full });
        } else {
          files.set(header.name, full);
        }
        next();
      });
      stream.on('error', (error: unknown) => {
        fail(error instanceof Error ? error.message : '归档条目读取失败');
      });
    });

    extract.on('finish', () => {
      if (settled) return;
      settled = true;
      if (!manifest) { reject(new ApiError('VALIDATION_ERROR', '归档缺少 manifest.json')); return; }
      resolve({ manifest, files, binaries });
    });
    gunzip.on('error', (error: unknown) => {
      fail(error instanceof Error ? error.message : '归档解压失败');
    });
    extract.on('error', (error: unknown) => {
      fail(error instanceof Error ? error.message : '归档解析失败');
    });
    gunzip.pipe(extract); gunzip.end(plain);
  });
}
