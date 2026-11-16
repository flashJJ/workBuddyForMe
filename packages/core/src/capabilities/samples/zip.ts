import { createHash } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import type { CapabilityManifest } from '@wbfm/shared/schemas';
import { CAPABILITY_MANIFEST_FILE } from '../manifest';

/** v4.3 M2：示例包 ZIP 构建器（样例/测试共用） */

export interface SamplePackFile {
  path: string;
  bytes: Uint8Array;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function buildSampleZip(
  manifest: Omit<CapabilityManifest, 'checksums'>,
  files: SamplePackFile[],
): Uint8Array {
  const zipFiles: Record<string, Uint8Array> = {};
  const checksums: Record<string, string> = {};
  for (const file of files) {
    zipFiles[file.path] = file.bytes;
    checksums[file.path] = sha256(file.bytes);
  }
  zipFiles[CAPABILITY_MANIFEST_FILE] = strToU8(
    JSON.stringify({ ...manifest, checksums }, null, 2),
  );
  return zipSync(zipFiles);
}
