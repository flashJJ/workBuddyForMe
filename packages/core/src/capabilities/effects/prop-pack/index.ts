import { readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { ApiError } from '@wbfm/shared/errors';
import {
  PROP_PACK_MAX_ASSET_BYTES,
  PROP_PACK_MAX_TOTAL_BYTES,
  propPackPayloadSchema,
  type CapabilityManifest,
  type PropPackPayload,
} from '@wbfm/shared/schemas';

/** v4.3 M3：道具包 payload 文件名固定 */
export const PROP_PACK_ENTRY = 'payload/prop-pack.json';

export function readPropPackPayload(packDir: string): PropPackPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(packDir, PROP_PACK_ENTRY), 'utf8'));
  } catch (error) {
    throw ApiError.validation(
      `道具包 payload 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = propPackPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.validation(
      `道具包 payload 校验失败：${parsed.error.issues.map((issue) => issue.message).join('；')}`,
    );
  }
  return parsed.data;
}

/** 资源路径必须落在包目录内；调用方再用 payload 声明做白名单 */
function resolveAssetPath(packDir: string, file: string): string {
  const root = resolve(packDir);
  const target = resolve(root, file);
  if (!target.startsWith(root + sep)) {
    throw ApiError.validation(`道具资源路径越界：${file}`);
  }
  return target;
}

export function readPropAsset(packDir: string, file: string): Buffer {
  const target = resolveAssetPath(packDir, file);
  let buffer: Buffer;
  try {
    if (!statSync(target).isFile()) throw new Error('not file');
    buffer = readFileSync(target);
  } catch {
    throw ApiError.notFound('道具资源', file);
  }
  if (buffer.byteLength > PROP_PACK_MAX_ASSET_BYTES) {
    throw ApiError.validation(`道具资源超过 5MB：${file}`);
  }
  return buffer;
}

/** 启用前校验：资源存在、在包目录内、单文件与合计不超预算 */
export function assertPropAssets(packDir: string, payload: PropPackPayload): void {
  let total = 0;
  for (const prop of payload.props) {
    const target = resolveAssetPath(packDir, prop.file);
    let size: number;
    try {
      const stat = statSync(target);
      if (!stat.isFile()) throw new Error('not file');
      size = stat.size;
    } catch {
      throw ApiError.notFound('道具资源', prop.file);
    }
    if (size > PROP_PACK_MAX_ASSET_BYTES) {
      throw ApiError.validation(`道具资源超过 5MB：${prop.file}`);
    }
    total += size;
  }
  if (total > PROP_PACK_MAX_TOTAL_BYTES) {
    throw ApiError.validation('道具资源合计超过 20MB');
  }
}

/** 启用：解析 payload + 资源预算校验；跨包冲突由内容聚合层检测 */
export function enablePropPack(manifest: CapabilityManifest, packDir: string): string {
  assertPropAssets(packDir, readPropPackPayload(packDir));
  return manifest.id;
}

/** 停用：内容聚合按能力行状态过滤，无需额外清理 */
export function disablePropPack(): void {}
