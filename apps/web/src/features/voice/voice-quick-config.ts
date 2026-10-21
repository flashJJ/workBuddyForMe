import type { VadSensitivity, VoiceSettings } from '@wbfm/shared/schemas';

/**
 * v2.4 M3（P0-3）· 语音「人话档位」→ VAD 参数的映射（M0 §4 冻结值）。
 *
 * 默认路径只暴露两档（设置页与对话页入口共用）；原「灵敏度三档 × 尾静音四档」
 * 退到「高级」折叠区单独可调。纯常量 + 纯函数，无 React/DOM 依赖，便于单测。
 */

export type VoiceProfileId = 'fast' | 'tolerant';

export interface VoiceProfile {
  /** 映射到的 VAD 起始灵敏度（vad-config 的 SENSITIVITY_START_MULTIPLIER 键） */
  vadSensitivity: VadSensitivity;
  /** 映射到的尾静音判定毫秒 */
  vadSilenceMs: number;
}

/**
 * M0 §4 冻结：
 * - 反应快 = `balanced` + 600ms（小停顿即认为说完；耳机 / 安静环境）
 * - 更宽容 = `low`   + 1200ms（外放 / 嘈杂环境，减少误触发）
 */
export const VOICE_PROFILES: Record<VoiceProfileId, VoiceProfile> = {
  fast: { vadSensitivity: 'balanced', vadSilenceMs: 600 },
  tolerant: { vadSensitivity: 'low', vadSilenceMs: 1200 },
};

/** 默认档位（M0 §4 默认「反应快」；与 DEFAULT_VOICE_SETTINGS 的 balanced/600 一致） */
export const DEFAULT_VOICE_PROFILE: VoiceProfileId = 'fast';

/** 两档的设置补丁（一键开启 / 档位切换用，成对写入避免只改一半） */
export function profilePatch(id: VoiceProfileId): VoiceProfile {
  return { ...VOICE_PROFILES[id] };
}

/**
 * 反查当前设置落在哪一档；两档之外（用户用高级区的灵敏度/尾静音自定义过）返回 null，
 * 供 UI 显示「自定义」而不强行归并到某一档。
 */
export function profileOf(
  settings: Pick<VoiceSettings, 'vadSensitivity' | 'vadSilenceMs'>,
): VoiceProfileId | null {
  const entries = Object.entries(VOICE_PROFILES) as Array<[VoiceProfileId, VoiceProfile]>;
  const hit = entries.find(
    ([, profile]) =>
      profile.vadSensitivity === settings.vadSensitivity &&
      profile.vadSilenceMs === settings.vadSilenceMs,
  );
  return hit ? hit[0] : null;
}
