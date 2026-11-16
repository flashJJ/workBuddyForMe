import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { getDataDir } from '@wbfm/config';
import { createCapabilityRepository, type DatabaseInstance } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import type { PropPackPayload, PropPackProp } from '@wbfm/shared/schemas';
import {
  readPropAsset,
  readPropPackPayload,
} from '../../../capabilities/effects/prop-pack';

/** v4.3 M3：聚合已启用的 prop-pack，生成会话级道具快照 */

export interface PropPackSource {
  id: string;
  version: string;
  payload: PropPackPayload;
}

export interface PropView extends Omit<PropPackProp, 'file'> {
  /** 资源路由；渲染层直接交给 GLTFLoader */
  url: string;
}

export interface PropContent {
  /** 无包为 'none'；有包为 packs:<sha256(sorted id@version)[:12]> */
  version: string;
  props: PropView[];
}

function assetUrl(packId: string, file: string): string {
  const query = new URLSearchParams({ pack: packId, file }).toString();
  return `/api/prop-assets?${query}`;
}

/** 已启用包按能力行顺序聚合；跨包重复 id fail-closed */
export function mergePropContent(sources: readonly PropPackSource[]): PropContent {
  if (sources.length === 0) return { version: 'none', props: [] };
  const props: PropView[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    for (const prop of source.payload.props) {
      if (seen.has(prop.id)) throw ApiError.validation(`道具 id 冲突：${prop.id}`);
      seen.add(prop.id);
      const { file, ...rest } = prop;
      props.push({ ...rest, url: assetUrl(source.id, file) });
    }
  }
  const signature = sources
    .map((source) => `${source.id}@${source.version}`)
    .sort()
    .join(',');
  const version = `packs:${createHash('sha256').update(signature).digest('hex').slice(0, 12)}`;
  return { version, props };
}

export interface PropContentServiceDeps {
  db: DatabaseInstance;
  /** 测试注入：能力包根目录（默认 <dataDir>/capabilities） */
  rootDir?: string;
}

export function createPropContentService(deps: PropContentServiceDeps) {
  const repo = createCapabilityRepository(deps.db);
  const rootDir = deps.rootDir ?? getDataDir('capabilities');

  return {
    /** 每次读取磁盘上的已启用包；安装/停用后下一次请求自然生效 */
    get(): PropContent {
      const sources = repo
        .listEnabled()
        .filter((view) => view.manifest?.kind === 'prop-pack')
        .map((view) => ({
          id: view.id,
          version: view.version,
          payload: readPropPackPayload(join(rootDir, view.id)),
        }));
      return mergePropContent(sources);
    },

    /** 仅服务已启用包且被 payload 声明的资源，防止任意文件读取 */
    readAsset(packId: string, file: string): { buffer: Buffer; contentType: string } {
      const view = repo.get(packId);
      if (!view || view.status !== 'enabled' || view.kind !== 'prop-pack') {
        throw ApiError.notFound('道具包', packId);
      }
      const payload = readPropPackPayload(join(rootDir, packId));
      if (!payload.props.some((prop) => prop.file === file)) {
        throw ApiError.notFound('道具资源', file);
      }
      return {
        buffer: readPropAsset(join(rootDir, packId), file),
        contentType: 'model/gltf-binary',
      };
    },
  };
}
