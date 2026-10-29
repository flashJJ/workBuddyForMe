import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ApiError } from '@wbfm/shared/errors';
import {
  petActionCapabilityPayloadSchema,
  type CapabilityManifest,
} from '@wbfm/shared/schemas';
import type { MotionService } from '../../services/motion-service';

export interface PetActionEffectDeps {
  motions: MotionService;
}

function parsePayload(packDir: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(packDir, 'payload/action.json'), 'utf8'));
  } catch (error) {
    throw ApiError.validation(
      `动作 payload 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = petActionCapabilityPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.validation(
      `动作 payload 校验失败：${parsed.error.issues.map((issue) => issue.message).join('；')}`,
    );
  }
  return parsed.data;
}

/** 启用：双校验 + 落盘 + 落库；entryKey 与既有动作冲突时拒绝 */
export function enablePetAction(
  manifest: CapabilityManifest,
  packDir: string,
  deps: PetActionEffectDeps,
): string {
  const payload = parsePayload(packDir);
  if (payload.entryKey) {
    const conflict = deps.motions.list().some((item) => item.entryKey === payload.entryKey);
    if (conflict) throw ApiError.conflict(`动作条目已存在：${payload.entryKey}`);
  }
  let buffer: Buffer;
  try {
    buffer = readFileSync(join(packDir, payload.file));
  } catch {
    throw ApiError.validation(`动作文件不存在：${payload.file}`);
  }
  const motion = deps.motions.importMotion({
    filename: basename(payload.file),
    buffer: new Uint8Array(buffer),
    name: payload.name,
    source: `capability:${manifest.id}`,
    entryKey: payload.entryKey,
    segment: payload.segment,
    mood: payload.mood,
    minRelationshipLevel: payload.minRelationshipLevel ?? null,
  });
  return motion.id;
}

export function disablePetAction(effectRef: string, deps: PetActionEffectDeps): void {
  try {
    deps.motions.delete(effectRef);
  } catch {
    /* 已不存在视为已撤销 */
  }
}
