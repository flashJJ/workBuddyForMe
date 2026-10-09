/**
 * M4-VAD 检测器的类型、配置解析与电平纯函数。
 *
 * 与 vad-detector.ts 的状态机拆分：本模块无状态、无 DOM/rAF/定时器，
 * 可确定性地单测；状态机只负责按帧推进相位。
 */

export type VadSensitivity = 'low' | 'balanced' | 'high';

/** 灵敏度 → 起始阈值相对底噪的倍率（越低越灵敏） */
export const SENSITIVITY_START_MULTIPLIER: Record<VadSensitivity, number> = {
  high: 2.6,
  balanced: 3.2,
  low: 3.8,
};

export type VadEvent =
  | 'none'
  | 'candidate'
  | 'candidate-cancel'
  | 'speech-start'
  | 'speech-end'
  | 'discard';

/** 播放回声门控的每帧快照 */
export interface VadGate {
  /** 助手正在播报 TTS */
  speaking: boolean;
  /** 当前处于停播后冷却窗（如 300ms 内） */
  inCooldown: boolean;
}

export interface VadDetectorInput {
  /** 每帧时长 ms（512 样本 @16kHz = 32ms） */
  frameMs?: number;
  /** 启动校准时长：只学底噪不判语音 */
  calibrationMs?: number;
  /** 连续超起始阈值多久才确认说话 */
  speechStartMs?: number;
  /** 短于此时长的语音段丢弃（磕碰/点击） */
  minSpeechMs?: number;
  /** 尾静音多久判一句话结束（用户设置 vadSilenceMs） */
  silenceMs?: number;
  /** 单段语音硬上限，到点强制收尾 */
  maxSpeechMs?: number;
  sensitivity?: VadSensitivity;
  /** 结束阈值 = 底噪 × 该值（小于起始倍率，形成迟滞） */
  stopMultiplier?: number;
  /** 起始/结束阈值的绝对下限（极安静环境不为零阈值误触发） */
  minStartThreshold?: number;
  minStopThreshold?: number;
  /** 底噪初始值与 EMA 参数 */
  noiseFloorInit?: number;
  /** 底噪 EMA 保持系数（新样本权重 = 1 - alpha） */
  noiseEmaAlpha?: number;
  /** 瞬时 RMS 先 clamp 到 底噪×该值，防巨响抬高底噪 */
  noiseClampMultiplier?: number;
  /** 播报中起始阈值额外倍率与确认时长 */
  playbackThresholdScale?: number;
  playbackStartMs?: number;
}

export interface ResolvedVadConfig {
  frameMs: number;
  calibrationMs: number;
  speechStartMs: number;
  minSpeechMs: number;
  silenceMs: number;
  maxSpeechMs: number;
  startMultiplier: number;
  stopMultiplier: number;
  minStartThreshold: number;
  minStopThreshold: number;
  noiseFloorInit: number;
  noiseEmaAlpha: number;
  noiseClampMultiplier: number;
  playbackThresholdScale: number;
  playbackStartMs: number;
}

export interface VadFrameInput {
  /** 本帧 RMS（0~1） */
  rms: number;
  /** 覆盖默认帧时长（测试用） */
  ms?: number;
  /** 播放门控快照；缺省按完全空闲处理 */
  gate?: VadGate;
}

export const DEFAULT_VAD_CONFIG: ResolvedVadConfig = {
  frameMs: 32,
  calibrationMs: 800,
  speechStartMs: 240,
  minSpeechMs: 320,
  silenceMs: 600,
  maxSpeechMs: 30_000,
  startMultiplier: SENSITIVITY_START_MULTIPLIER.balanced,
  stopMultiplier: 1.8,
  minStartThreshold: 0.025,
  minStopThreshold: 0.015,
  noiseFloorInit: 0.008,
  noiseEmaAlpha: 0.94,
  noiseClampMultiplier: 2.5,
  playbackThresholdScale: 2.2,
  playbackStartMs: 600,
};

/** 合并用户/调用方配置；sensitivity 翻译为 startMultiplier */
export function resolveVadConfig(input: VadDetectorInput = {}): ResolvedVadConfig {
  const { sensitivity, ...rest } = input;
  return {
    ...DEFAULT_VAD_CONFIG,
    ...rest,
    startMultiplier:
      sensitivity !== undefined
        ? SENSITIVITY_START_MULTIPLIER[sensitivity]
        : DEFAULT_VAD_CONFIG.startMultiplier,
  };
}

/** 瞬时电平收敛：NaN 视为静音，并 clamp 到 [0,1] */
export function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
