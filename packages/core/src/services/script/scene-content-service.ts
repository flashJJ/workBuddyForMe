import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { getDataDir } from '@wbfm/config';
import { createCapabilityRepository, type DatabaseInstance } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import type { Scene, ScenePackPayload } from '@wbfm/shared/schemas';
import { readScenePackPayload } from '../../capabilities/effects/scene-pack';

/** v4.3 M2：聚合已启用的 scene-pack，生成会话级场景快照 */

export interface ScenePackSource {
  id: string;
  version: string;
  payload: ScenePackPayload;
}

export interface SceneContent {
  /** 无包为 'none'；有包为 packs:<sha256(sorted id@version)[:12]> */
  version: string;
  scenes: Scene[];
}

function appendUnique(target: Scene[], items: readonly Scene[]): void {
  const seen = new Set(target.map((scene) => scene.id));
  for (const item of items) {
    if (seen.has(item.id)) throw ApiError.validation(`场景 id 冲突：${item.id}`);
    seen.add(item.id);
    target.push(item);
  }
}

/** 已启用包按能力行顺序聚合；跨包重复 id fail-closed */
export function mergeSceneContent(sources: readonly ScenePackSource[]): SceneContent {
  if (sources.length === 0) return { version: 'none', scenes: [] };
  const scenes: Scene[] = [];
  for (const source of sources) appendUnique(scenes, source.payload.scenes);
  const signature = sources
    .map((source) => `${source.id}@${source.version}`)
    .sort()
    .join(',');
  const version = `packs:${createHash('sha256').update(signature).digest('hex').slice(0, 12)}`;
  return { version, scenes };
}

export interface SceneContentServiceDeps {
  db: DatabaseInstance;
  /** 测试注入：能力包根目录（默认 <dataDir>/capabilities） */
  rootDir?: string;
}

export function createSceneContentService(deps: SceneContentServiceDeps) {
  const repo = createCapabilityRepository(deps.db);
  const rootDir = deps.rootDir ?? getDataDir('capabilities');

  return {
    /** 每次读取磁盘上的已启用包；安装/停用后下一次请求自然生效 */
    get(): SceneContent {
      const sources = repo
        .listEnabled()
        .filter((view) => view.manifest?.kind === 'scene-pack')
        .map((view) => ({
          id: view.id,
          version: view.version,
          payload: readScenePackPayload(join(rootDir, view.id)),
        }));
      return mergeSceneContent(sources);
    },
  };
}
