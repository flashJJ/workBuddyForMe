import { DEFAULT_VOICE_SETTINGS, type VoiceSettings, type VoiceSettingsUpdateInput } from '@wbfm/shared';
import type { SettingsRepository } from '@wbfm/database';

const VOICE_SETTINGS_KEY = 'voice';

/** 读取语音设置（与默认值深度合并，旧字段缺失不炸） */
export function readVoiceSettings(settings: SettingsRepository): VoiceSettings {
  const raw = settings.getJson<Partial<VoiceSettings>>(VOICE_SETTINGS_KEY, {});
  return { ...DEFAULT_VOICE_SETTINGS, ...raw };
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
