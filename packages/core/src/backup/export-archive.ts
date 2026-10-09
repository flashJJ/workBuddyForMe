import zlib from 'node:zlib';
import tar from 'tar-stream';
import type { BackupManifest } from '@wbfm/shared/backup';

/** 内存中打包 tar.gz——所有 JSON 文件 + 可选二进制附件 */
export function packTarGz(
  files: Record<string, string>,
  binaries: Array<{ name: string; data: Buffer }>,
  manifest: BackupManifest,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const pack = tar.pack();
    const gz = zlib.createGzip();

    pack.on('error', reject);
    gz.on('error', reject);
    gz.on('data', (c: unknown) => chunks.push(c as Buffer));
    gz.on('end', () => resolve(Buffer.concat(chunks)));

    // 1. manifest
    pack.entry({ name: 'manifest.json' }, JSON.stringify(manifest, null, 2));
    // 2. JSON 轨道文件
    for (const [name, content] of Object.entries(files)) {
      pack.entry({ name }, content);
    }
    // 3. 二进制附件
    for (const bin of binaries) {
      pack.entry({ name: bin.name }, bin.data);
    }

    // 先 pipe，再 finalize——pipe 让 tar 输出自动喂给 gz
    pack.pipe(gz);
    pack.finalize();
  });
}
