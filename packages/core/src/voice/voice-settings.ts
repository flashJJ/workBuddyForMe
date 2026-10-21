import {
  DEFAULT_AVATAR_MODEL_ID,
  DEFAULT_VOICE_SETTINGS,
  SUPPORTED_AVATAR_MODEL_IDS,
  VOICE_TTS_MODELS,
  isMotionId,
  isVrmAvatarId,
  type VoiceSettings,
  type VoiceSettingsUpdateInput,
} from '@wbfm/shared/schemas';
import {
  BUILTIN_IDLE_MOTION_ID,
  MOTION_ROTATION_SECONDS_MAX,
  MOTION_ROTATION_SECONDS_MIN,
} from '@wbfm/shared/constants';
import type { SettingsRepository } from '@wbfm/database';

const VOICE_SETTINGS_KEY = 'voice';

/** 读取语音设置（与默认值深度合并，旧字段缺失不炸） */
export function readVoiceSettings(settings: SettingsRepository): VoiceSettings {
  const raw = settings.getJson<Partial<VoiceSettings>>(VOICE_SETTINGS_KEY, {});
  const merged: VoiceSettings = { ...DEFAULT_VOICE_SETTINGS, ...raw };
  // v1.0 M3：旧版本默认模型 id（如 shizuku）已下线，读取时归一到受支持的内置模型
  // M4：vrm: 前缀的用户导入 VRM 形象不在内置列表中，放行
  if (
    !merged.avatarModelId ||
    (!(SUPPORTED_AVATAR_MODEL_IDS as readonly string[]).includes(merged.avatarModelId) &&
      !isVrmAvatarId(merged.avatarModelId))
  ) {
    merged.avatarModelId = DEFAULT_AVATAR_MODEL_ID;
  }
  // v2.4 D9：ttsModel 缺省/非法时跟随 DEFAULT_VOICE_SETTINGS（现为 melo），不再硬编码历史默认
  if (!merged.ttsModel || !VOICE_TTS_MODELS.includes(merged.ttsModel)) {
    merged.ttsModel = DEFAULT_VOICE_SETTINGS.ttsModel;
  }
  // v2.0：待机动作 id 仅允许 motion:<fileRef> 或内置默认（null/builtin:daiji）；未知 id 回落 null
  if (
    merged.idleMotionId &&
    !isMotionId(merged.idleMotionId) &&
    merged.idleMotionId !== BUILTIN_IDLE_MOTION_ID
  ) {
    merged.idleMotionId = null;
  }
  // v2.1：轮播开关缺省开启；间隔越界/非整数回落默认
  if (typeof merged.motionRotationEnabled !== 'boolean') {
    merged.motionRotationEnabled = DEFAULT_VOICE_SETTINGS.motionRotationEnabled;
  }
  if (
    !Number.isInteger(merged.motionRotationSeconds) ||
    merged.motionRotationSeconds < MOTION_ROTATION_SECONDS_MIN ||
    merged.motionRotationSeconds > MOTION_ROTATION_SECONDS_MAX
  ) {
    merged.motionRotationSeconds = DEFAULT_VOICE_SETTINGS.motionRotationSeconds;
  }
  return merged;
}

/** 局部更新语音设置（PATCH 语义，未提供字段保留） */
export function patchVoiceSettings(
  settings: SettingsRepository,
  patch: VoiceSettingsUpdateInput,
): VoiceSettings {
  const next = { ...readVoiceSettings(settings), ...patch };
  settings.setJson(VOICE_SETTINGS_KEY, next);
  return next;
}
