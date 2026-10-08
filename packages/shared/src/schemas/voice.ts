import { z } from 'zod';

/**
 * v1.0 语音/形象/桌宠契约（zod）。
 * 与 packages/voice 的状态机同源概念：这里只放「过线」载荷（API/设置/SSE）。
 */

// ---------- 引擎与输入模式 ----------

/** ASR 引擎：目前仅 sherpa-onnx 本地推理；none=关闭识别 */
export const VOICE_ASR_ENGINES = ['sherpa_onnx', 'none'] as const;
/** TTS 引擎：目前仅 sherpa-onnx 本地推理；none=关闭朗读 */
export const VOICE_TTS_ENGINES = ['sherpa_onnx', 'none'] as const;
/** 朗读模型：melo=单声低延迟（VITS 中英）；kokoro=多角色声线 */
export const VOICE_TTS_MODELS = ['melo', 'kokoro'] as const;
/** 语音输入模式：ptt=按住说话；vad=免手持续聆听（半双工） */
export const VOICE_INPUT_MODES = ['ptt', 'vad'] as const;
/** M4 免手聆听灵敏度：影响 VAD 起始阈值相对底噪的倍率（2.6/3.2/3.8） */
export const VAD_SENSITIVITIES = ['high', 'balanced', 'low'] as const;

export const voiceAsrEngineSchema = z.enum(VOICE_ASR_ENGINES);
export const voiceTtsEngineSchema = z.enum(VOICE_TTS_ENGINES);
export const voiceTtsModelSchema = z.enum(VOICE_TTS_MODELS);
export const voiceInputModeSchema = z.enum(VOICE_INPUT_MODES);
export const vadSensitivitySchema = z.enum(VAD_SENSITIVITIES);
export type VoiceAsrEngine = z.infer<typeof voiceAsrEngineSchema>;
export type VoiceTtsEngine = z.infer<typeof voiceTtsEngineSchema>;
export type VoiceTtsModel = z.infer<typeof voiceTtsModelSchema>;
export type VoiceInputMode = z.infer<typeof voiceInputModeSchema>;
export type VadSensitivity = z.infer<typeof vadSensitivitySchema>;

/** 语音会话状态（SSE voice_state 载荷）；与 @wbfm/voice 状态机取值一致 */
export const VOICE_STATES = ['idle', 'listening', 'thinking', 'speaking'] as const;
export const voiceStateSchema = z.enum(VOICE_STATES);
export type VoiceState = z.infer<typeof voiceStateSchema>;

// ---------- 语音设置（PATCH 语义，全部可选） ----------

export const voiceSettingsUpdateSchema = z
  .object({
    /** 朗读回复总开关（TTS 自动播放） */
    /** 朗读开关与合成器（保留：未来云 TTS 扩展点） */
    ttsEnabled: z.boolean().optional(),
    ttsEngine: voiceTtsEngineSchema.optional(),
    /** v1.1：朗读模型（melo=单声低延迟，kokoro=多角色声线）；旧库缺省回落 kokoro */
    ttsModel: voiceTtsModelSchema.optional(),
    /**
     * 兜底发音人 sid（Kokoro 103 音色，范围 0-102）。
     * 正常对话按 avatarModelId 绑定的角色声线合成（见 AVATAR_TTS_VOICES），
     * 此值仅用于无角色上下文的试听/未知角色回落。
     */
    ttsSpeakerId: z.number().int().min(0).max(102).optional(),
    ttsSpeed: z.number().min(0.5).max(2).optional(),
    ttsNumThreads: z.number().int().min(1).max(32).optional(),
    /** 语音输入开关（麦克风） */
    asrEnabled: z.boolean().optional(),
    asrEngine: voiceAsrEngineSchema.optional(),
    asrNumThreads: z.number().int().min(1).max(32).optional(),
    /** ptt=按住说话；vad=端点检测自动收发（半双工） */
    inputMode: voiceInputModeSchema.optional(),
    /** M4 VAD 起始灵敏度（高/均衡/低） */
    vadSensitivity: vadSensitivitySchema.optional(),
    /** VAD 静音判定毫秒（vad 模式） */
    vadSilenceMs: z.number().int().min(300).max(5000).optional(),
    /** 模型下载镜像（默认 hf-mirror） */
    modelMirrorBase: z.string().url().nullable().optional(),
    /** 自定义模型目录（留空用 userData 默认目录） */
    modelsDir: z.string().max(1024).nullable().optional(),
    /** 对话页显示 Live2D 形象 */
    avatarEnabled: z.boolean().optional(),
    /** Live2D 模型标识（v1 仅内置 1 套） */
    avatarModelId: z.string().max(128).optional(),
    /** 桌宠模式开关 */
    petEnabled: z.boolean().optional(),
    /** 桌宠默认鼠标穿透 */
    petClickThrough: z.boolean().optional(),
    /** AI 主动说话（P1） */
    proactiveEnabled: z.boolean().optional(),
    proactiveIdleSeconds: z.number().int().min(30).max(3600).optional(),
  })
  .strict();
export type VoiceSettingsUpdateInput = z.infer<typeof voiceSettingsUpdateSchema>;

/** 服务端回传的完整语音设置（带默认值） */
export const voiceSettingsSchema = voiceSettingsUpdateSchema.required({
  ttsEnabled: true,
  ttsEngine: true,
  ttsModel: true,
  ttsSpeakerId: true,
  ttsSpeed: true,
  ttsNumThreads: true,
  asrEnabled: true,
  asrEngine: true,
  asrNumThreads: true,
  inputMode: true,
  vadSensitivity: true,
  vadSilenceMs: true,
  modelMirrorBase: true,
  modelsDir: true,
  avatarEnabled: true,
  avatarModelId: true,
  petEnabled: true,
  petClickThrough: true,
  proactiveEnabled: true,
  proactiveIdleSeconds: true,
});
export type VoiceSettings = z.infer<typeof voiceSettingsSchema>;

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

/** 角色 → sid；未知/空角色回落默认角色（Haru）的声线 */
export function getAvatarSpeakerId(
  avatarModelId: string | null | undefined,
): number {
  const voice =
    AVATAR_TTS_VOICES[avatarModelId as SupportedAvatarModelId] ??
    AVATAR_TTS_VOICES[DEFAULT_AVATAR_MODEL_ID];
  return voice.sid;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  ttsEnabled: false,
  ttsEngine: 'sherpa_onnx',
  // v1.1 默认沿用 Kokoro 多角色声线；melo 为单声低延迟备选（设置页可切）
  ttsModel: 'kokoro',
  // 兜底 sid：Haru 绑定的 zf_001（对话合成默认走角色绑定，见 AVATAR_TTS_VOICES）
  ttsSpeakerId: 3,
  ttsSpeed: 1,
  ttsNumThreads: 4,
  asrEnabled: false,
  asrEngine: 'sherpa_onnx',
  asrNumThreads: 4,
  inputMode: 'ptt',
  vadSensitivity: 'balanced',
  // 免手跟手优先：600ms 尾静音（设置面板提供 600-1500 档，易被停顿打断可调大）
  vadSilenceMs: 600,
  modelMirrorBase: 'https://hf-mirror.com',
  modelsDir: null,
  avatarEnabled: false,
  avatarModelId: DEFAULT_AVATAR_MODEL_ID,
  petEnabled: false,
  petClickThrough: false,
  proactiveEnabled: false,
  proactiveIdleSeconds: 300,
};

// ---------- HTTP 载荷 ----------

/** POST /api/voice/asr 请求体（multipart 字段的 JSON 侧描述，供文档/校验复用） */
export const voiceAsrRequestSchema = z.object({
  /** WAV 字节（路由层从 multipart 取，此 schema 描述契约） */
  sampleRate: z.number().int().min(8000).max(48000),
});
export type VoiceAsrRequest = z.infer<typeof voiceAsrRequestSchema>;

export const voiceAsrResponseSchema = z.object({
  text: z.string(),
  lang: z.string().nullable(),
});
export type VoiceAsrResponse = z.infer<typeof voiceAsrResponseSchema>;

/** POST /api/voice/tts（单句合成，非流式调试/回放用） */
export const voiceTtsRequestSchema = z.object({
  text: z.string().min(1).max(2000),
  /** 角色试听显式指定音色；缺省服务端按当前 avatarModelId 绑定解析 */
  speakerId: z.number().int().min(0).max(102).optional(),
  speed: z.number().min(0.5).max(2).optional(),
});
export type VoiceTtsRequest = z.infer<typeof voiceTtsRequestSchema>;

/** 单个模型的下载/持久状态（GET models/status 的 downloads[kind]） */
export const voiceModelDownloadSchema = z.object({
  /** 是否存在活动下载任务 */
  active: z.boolean(),
  /** 与 voice_models 表 CHECK 约束一致 */
  status: z.enum(['missing', 'downloading', 'ready', 'error']),
  bytesTotal: z.number().int(),
  bytesDone: z.number().int(),
  error: z.string().nullable(),
});
export type VoiceModelDownload = z.infer<typeof voiceModelDownloadSchema>;

/** 模型文件齐备性（磁盘 stat 结果）。tts 状态以当前选中模型为准，另附两套引擎明细 */
export const voiceModelFileStatusSchema = z.object({
  asrReady: z.boolean(),
  ttsReady: z.boolean(),
  asrMissing: z.array(z.string()),
  ttsMissing: z.array(z.string()),
  asrTotalBytes: z.number().int(),
  ttsTotalBytes: z.number().int(),
  /** 当前选中的 TTS 模型 */
  activeTtsModel: z.enum(VOICE_TTS_MODELS),
  /** 两套 TTS 各自的文件就绪情况（供设置页下载引导） */
  ttsModels: z.array(
    z.object({
      model: z.enum(VOICE_TTS_MODELS),
      label: z.string(),
      totalBytes: z.number().int(),
      ready: z.boolean(),
      missing: z.array(z.string()),
    }),
  ),
});
export type VoiceModelFileStatus = z.infer<typeof voiceModelFileStatusSchema>;

/** 模型状态查询结果（文件齐备性 + 下载任务状态）。tts 按模型分别上报。 */
export const voiceModelStatusSchema = voiceModelFileStatusSchema.extend({
  downloads: z.object({
    asr: voiceModelDownloadSchema,
    /** 当前选中 TTS 模型的下载任务（旧消费端兼容入口） */
    tts: voiceModelDownloadSchema,
    /** 两套 TTS 引擎各自的下载任务，key 为 VOICE_TTS_MODELS */
    ttsByModel: z.record(voiceModelDownloadSchema),
  }),
});
export type VoiceModelStatus = z.infer<typeof voiceModelStatusSchema>;
