import {
  DEFAULT_AVATAR_MODEL_ID,
  DEFAULT_VOICE_SETTINGS,
  SUPPORTED_AVATAR_MODEL_IDS,
  VOICE_TTS_MODELS,
  type VoiceSettings,
  type VoiceSettingsUpdateInput,
} from '@wbfm/shared';
import type { SettingsRepository } from '@wbfm/database';

const VOICE_SETTINGS_KEY = 'voice';

/** 读取语音设置（与默认值深度合并，旧字段缺失不炸） */
export function readVoiceSettings(settings: SettingsRepository): VoiceSettings {
  const raw = settings.getJson<Partial<VoiceSettings>>(VOICE_SETTINGS_KEY, {});
  const merged: VoiceSettings = { ...DEFAULT_VOICE_SETTINGS, ...raw };
  // v1.0 M3：旧版本默认模型 id（如 shizuku）已下线，读取时归一到受支持的内置模型
  if (
    !merged.avatarModelId ||
    !(SUPPORTED_AVATAR_MODEL_IDS as readonly string[]).includes(merged.avatarModelId)
  ) {
    merged.avatarModelId = DEFAULT_AVATAR_MODEL_ID;
  }
  // v1.1：旧库无 ttsModel 字段时默认 Kokoro（与历史默认一致）
  if (!merged.ttsModel || !VOICE_TTS_MODELS.includes(merged.ttsModel)) merged.ttsModel = 'kokoro';
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
