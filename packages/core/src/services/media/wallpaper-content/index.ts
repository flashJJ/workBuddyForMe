import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { getDataDir } from '@wbfm/config';
import { createCapabilityRepository, type DatabaseInstance } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import type { WallpaperPackItem, WallpaperPackPayload } from '@wbfm/shared/schemas';
import {
  readWallpaperAsset,
  readWallpaperPackPayload,
  wallpaperContentType,
} from '../../../capabilities/effects/wallpaper-pack';

/** v4.4 M3：聚合已启用的 wallpaper-pack，生成会话级背景快照 */

export interface WallpaperPackSource {
  id: string;
  version: string;
  payload: WallpaperPackPayload;
}

export interface WallpaperView extends Omit<WallpaperPackItem, 'file'> {
  /** 资源路由；渲染层直接作为图片/视频地址 */
  url: string;
}

export interface WallpaperContent {
  /** 无包为 'none'；有包为 wallpapers:<sha256(sorted id@version)[:12]> */
  version: string;
  wallpapers: WallpaperView[];
}

function assetUrl(packId: string, file: string): string {
  const query = new URLSearchParams({ pack: packId, file }).toString();
  return `/api/wallpaper-assets?${query}`;
}

/** 已启用包按能力行顺序聚合；跨包重复 id fail-closed */
export function mergeWallpaperContent(
  sources: readonly WallpaperPackSource[],
): WallpaperContent {
  if (sources.length === 0) return { version: 'none', wallpapers: [] };
  const wallpapers: WallpaperView[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    for (const item of source.payload.backgrounds) {
      if (seen.has(item.id)) throw ApiError.validation(`背景 id 冲突：${item.id}`);
      seen.add(item.id);
      const { file, ...rest } = item;
      wallpapers.push({ ...rest, url: assetUrl(source.id, file) });
    }
  }
  const signature = sources
    .map((source) => `${source.id}@${source.version}`)
    .sort()
    .join(',');
  const version = `wallpapers:${createHash('sha256').update(signature).digest('hex').slice(0, 12)}`;
  return { version, wallpapers };
}

export interface WallpaperContentServiceDeps {
  db: DatabaseInstance;
  /** 测试注入：能力包根目录（默认 <dataDir>/capabilities） */
  rootDir?: string;
}

export function createWallpaperContentService(deps: WallpaperContentServiceDeps) {
  const repo = createCapabilityRepository(deps.db);
  const rootDir = deps.rootDir ?? getDataDir('capabilities');

  return {
    /** 每次读取磁盘上的已启用包；安装/停用后下一次请求自然生效 */
    get(): WallpaperContent {
      const sources = repo
        .listEnabled()
        .filter((view) => view.manifest?.kind === 'wallpaper-pack')
        .map((view) => ({
          id: view.id,
          version: view.version,
          payload: readWallpaperPackPayload(join(rootDir, view.id)),
        }));
      return mergeWallpaperContent(sources);
    },

    /** 仅服务已启用包且被 payload 声明的资源，防止任意文件读取 */
    readAsset(packId: string, file: string): { buffer: Buffer; contentType: string } {
      const view = repo.get(packId);
      if (!view || view.status !== 'enabled' || view.kind !== 'wallpaper-pack') {
        throw ApiError.notFound('壁纸包', packId);
      }
      const payload = readWallpaperPackPayload(join(rootDir, packId));
      if (!payload.backgrounds.some((item) => item.file === file)) {
        throw ApiError.notFound('背景资源', file);
      }
      return {
        buffer: readWallpaperAsset(join(rootDir, packId), file),
        contentType: wallpaperContentType(file),
      };
    },
  };
}
