import zlib from 'node:zlib';
import tar from 'tar-stream';
import type { BackupManifest } from '@wbfm/shared/backup';

export interface TarPayloadEntry {
  name: string;
  data: Buffer | string;
}

/** 内存中打包任意条目为 tar.gz（备份归档与产物批量导出共用） */
export function packEntries(entries: TarPayloadEntry[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const pack = tar.pack();
    const gz = zlib.createGzip();

    pack.on('error', reject);
    gz.on('error', reject);
    gz.on('data', (c: unknown) => chunks.push(c as Buffer));
    gz.on('end', () => resolve(Buffer.concat(chunks)));

    for (const entry of entries) pack.entry({ name: entry.name }, entry.data);

    // 先 pipe，再 finalize——pipe 让 tar 输出自动喂给 gz
    pack.pipe(gz);
    pack.finalize();
  });
}

/** 内存中打包 tar.gz——所有 JSON 文件 + 可选二进制附件 */
export function packTarGz(
  files: Record<string, string>,
  binaries: Array<{ name: string; data: Buffer }>,
  manifest: BackupManifest,
): Promise<Buffer> {
  const entries: TarPayloadEntry[] = [
    { name: 'manifest.json', data: JSON.stringify(manifest, null, 2) },
    ...Object.entries(files).map(([name, content]) => ({ name, data: content })),
    ...binaries.map((bin) => ({ name: bin.name, data: bin.data })),
  ];
  return packEntries(entries);
}
