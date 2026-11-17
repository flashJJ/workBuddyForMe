/**
 * 角色声线绑定与解析（v4.6）。
 *
 * 从 voice.ts 拆出，避免设置契约文件超过行数门禁。
 * 只做纯计算：不读数据库；导入 VRM 的绑定值由调用方通过 override 注入。
 */

/** v1.0 内置 Live2D 模型 id（新增内置模型时追加；未知 id 读取时回落首个） */
export const SUPPORTED_AVATAR_MODEL_IDS = ['haru', 'hiyori', 'mark', 'mao', 'wanko'] as const;
export type SupportedAvatarModelId = (typeof SUPPORTED_AVATAR_MODEL_IDS)[number];
export const DEFAULT_AVATAR_MODEL_ID: SupportedAvatarModelId = 'haru';

/**
 * Kokoro 多说话人 TTS（kokoro-multi-lang-v1_1，共 103 音色，sid 0-102）。
 * sid 对照 sherpa-onnx 官方音色表：
 * https://k2-fsa.github.io/sherpa/onnx/tts/all/Chinese-English/kokoro-multi-lang-v1_1.html
 * 0=af_maple、1=af_sol、2=bf_vale；3-57 为中文女声 zf_*（55 个）；
 * 58-102 为中文男声 zm_*（45 个）。
 *
 * 角色声线绑定（M4.5）：每个内置 Live2D 角色固定一个 sid，服务端合成时按
 * settings.avatarModelId 自动选择，前端无需在对话请求里显式传 speakerId。
 */
export interface AvatarTtsVoice {
  /** voices.bin 中的说话人索引 */
  sid: number;
  /** Kokoro 音色名（与官方音色表一致，用于设置页展示/排查） */
  voice: string;
  /** 性别（仅按官方 zf/zm 前缀归类，用于界面标注，不含主观音色描述） */
  gender: 'female' | 'male';
}

export const AVATAR_TTS_VOICES: Record<SupportedAvatarModelId, AvatarTtsVoice> = {
  // Haru：官方接待员（成熟女性）→ 中文女声 zf_001
  haru: { sid: 3, voice: 'zf_001', gender: 'female' },
  // Hiyori：休闲少女 → 中文女声 zf_026
  hiyori: { sid: 18, voice: 'zf_026', gender: 'female' },
  // Mark：帽衫少年 → 中文男声 zm_009
  mark: { sid: 58, voice: 'zm_009', gender: 'male' },
  // Mao：魔法少女 → 中文女声 zf_049
  mao: { sid: 32, voice: 'zf_049', gender: 'female' },
  // Wanko：柴犬吉祥物（男孩感）→ 中文男声 zm_010
  wanko: { sid: 59, voice: 'zm_010', gender: 'male' },
};

/** 内置 VRM 角色声线（键为 `vrm:` 后的 fileRef）；导入模型未登记时回落默认角色 */
export const BUILTIN_VRM_TTS_VOICES: Readonly<Record<string, AvatarTtsVoice>> = {
  'builtin:xuetuan': { sid: 18, voice: 'zf_026', gender: 'female' },
  'builtin:rankaluli': { sid: 32, voice: 'zf_049', gender: 'female' },
  'builtin:feibi': { sid: 3, voice: 'zf_001', gender: 'female' },
};

/** 声线来源：用户绑定 / 内置 VRM / 内置 Live2D / 默认回落 */
export type AvatarVoiceSource = 'override' | 'builtin-vrm' | 'live2d' | 'default';

export interface ResolvedAvatarVoice extends AvatarTtsVoice {
  source: AvatarVoiceSource;
}

/** 导入 VRM 的用户绑定；null/缺省表示未绑定 */
export interface AvatarVoiceOverride {
  speakerSid?: number | null;
}

function isValidSpeakerSid(sid: number | null | undefined): sid is number {
  return typeof sid === 'number' && Number.isInteger(sid) && sid >= 0 && sid <= 102;
}

/**
 * 角色 → 声线解析唯一入口：
 * 用户绑定 > 内置 VRM > 内置 Live2D > 默认角色（Haru）。
 */
export function resolveAvatarVoice(
  avatarModelId: string | null | undefined,
  override?: AvatarVoiceOverride,
): ResolvedAvatarVoice {
  const overrideSid = override?.speakerSid;
  if (isValidSpeakerSid(overrideSid)) {
    return {
      sid: overrideSid,
      // 自定义绑定不伪造官方音色名，展示层按 source 显示「自定义声线」
      voice: 'custom',
      gender: overrideSid >= 58 ? 'male' : 'female',
      source: 'override',
    };
  }

  const vrm = avatarModelId?.startsWith('vrm:')
    ? BUILTIN_VRM_TTS_VOICES[avatarModelId.slice(4)]
    : undefined;
  if (vrm) return { ...vrm, source: 'builtin-vrm' };

  const live2d = avatarModelId
    ? AVATAR_TTS_VOICES[avatarModelId as SupportedAvatarModelId]
    : undefined;
  if (live2d) return { ...live2d, source: 'live2d' };

  return { ...AVATAR_TTS_VOICES[DEFAULT_AVATAR_MODEL_ID], source: 'default' };
}

/** 角色 → sid；未知/空角色回落默认角色（Haru）的声线 */
export function getAvatarSpeakerId(
  avatarModelId: string | null | undefined,
  override?: AvatarVoiceOverride,
): number {
  return resolveAvatarVoice(avatarModelId, override).sid;
}
