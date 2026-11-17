import { readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { ApiError } from '@wbfm/shared/errors';
import {
  WALLPAPER_PACK_MAX_FILE_BYTES,
  WALLPAPER_PACK_MAX_TOTAL_BYTES,
  wallpaperPackPayloadSchema,
  type CapabilityManifest,
  type WallpaperPackPayload,
} from '@wbfm/shared/schemas';

/** v4.4 M3：壁纸包 payload 文件名固定 */
export const WALLPAPER_PACK_ENTRY = 'payload/wallpaper-pack.json';

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mp4: 'video/mp4',
};

export function wallpaperContentType(file: string): string {
  return CONTENT_TYPES[extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream';
}

export function readWallpaperPackPayload(packDir: string): WallpaperPackPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(packDir, WALLPAPER_PACK_ENTRY), 'utf8'));
  } catch (error) {
    throw ApiError.validation(
      `壁纸包 payload 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = wallpaperPackPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.validation(
      `壁纸包 payload 校验失败：${parsed.error.issues.map((issue) => issue.message).join('；')}`,
    );
  }
  return parsed.data;
}

/** 资源路径必须落在包目录内；调用方再用 payload 声明做白名单 */
function resolveAssetPath(packDir: string, file: string): string {
  const root = resolve(packDir);
  const target = resolve(root, file);
  if (!target.startsWith(root + sep)) {
    throw ApiError.validation(`背景资源路径越界：${file}`);
  }
  return target;
}

export function readWallpaperAsset(packDir: string, file: string): Buffer {
  const target = resolveAssetPath(packDir, file);
  let buffer: Buffer;
  try {
    if (!statSync(target).isFile()) throw new Error('not file');
    buffer = readFileSync(target);
  } catch {
    throw ApiError.notFound('背景资源', file);
  }
  if (buffer.byteLength > WALLPAPER_PACK_MAX_FILE_BYTES) {
    throw ApiError.validation(`背景资源超过 50MB：${file}`);
  }
  return buffer;
}

/** 启用前校验：资源存在、在包目录内、单文件与合计不超预算 */
export function assertWallpaperAssets(packDir: string, payload: WallpaperPackPayload): void {
  let total = 0;
  for (const item of payload.backgrounds) {
    const target = resolveAssetPath(packDir, item.file);
    let size: number;
    try {
      const stat = statSync(target);
      if (!stat.isFile()) throw new Error('not file');
      size = stat.size;
    } catch {
      throw ApiError.notFound('背景资源', item.file);
    }
    if (size > WALLPAPER_PACK_MAX_FILE_BYTES) {
      throw ApiError.validation(`背景资源超过 50MB：${item.file}`);
    }
    total += size;
  }
  if (total > WALLPAPER_PACK_MAX_TOTAL_BYTES) {
    throw ApiError.validation('壁纸包资源合计超过 200MB');
  }
}

/** 启用：解析 payload + 资源预算校验；跨包冲突由内容聚合层检测 */
export function enableWallpaperPack(manifest: CapabilityManifest, packDir: string): string {
  assertWallpaperAssets(packDir, readWallpaperPackPayload(packDir));
  return manifest.id;
}

/** 停用：内容聚合按能力行状态过滤，无需额外清理 */
export function disableWallpaperPack(): void {}
