import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { ApiError } from '@wbfm/shared/errors';
import {
  CAPABILITY_ENTRY_BY_KIND,
  CAPABILITY_REQUIRED_PERMISSION,
  CAPABILITY_SUPPORTED_KINDS,
  capabilityManifestSchema,
  type CapabilityKind,
  type CapabilityManifest,
} from '@wbfm/shared/schemas';

/** v2.10 能力包 ZIP 解析与校验（纯函数，服务层只做落盘与 effect） */

export const CAPABILITY_MANIFEST_FILE = 'wbfm-capability.json';

export interface ParsedCapability {
  manifest: CapabilityManifest;
  files: Record<string, Uint8Array>;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertSafePath(path: string): void {
  if (
    path.includes('\\') ||
    path.includes('\0') ||
    path.includes(':') ||
    path.startsWith('/') ||
    path.split('/').includes('..')
  ) {
    throw ApiError.validation(`能力包包含非法路径：${path}`);
  }
}

export function parseCapabilityZip(buffer: Uint8Array): ParsedCapability {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buffer);
  } catch {
    throw ApiError.validation('能力包不是有效的 ZIP');
  }

  const manifestRaw = files[CAPABILITY_MANIFEST_FILE];
  if (!manifestRaw) throw ApiError.validation(`缺少 ${CAPABILITY_MANIFEST_FILE}`);

  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(manifestRaw));
  } catch {
    throw ApiError.validation(`${CAPABILITY_MANIFEST_FILE} 不是合法 JSON`);
  }
  const parsed = capabilityManifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.validation(
      `能力包清单校验失败：${parsed.error.issues.map((i) => i.message).join('；')}`,
    );
  }
  const manifest = parsed.data;

  if (!CAPABILITY_SUPPORTED_KINDS.includes(manifest.kind)) {
    throw ApiError.validation(`该能力类型尚未接入：${manifest.kind}`);
  }
  const required = CAPABILITY_REQUIRED_PERMISSION[manifest.kind];
  if (!manifest.permissions.includes(required)) {
    throw ApiError.validation(`缺少必需权限：${required}`);
  }
  if (manifest.entry !== CAPABILITY_ENTRY_BY_KIND[manifest.kind]) {
    throw ApiError.validation(
      `${manifest.kind} 能力包的 entry 必须为 ${CAPABILITY_ENTRY_BY_KIND[manifest.kind]}`,
    );
  }

  for (const key of Object.keys(files)) {
    if (key === CAPABILITY_MANIFEST_FILE) continue;
    assertSafePath(key);
    if (!key.startsWith('payload/')) {
      throw ApiError.validation(`能力包根目录只允许 ${CAPABILITY_MANIFEST_FILE} 与 payload/**`);
    }
  }

  const payloadFiles = Object.keys(files).filter(
    (key) => key.startsWith('payload/') && !key.endsWith('/'),
  );
  if (!payloadFiles.includes(manifest.entry)) {
    throw ApiError.validation(`entry 指向的文件不存在：${manifest.entry}`);
  }
  for (const file of payloadFiles) {
    const expected = manifest.checksums[file];
    if (!expected) throw ApiError.validation(`checksums 缺少文件：${file}`);
    if (sha256(files[file]!) !== expected) {
      throw ApiError.validation(`校验和不匹配：${file}`);
    }
  }
  const extra = Object.keys(manifest.checksums).filter((file) => !payloadFiles.includes(file));
  if (extra.length > 0) throw ApiError.validation(`checksums 声明了不存在的文件：${extra.join(', ')}`);

  const entryLimit = ENTRY_SIZE_LIMITS[manifest.kind];
  if (entryLimit && files[manifest.entry]!.byteLength > entryLimit) {
    throw ApiError.validation(`entry 文件超过大小上限：${manifest.entry}`);
  }
  if (manifest.kind === 'pet-action') {
    for (const file of payloadFiles) {
      if (file.toLowerCase().endsWith('.vrma') && files[file]!.byteLength > MOTION_MAX_BYTES) {
        throw ApiError.validation(`动作文件超过 10MB 上限：${file}`);
      }
    }
  }

  return { manifest, files };
}

/** 每类 payload 主文件的体积上限（VRMA 单独按动作文件上限） */
const ENTRY_SIZE_LIMITS: Partial<Record<CapabilityKind, number>> = {
  workflow: 256 * 1024,
  'pet-action': 32 * 1024,
};

const MOTION_MAX_BYTES = 10 * 1024 * 1024;
