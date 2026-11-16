/**
 * v4.3 M2：场景包 payload。
 *
 * 场景包只声明式组合现有 Scene / Beat / Cue，不携带脚本代码；
 * id 强制 `pack.` 前缀，与内置场景（touch/moment/ambient/state/pool/gen）命名空间隔离。
 */

import { z } from 'zod';
import { sceneSchema } from './scene';

export const SCENE_PACK_SCENE_ID_PREFIX = 'pack.';
export const SCENE_PACK_MAX_SCENES = 50;

export const scenePackPayloadSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().max(200).default(''),
    scenes: z
      .array(sceneSchema)
      .min(1, '至少包含 1 场场景')
      .max(SCENE_PACK_MAX_SCENES, `最多 ${SCENE_PACK_MAX_SCENES} 场场景`),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.scenes.forEach((scene, index) => {
      if (!scene.id.startsWith(SCENE_PACK_SCENE_ID_PREFIX)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scenes', index, 'id'],
          message: `场景 id 必须以 ${SCENE_PACK_SCENE_ID_PREFIX} 开头`,
        });
      }
      if (seen.has(scene.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scenes', index, 'id'],
          message: `场景 id 重复：${scene.id}`,
        });
      }
      seen.add(scene.id);
    });
  });

export type ScenePackPayload = z.infer<typeof scenePackPayloadSchema>;
