import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApiError } from '@wbfm/shared/errors';
import {
  scenePackPayloadSchema,
  type CapabilityManifest,
  type ScenePackPayload,
} from '@wbfm/shared/schemas';

/** v4.3 M2：场景包 payload 文件名固定 */
export const SCENE_PACK_ENTRY = 'payload/scene-pack.json';

export function readScenePackPayload(packDir: string): ScenePackPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(packDir, SCENE_PACK_ENTRY), 'utf8'));
  } catch (error) {
    throw ApiError.validation(
      `场景包 payload 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = scenePackPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.validation(
      `场景包 payload 校验失败：${parsed.error.issues.map((issue) => issue.message).join('；')}`,
    );
  }
  return parsed.data;
}

/** 启用：读取 + 校验 payload；跨包冲突由内容聚合层按启用集合检测 */
export function enableScenePack(manifest: CapabilityManifest, packDir: string): string {
  readScenePackPayload(packDir);
  return manifest.id;
}

/** 停用：内容聚合按能力行状态过滤，无需额外清理 */
export function disableScenePack(): void {}
