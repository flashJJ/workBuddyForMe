import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApiError } from '@wbfm/shared/errors';
import type { CapabilityManifest } from '@wbfm/shared/schemas';
import {
  DEFAULT_MOTION_CONTENT,
  motionPackPayloadSchema,
  type MotionPackPayload,
} from '@wbfm/motion';

/** v4.0 M3：动效内容包 payload 文件名固定 */
export const MOTION_PACK_ENTRY = 'payload/motion-pack.json';

export function readMotionPackPayload(packDir: string): MotionPackPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(packDir, MOTION_PACK_ENTRY), 'utf8'));
  } catch (error) {
    throw ApiError.validation(
      `动效内容包 payload 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = motionPackPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.validation(
      `动效内容包 payload 校验失败：${parsed.error.issues.map((issue) => issue.message).join('；')}`,
    );
  }
  return parsed.data;
}

function assertUnique(kind: string, ids: string[], builtin: Set<string>): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw ApiError.validation(`动效内容包 ${kind} id 重复：${id}`);
    if (builtin.has(id)) {
      throw ApiError.validation(`动效内容包 ${kind} id 与内置内容冲突：${id}`);
    }
    seen.add(id);
  }
}

/** 启用：解析 + 去重 + 内置冲突校验；内容本身由能力行状态聚合 */
export function enableMotionPack(
  manifest: CapabilityManifest,
  packDir: string,
): string {
  const payload = readMotionPackPayload(packDir);
  assertUnique(
    '姿势',
    payload.poses.map((item) => item.id),
    new Set(DEFAULT_MOTION_CONTENT.poses.map((item) => item.id)),
  );
  assertUnique(
    '动作',
    payload.motions.map((item) => item.id),
    new Set(DEFAULT_MOTION_CONTENT.motions.map((item) => item.id)),
  );
  assertUnique(
    '行为',
    payload.behaviors.map((item) => item.id),
    new Set(DEFAULT_MOTION_CONTENT.behaviors.map((item) => item.id)),
  );
  return manifest.id;
}

/** 停用：内容聚合按能力行状态过滤，无需额外清理 */
export function disableMotionPack(): void {}
