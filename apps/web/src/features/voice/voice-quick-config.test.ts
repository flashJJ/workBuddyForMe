import { describe, expect, it } from 'vitest';
import { DEFAULT_VOICE_SETTINGS } from '@wbfm/shared/schemas';
import {
  DEFAULT_VOICE_PROFILE,
  VOICE_PROFILES,
  profileOf,
  profilePatch,
} from './voice-quick-config';

/**
 * v2.4 M3（P0-3/T5）· 档位口径回归：两档取值必须与 M0 §4 冻结值一致，
 * 且服务端默认设置必须落在默认档（保证「默认即可用」，验收 A3）。
 */
describe('语音档位 → VAD 参数（M0 §4 冻结值）', () => {
  it('反应快 = 均衡 + 600ms；更宽容 = 低灵敏度 + 1200ms', () => {
    expect(VOICE_PROFILES.fast).toEqual({ vadSensitivity: 'balanced', vadSilenceMs: 600 });
    expect(VOICE_PROFILES.tolerant).toEqual({ vadSensitivity: 'low', vadSilenceMs: 1200 });
  });

  it('默认档为「反应快」，且与 DEFAULT_VOICE_SETTINGS 一致', () => {
    expect(DEFAULT_VOICE_PROFILE).toBe('fast');
    expect(profileOf(DEFAULT_VOICE_SETTINGS)).toBe('fast');
  });

  it('profileOf 能反查两档；两档之外（自定义）返回 null', () => {
    expect(profileOf({ vadSensitivity: 'low', vadSilenceMs: 1200 })).toBe('tolerant');
    // 高级区自定义：不归并到任何一档
    expect(profileOf({ vadSensitivity: 'high', vadSilenceMs: 1500 })).toBeNull();
    // 只对了一半（旧默认 900ms）也算自定义
    expect(profileOf({ vadSensitivity: 'balanced', vadSilenceMs: 900 })).toBeNull();
  });

  it('profilePatch 返回副本，改动不外泄到冻结常量', () => {
    const patch = profilePatch('fast');
    patch.vadSilenceMs = 9999;
    expect(VOICE_PROFILES.fast.vadSilenceMs).toBe(600);
  });
});
