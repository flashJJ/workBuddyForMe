import { describe, expect, it } from 'vitest';
import {
  AVATAR_TTS_VOICES,
  BUILTIN_VRM_TTS_VOICES,
  DEFAULT_AVATAR_MODEL_ID,
  DEFAULT_VOICE_SETTINGS,
  SUPPORTED_AVATAR_MODEL_IDS,
  getAvatarSpeakerId,
  parseVrmAvatarId,
  voiceSettingsUpdateSchema,
  voiceTtsRequestSchema,
} from '../../index';
import { BUILTIN_VRM_FILE_REF, BUILTIN_VRM_MODEL_ID, BUILTIN_VRM_MODELS } from '../../constants';

describe('AVATAR_TTS_VOICES 角色声线绑定', () => {
  it('每个内置角色都绑定一个 Kokoro 音色', () => {
    for (const id of SUPPORTED_AVATAR_MODEL_IDS) {
      expect(AVATAR_TTS_VOICES[id]).toBeDefined();
    }
    expect(Object.keys(AVATAR_TTS_VOICES).sort()).toEqual([...SUPPORTED_AVATAR_MODEL_IDS].sort());
  });

  it('sid 全部在 0-102（103 音色）且互不重复', () => {
    const sids = Object.values(AVATAR_TTS_VOICES).map((v) => v.sid);
    for (const sid of sids) {
      expect(Number.isInteger(sid)).toBe(true);
      expect(sid).toBeGreaterThanOrEqual(0);
      expect(sid).toBeLessThanOrEqual(102);
    }
    expect(new Set(sids).size).toBe(sids.length);
  });

  it('音色名前缀与 gender 标注一致（zf=中文女声，zm=中文男声）', () => {
    for (const v of Object.values(AVATAR_TTS_VOICES)) {
      if (v.gender === 'female') expect(v.voice.startsWith('zf_')).toBe(true);
      else expect(v.voice.startsWith('zm_')).toBe(true);
    }
  });

  it('五个角色的绑定与官方音色表一致', () => {
    expect(AVATAR_TTS_VOICES.haru).toMatchObject({ sid: 3, voice: 'zf_001' });
    expect(AVATAR_TTS_VOICES.hiyori).toMatchObject({ sid: 18, voice: 'zf_026' });
    expect(AVATAR_TTS_VOICES.mark).toMatchObject({ sid: 58, voice: 'zm_009' });
    expect(AVATAR_TTS_VOICES.mao).toMatchObject({ sid: 32, voice: 'zf_049' });
    expect(AVATAR_TTS_VOICES.wanko).toMatchObject({ sid: 59, voice: 'zm_010' });
  });
});

describe('内置 VRM', () => {
  it('新用户默认形象为鲸鱼娘-雪团，且 id 可被 VRM 解析', () => {
    expect(DEFAULT_VOICE_SETTINGS.avatarModelId).toBe(BUILTIN_VRM_MODEL_ID);
    expect(parseVrmAvatarId(BUILTIN_VRM_MODEL_ID)).toBe(BUILTIN_VRM_FILE_REF);
  });

  it('每个内置模型都有可解析的 modelId / fileRef 与静态资源路径', () => {
    for (const model of BUILTIN_VRM_MODELS) {
      expect(parseVrmAvatarId(model.modelId)).toBe(model.fileRef);
      expect(model.assetPath.startsWith('/vrm/models/')).toBe(true);
      expect(BUILTIN_VRM_TTS_VOICES[model.fileRef]).toBeDefined();
    }
  });
});

describe('getAvatarSpeakerId', () => {
  it('已知角色返回绑定 sid', () => {
    expect(getAvatarSpeakerId('mark')).toBe(58);
    expect(getAvatarSpeakerId('mao')).toBe(32);
  });

  it('未知/空角色回落默认角色声线', () => {
    const fallback = AVATAR_TTS_VOICES[DEFAULT_AVATAR_MODEL_ID].sid;
    expect(getAvatarSpeakerId(undefined)).toBe(fallback);
    expect(getAvatarSpeakerId(null)).toBe(fallback);
    expect(getAvatarSpeakerId('not-exist')).toBe(fallback);
  });

  it('内置 VRM 角色返回绑定 sid，导入模型回落默认', () => {
    expect(getAvatarSpeakerId('vrm:builtin:xuetuan')).toBe(18);
    expect(getAvatarSpeakerId('vrm:builtin:rankaluli')).toBe(32);
    expect(getAvatarSpeakerId('vrm:builtin:feibi')).toBe(3);
    expect(getAvatarSpeakerId('vrm:vrm-123.vrm')).toBe(
      AVATAR_TTS_VOICES[DEFAULT_AVATAR_MODEL_ID].sid,
    );
  });

  it('全局兜底 ttsSpeakerId 默认值与 Haru 绑定一致', () => {
    expect(DEFAULT_VOICE_SETTINGS.ttsSpeakerId).toBe(AVATAR_TTS_VOICES.haru.sid);
  });
});

describe('sid 契约边界', () => {
  it('设置更新接受 sid 102、拒绝 103', () => {
    expect(voiceSettingsUpdateSchema.safeParse({ ttsSpeakerId: 102 }).success).toBe(true);
    expect(voiceSettingsUpdateSchema.safeParse({ ttsSpeakerId: 103 }).success).toBe(false);
  });

  it('单句合成请求接受 sid 102、拒绝 103', () => {
    expect(voiceTtsRequestSchema.safeParse({ text: 'x', speakerId: 102 }).success).toBe(true);
    expect(voiceTtsRequestSchema.safeParse({ text: 'x', speakerId: -1 }).success).toBe(false);
  });
});
