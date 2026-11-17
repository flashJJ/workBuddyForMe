import type { DatabaseInstance } from '@wbfm/database';
import { parseVrmAvatarId, type AvatarVoiceOverride } from '@wbfm/shared/schemas';

/**
 * 导入 VRM 的用户声线绑定；内置 VRM/Live2D 不查库。
 * 表缺失（迁移前）或查询异常时按未绑定处理，不影响朗读。
 */
export function readVrmVoiceOverride(
  db: DatabaseInstance,
  avatarModelId: string,
): AvatarVoiceOverride | undefined {
  const fileRef = parseVrmAvatarId(avatarModelId);
  if (!fileRef || fileRef.startsWith('builtin:')) return undefined;
  try {
    const row = db
      .prepare('SELECT voice_sid FROM vrm_avatars WHERE file_ref = ?')
      .get(fileRef) as { voice_sid: number | null } | undefined;
    return row && row.voice_sid !== null ? { speakerSid: row.voice_sid } : undefined;
  } catch {
    return undefined;
  }
}
