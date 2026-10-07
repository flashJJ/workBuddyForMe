/**
 * M4-VAD 能量端点检测器（纯函数，无 DOM/rAF/定时器）。
 *
 * 时钟来自音频帧本身：AudioWorklet 每 512 样本@16k 产一帧 32ms，
 * 因此后台标签 rAF 节流不影响判定，测试也可确定性地喂 RMS 序列。
 *
 * 半双工回声门控（不做声学 AEC）：
 * - 助手播报时起始阈值放大、确认时长拉长（回声要"更响更久"才被当成人声）；
 * - 停播后冷却窗内 RMS 按 0 处理，屏蔽声学拖尾。
 * 门控状态由调用方每帧随 sample() 传入，检测器不感知播放实现。
 *
 * 算法参照开源陪伴项目 virtual-person 的 VadDetector（真机验证过），
 * 并将输入时钟改为音频帧时长、参数收敛到构造配置唯一入口。
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
  /** 当前处于停播后冷却窗（如 500ms 内） */
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
  silenceMs: 900,
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

type Phase = 'calibrating' | 'idle' | 'candidate' | 'speech';

export class VadDetector {
  private readonly cfg: ResolvedVadConfig;
  private phase: Phase = 'calibrating';
  private calibrationElapsed = 0;
  private candidateElapsed = 0;
  private speechElapsed = 0;
  private silenceElapsed = 0;
  private noiseFloor: number;

  constructor(input: VadDetectorInput = {}) {
    this.cfg = resolveVadConfig(input);
    this.noiseFloor = this.cfg.noiseFloorInit;
  }

  /** 当前学到的底噪（调试/指标用） */
  getNoiseFloor(): number {
    return this.noiseFloor;
  }

  getPhase(): Phase {
    return this.phase;
  }

  /** 重新开始一次监听会话：回到校准期并重置底噪 */
  reset(): void {
    this.phase = 'calibrating';
    this.calibrationElapsed = 0;
    this.candidateElapsed = 0;
    this.speechElapsed = 0;
    this.silenceElapsed = 0;
    this.noiseFloor = this.cfg.noiseFloorInit;
  }

  sample(frame: VadFrameInput): VadEvent {
    const ms = frame.ms ?? this.cfg.frameMs;
    const rawRms = clamp01(frame.rms);
    const inCooldown = frame.gate?.inCooldown ?? false;
    const speaking = frame.gate?.speaking ?? false;
    // 冷却窗把决策 RMS 硬置零（底噪学习也走该值，500ms 内 EMA 影响可忽略）
    const decisionRms = inCooldown ? 0 : rawRms;

    const startThreshold = Math.max(
      this.cfg.minStartThreshold,
      this.noiseFloor *
        this.cfg.startMultiplier *
        (speaking ? this.cfg.playbackThresholdScale : 1),
    );
    const stopThreshold = Math.max(
      this.cfg.minStopThreshold,
      this.noiseFloor * this.cfg.stopMultiplier,
    );
    const confirmMs = speaking ? this.cfg.playbackStartMs : this.cfg.speechStartMs;

    if (this.phase === 'calibrating') {
      this.learnNoise(rawRms);
      this.calibrationElapsed += ms;
      if (this.calibrationElapsed >= this.cfg.calibrationMs) this.phase = 'idle';
      return 'none';
    }

    switch (this.phase) {
      case 'idle': {
        // 仅在低于起始阈值时学底噪——语音起始帧不参与，避免起字抬高门槛
        if (decisionRms < startThreshold) this.learnNoise(decisionRms);
        if (decisionRms >= startThreshold) {
          this.phase = 'candidate';
          this.candidateElapsed = ms;
          return 'candidate';
        }
        return 'none';
      }

      case 'candidate': {
        this.candidateElapsed += ms;
        if (decisionRms >= startThreshold) {
          if (this.candidateElapsed >= confirmMs) {
            this.phase = 'speech';
            // 起点回溯到候选时刻，预录前缀由调用方保留
            this.speechElapsed = this.candidateElapsed;
            this.silenceElapsed = 0;
            return 'speech-start';
          }
          return 'none';
        }
        // 候选期任一帧掉回阈值下：取消，调用方丢弃候选期已录 PCM
        this.phase = 'idle';
        this.candidateElapsed = 0;
        return 'candidate-cancel';
      }

      case 'speech': {
        this.speechElapsed += ms;
        if (decisionRms < stopThreshold) {
          this.silenceElapsed += ms;
        } else {
          this.silenceElapsed = 0;
        }

        // 说话期间冻结底噪学习
        if (this.speechElapsed >= this.cfg.maxSpeechMs) {
          this.finishSpeech();
          return 'speech-end';
        }
        if (this.silenceElapsed >= this.cfg.silenceMs) {
          const longEnough = this.speechElapsed >= this.cfg.minSpeechMs;
          this.finishSpeech();
          return longEnough ? 'speech-end' : 'discard';
        }
        return 'none';
      }
    }
  }

  private finishSpeech(): void {
    this.phase = 'idle';
    this.speechElapsed = 0;
    this.silenceElapsed = 0;
    this.candidateElapsed = 0;
  }

  /**
   * 底噪 EMA：瞬时值先截到 noiseFloor×clamp（巨响不抬门槛）；
   * 说话期不调用本方法（冻结）。
   */
  private learnNoise(rms: number): void {
    const bounded = Math.min(rms, this.noiseFloor * this.cfg.noiseClampMultiplier);
    this.noiseFloor =
      this.noiseFloor * this.cfg.noiseEmaAlpha + bounded * (1 - this.cfg.noiseEmaAlpha);
  }
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
