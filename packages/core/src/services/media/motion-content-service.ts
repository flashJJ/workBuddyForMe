import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { getDataDir } from '@wbfm/config';
import { createCapabilityRepository, type DatabaseInstance } from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';
import {
  DEFAULT_MOTION_CONTENT,
  type MotionContent,
  type MotionPackPayload,
} from '@wbfm/motion';
import { readMotionPackPayload } from '../../capabilities/effects/motion-pack';

/** v4.0 M4：聚合已启用的 motion-pack，生成会话级内容快照 */

export interface MotionPackSource {
  id: string;
  version: string;
  payload: MotionPackPayload;
}

function appendUnique<T extends { id: string }>(
  target: T[],
  items: readonly T[],
  label: string,
): void {
  const seen = new Set(target.map((item) => item.id));
  for (const item of items) {
    if (seen.has(item.id)) throw ApiError.validation(`${label} id 冲突：${item.id}`);
    seen.add(item.id);
    target.push(item);
  }
}

/** 默认内容 + 已启用包；没有包时直接返回默认快照（同引用） */
export function mergeMotionContent(
  sources: readonly MotionPackSource[],
  base: MotionContent = DEFAULT_MOTION_CONTENT,
): MotionContent {
  if (sources.length === 0) return base;
  const poses = [...base.poses];
  const motions = [...base.motions];
  const behaviors = [...base.behaviors];
  for (const source of sources) {
    appendUnique(poses, source.payload.poses, '姿势');
    appendUnique(motions, source.payload.motions, '动作');
    appendUnique(behaviors, source.payload.behaviors, '行为');
  }
  const signature = sources
    .map((source) => `${source.id}@${source.version}`)
    .sort()
    .join(',');
  const version = `packs:${createHash('sha256').update(signature).digest('hex').slice(0, 12)}`;
  return { version, poses, motions, behaviors };
}

export interface MotionContentServiceDeps {
  db: DatabaseInstance;
  /** 测试注入：能力包根目录（默认 <dataDir>/capabilities） */
  rootDir?: string;
}

export function createMotionContentService(deps: MotionContentServiceDeps) {
  const repo = createCapabilityRepository(deps.db);
  const rootDir = deps.rootDir ?? getDataDir('capabilities');

  return {
    /** 每次读取磁盘上的已启用包；安装/停用后下一次请求自然生效 */
    get(): MotionContent {
      const sources = repo
        .listEnabled()
        .filter((view) => view.manifest?.kind === 'motion-pack')
        .map((view) => ({
          id: view.id,
          version: view.version,
          payload: readMotionPackPayload(join(rootDir, view.id)),
        }));
      return mergeMotionContent(sources);
    },
  };
}
