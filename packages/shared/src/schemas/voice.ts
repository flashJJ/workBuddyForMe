import { z } from 'zod';

/**
 * v1.0 语音/形象/桌宠契约（zod）。
 * 与 packages/voice 的状态机同源概念：这里只放「过线」载荷（API/设置/SSE）。
 */

// ---------- 引擎与输入模式 ----------

export const VOICE_ASR_ENGINES = ['sherpa_onnx', 'none'] as const;
export const VOICE_TTS_ENGINES = ['sherpa_onnx', 'none'] as const;
export const VOICE_INPUT_MODES = ['ptt', 'vad'] as const;

export const voiceAsrEngineSchema = z.enum(VOICE_ASR_ENGINES);
export const voiceTtsEngineSchema = z.enum(VOICE_TTS_ENGINES);
export const voiceInputModeSchema = z.enum(VOICE_INPUT_MODES);
export type VoiceAsrEngine = z.infer<typeof voiceAsrEngineSchema>;
export type VoiceTtsEngine = z.infer<typeof voiceTtsEngineSchema>;
export type VoiceInputMode = z.infer<typeof voiceInputModeSchema>;

/** 语音会话状态（SSE voice_state 载荷）；与 @wbfm/voice 状态机取值一致 */
export const VOICE_STATES = ['idle', 'listening', 'thinking', 'speaking'] as const;
export const voiceStateSchema = z.enum(VOICE_STATES);
export type VoiceState = z.infer<typeof voiceStateSchema>;

// ---------- 语音设置（PATCH 语义，全部可选） ----------

export const voiceSettingsUpdateSchema = z
  .object({
    /** 朗读回复总开关（TTS 自动播放） */
    ttsEnabled: z.boolean().optional(),
    ttsEngine: voiceTtsEngineSchema.optional(),
    /** melo zh_en：0=英文女声 1=中文女声 */
    ttsSpeakerId: z.number().int().min(0).max(20).optional(),
    ttsSpeed: z.number().min(0.5).max(2).optional(),
    ttsNumThreads: z.number().int().min(1).max(32).optional(),
    /** 语音输入开关（麦克风） */
    asrEnabled: z.boolean().optional(),
    asrEngine: voiceAsrEngineSchema.optional(),
    asrNumThreads: z.number().int().min(1).max(32).optional(),
    /** ptt=按住说话；vad=端点检测自动收发（半双工） */
    inputMode: voiceInputModeSchema.optional(),
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
  ttsSpeakerId: true,
  ttsSpeed: true,
  ttsNumThreads: true,
  asrEnabled: true,
  asrEngine: true,
  asrNumThreads: true,
  inputMode: true,
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

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  ttsEnabled: false,
  ttsEngine: 'sherpa_onnx',
  ttsSpeakerId: 1,
  ttsSpeed: 1,
  ttsNumThreads: 4,
  asrEnabled: false,
  asrEngine: 'sherpa_onnx',
  asrNumThreads: 4,
  inputMode: 'ptt',
  vadSilenceMs: 900,
  modelMirrorBase: 'https://hf-mirror.com',
  modelsDir: null,
  avatarEnabled: false,
  avatarModelId: 'shizuku',
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
  speakerId: z.number().int().optional(),
  speed: z.number().min(0.5).max(2).optional(),
});
export type VoiceTtsRequest = z.infer<typeof voiceTtsRequestSchema>;

/** 模型状态查询结果 */
export const voiceModelStatusSchema = z.object({
  asrReady: z.boolean(),
  ttsReady: z.boolean(),
  asrMissing: z.array(z.string()),
  ttsMissing: z.array(z.string()),
  asrTotalBytes: z.number().int(),
  ttsTotalBytes: z.number().int(),
});
export type VoiceModelStatus = z.infer<typeof voiceModelStatusSchema>;
