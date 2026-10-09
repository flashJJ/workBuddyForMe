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

import { clamp01, resolveVadConfig } from './vad-config';
import type {
  ResolvedVadConfig,
  VadDetectorInput,
  VadEvent,
  VadFrameInput,
} from './vad-config';

// 类型/配置/电平纯函数已抽到 vad-config；此处再导出保持既有引用路径（use-vad-monitor 等）不变
export {
  DEFAULT_VAD_CONFIG,
  SENSITIVITY_START_MULTIPLIER,
  resolveVadConfig,
} from './vad-config';
export type {
  ResolvedVadConfig,
  VadDetectorInput,
  VadEvent,
  VadGate,
  VadFrameInput,
  VadSensitivity,
} from './vad-config';

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

  /** 本帧（给定门控快照）实际生效的起始阈值（调试/UI 用） */
  getStartThreshold(frame?: VadFrameInput): number {
    const speaking = frame?.gate?.speaking ?? false;
    return Math.max(
      this.cfg.minStartThreshold,
      this.noiseFloor *
        this.cfg.startMultiplier *
        (speaking ? this.cfg.playbackThresholdScale : 1),
    );
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
    // 冷却窗把决策 RMS 硬置零（底噪学习也走该值，300ms 内 EMA 影响可忽略）
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
