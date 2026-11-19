import { DEFAULT_AVATAR_MODEL_ID, SUPPORTED_AVATAR_MODEL_IDS } from '../media/voice';

/** 模型 id 白名单归一：未知/空值回落默认 haru（与 web 端 getAvatarModel 同语义）。
 * v2.0 额外放行 `vrm:` 前缀的动态 VRM avatar 文件 id（每个导入的用户 VRM 都是独立 fileRef，
 * 白名单里无法预先枚举；web 端 getAvatarModel 与 isVrmAvatarId 也用同样前缀约定）。 */
export function normalizeAvatarModelId(id: unknown): string {
  if (typeof id !== 'string') return DEFAULT_AVATAR_MODEL_ID;
  if ((SUPPORTED_AVATAR_MODEL_IDS as readonly string[]).includes(id)) return id;
  if (id.startsWith('vrm:')) return id;
  return DEFAULT_AVATAR_MODEL_ID;
}
