import { z } from 'zod';
import {
  BUILTIN_VRM_MODEL_ID,
  MOTION_ROTATION_SECONDS_DEFAULT,
  MOTION_ROTATION_SECONDS_MAX,
  MOTION_ROTATION_SECONDS_MIN,
} from '../../constants/index';

/**
 * v1.0 语音/形象/桌宠契约（zod）。
 * 与 packages/voice 的状态机同源概念：这里只放「过线」载荷（API/设置/SSE）。
 */

// ---------- 引擎与输入模式 ----------

/** ASR 引擎：目前仅 sherpa-onnx 本地推理；none=关闭识别 */
export const VOICE_ASR_ENGINES = ['sherpa_onnx', 'none'] as const;
/** TTS 引擎：sherpa-onnx 本地推理 / tencent 腾讯云在线 / none=关闭朗读 */
export const VOICE_TTS_ENGINES = ['sherpa_onnx', 'tencent', 'none'] as const;
/** 朗读模型：melo=单声低延迟（VITS 中英）；kokoro=多角色声线；matcha=快速单声 */
export const VOICE_TTS_MODELS = ['melo', 'kokoro', 'matcha'] as const;
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
    /** 腾讯云 TTS 地域（如 ap-guangzhou） */
    tencentRegion: z.string().min(1).max(32).optional(),
    /** 腾讯云音色 ID（基础/精品/大模型；默认 101001） */
    tencentVoiceType: z.number().int().min(0).max(10_000_000).optional(),
    /** 腾讯云模型类型（当前接口仅支持 1） */
    tencentModelType: z.number().int().min(1).max(1).optional(),
    /** 腾讯云返回采样率（部分音色支持 24k，默认 16k） */
    tencentSampleRate: z.union([z.literal(8000), z.literal(16000), z.literal(24000)]).optional(),
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
    petSize: z.enum(['sm', 'md', 'lg']).optional(),
    /** v3.0 P4：Q 版（头身比放大 + 腿缩短；仅 VRM） */
    avatarChibi: z.boolean().optional(),
    /** AI 主动说话（P1） */
    proactiveEnabled: z.boolean().optional(),
    proactiveIdleSeconds: z.number().int().min(30).max(3600).optional(),
    /**
     * v2.0 待机动作（VRMA）id：motion:<fileRef> 为用户导入动作；
     * null/缺省表示内置默认待机动作（daiji）。
     */
    idleMotionId: z.string().max(200).nullable().optional(),
    /** v2.1 待机动作自动轮播开关（在动作池里随机切换） */
    motionRotationEnabled: z.boolean().optional(),
    /** v2.1 待机动作轮播间隔（秒，3-60） */
    motionRotationSeconds: z
      .number()
      .int()
      .min(MOTION_ROTATION_SECONDS_MIN)
      .max(MOTION_ROTATION_SECONDS_MAX)
      .optional(),
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
  tencentRegion: true,
  tencentVoiceType: true,
  tencentModelType: true,
  tencentSampleRate: true,
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
  petSize: true,
  avatarChibi: true,
  proactiveEnabled: true,
  proactiveIdleSeconds: true,
  idleMotionId: true,
  motionRotationEnabled: true,
  motionRotationSeconds: true,
});
export type VoiceSettings = z.infer<typeof voiceSettingsSchema>;

// 角色声线绑定与解析已拆到 voice/profiles.ts（v4.6），此处保持原导出路径不变。
export {
  SUPPORTED_AVATAR_MODEL_IDS,
  DEFAULT_AVATAR_MODEL_ID,
  AVATAR_TTS_VOICES,
  BUILTIN_VRM_TTS_VOICES,
  KOKORO_VOICE_OPTIONS,
  resolveAvatarVoice,
  getAvatarSpeakerId,
} from './voice/profiles';
export type {
  SupportedAvatarModelId,
  AvatarTtsVoice,
  AvatarVoiceSource,
  ResolvedAvatarVoice,
  AvatarVoiceOverride,
  KokoroVoiceOption,
} from './voice/profiles';

// M4：VRM 形象 id 以 vrm: 为前缀，不在内置列表中

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  ttsEnabled: false,
  ttsEngine: 'sherpa_onnx',
  // v2.4 D9：默认 MeloTTS（191MB，单声低延迟，首启成本与首字延迟优先）；
  // Kokoro（394MB / 103 音色）作为「更多音色」可选，设置页可切。
  ttsModel: 'melo',
  // 兜底 sid：Haru 绑定的 zf_001（对话合成默认走角色绑定，见 AVATAR_TTS_VOICES）
  ttsSpeakerId: 3,
  ttsSpeed: 1,
  ttsNumThreads: 4,
  tencentRegion: 'ap-guangzhou',
  tencentVoiceType: 101001,
  tencentModelType: 1,
  tencentSampleRate: 16000,
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
  // v3.0：新用户默认形象为内置鲸鱼娘-雪团 VRM（老用户已存的值不受影响）
  avatarModelId: BUILTIN_VRM_MODEL_ID,
  petEnabled: false,
  petClickThrough: false,
  petSize: 'md',
  avatarChibi: false,
  proactiveEnabled: false,
  proactiveIdleSeconds: 300,
  // v2.0：缺省内置默认待机动作（null 表示内置 daiji）
  idleMotionId: null,
  // v2.1：默认开启待机动作轮播，8 秒随机切换一个动作
  motionRotationEnabled: true,
  motionRotationSeconds: MOTION_ROTATION_SECONDS_DEFAULT,
};

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

// ---------- 在线 TTS 凭据（write-only；读接口只返回脱敏状态） ----------

export const voiceCloudCredentialsUpdateSchema = z
  .object({
    secretId: z.string().min(1).max(256).optional(),
    secretKey: z.string().min(1).max(512).optional(),
    region: z.string().min(1).max(64).optional(),
    /** 清除已保存凭据（优先于本次提交的字段） */
    clear: z.boolean().optional(),
  })
  .strict();
export type VoiceCloudCredentialsUpdateInput = z.infer<typeof voiceCloudCredentialsUpdateSchema>;

export const voiceCloudCredentialsViewSchema = z.object({
  hasCredentials: z.boolean(),
  maskedSecretId: z.string().nullable(),
  region: z.string(),
});
export type VoiceCloudCredentialsView = z.infer<typeof voiceCloudCredentialsViewSchema>;

// v2.25：PTT 识别文本润色（独立子域，避免语音设置 schema 持续膨胀）
export * from './polish';
