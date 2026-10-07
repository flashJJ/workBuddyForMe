/**
 * v1.0 语音引擎抽象层。
 *
 * 设计原则：
 * - 引擎只做「文本/音频」转换，不感知 HTTP、SSE、会话与 UI；
 * - 所有实现都必须可被 mock（构造函数注入配置，无全局单例）；
 * - v1.0 仅提供本地 sherpa-onnx 实现，云厂商只预留接口不实现。
 */

/** ASR 识别结果。 */
export interface AsrResult {
  /** 识别出的文本（去除首尾空白），无语音时为空串 */
  text: string;
  /** 引擎自报的音频语言（如 'zh'）；不支持时为 null */
  lang: string | null;
}

/** TTS 合成结果：PCM 采样 + 采样率，交由调用方决定封装格式。 */
export interface TtsResult {
  /** 单声道 float32 PCM，范围 [-1, 1] */
  samples: Float32Array;
  sampleRate: number;
}

export interface AsrEngineConfig {
  /** 模型根目录（含模型文件与 tokens.txt） */
  modelDir: string;
  /** 计算线程数 */
  numThreads?: number;
  /** 推理提供方：v1 仅 'cpu'（预留 'cuda'） */
  provider?: 'cpu' | 'cuda';
}

export interface TtsEngineConfig {
  /** 模型根目录 */
  modelDir: string;
  /** 默认说话人 ID（请求未显式指定时使用） */
  speakerId?: number;
  /** 语速倍率，1.0 为正常 */
  speed?: number;
  numThreads?: number;
  provider?: 'cpu' | 'cuda';
  /**
   * Kokoro 多说话人模型额外配置（存在则走 Kokoro 前端，否则按 MeloTTS VITS）。
   * lexicon/ruleFsts 为逗号分隔的绝对路径字符串（与 sherpa C API 一致）。
   */
  kokoro?: {
    /** 说话人嵌入库（voices.bin） */
    voices: string;
    /** espeak-ng-data 目录（多语种 g2p，Kokoro 强制要求） */
    dataDir: string;
    /** 逗号分隔的词典绝对路径（如 英文,中文） */
    lexicon: string;
    /** 逗号分隔的文本规整 FST（日期/数字/拼音） */
    ruleFsts?: string;
  };
}

/** 单次合成选项：可逐句切换说话人（多说话人 TTS 按角色配音） */
export interface TtsSynthOptions {
  speakerId?: number;
}

/** 语音识别引擎接口（离线/在线实现共同遵守）。 */
export interface AsrEngine {
  /**
   * 识别 16kHz 单声道 PCM。
   * @param samples float32 PCM（16kHz、单声道）
   */
  transcribe(samples: Float32Array): Promise<AsrResult>;
  /** 释放原生资源；重复调用必须安全 */
  dispose(): Promise<void>;
}

/** 语音合成引擎接口（离线/在线实现共同遵守）。 */
export interface TtsEngine {
  /** 合成一句/一段文本为 PCM；opts.speakerId 可逐句切换说话人 */
  synthesize(text: string, opts?: TtsSynthOptions): Promise<TtsResult>;
  dispose(): Promise<void>;
}

/** 引擎工厂：按配置惰性构造，失败时抛出带引擎名的错误。 */
export type AsrEngineFactory = (config: AsrEngineConfig) => Promise<AsrEngine>;
export type TtsEngineFactory = (config: TtsEngineConfig) => Promise<TtsEngine>;

/** 引擎未就绪/模型缺失等可预期错误的统一类型，便于上层引导用户。 */
export class VoiceEngineError extends Error {
  constructor(
    public readonly engine: 'asr' | 'tts',
    message: string,
    public readonly hint?: string,
  ) {
    super(`[voice:${engine}] ${message}`);
    this.name = 'VoiceEngineError';
  }
}
