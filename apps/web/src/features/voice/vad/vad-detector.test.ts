import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VAD_CONFIG,
  SENSITIVITY_START_MULTIPLIER,
  VadDetector,
  resolveVadConfig,
  type VadEvent,
  type VadGate,
} from './vad-detector';

const FRAME = 32;
const CAL_FRAMES = Math.ceil(DEFAULT_VAD_CONFIG.calibrationMs / FRAME); // 25

/** 连续喂 n 帧相同 RMS，返回事件序列 */
function feed(d: VadDetector, rms: number, frames: number, gate?: VadGate): VadEvent[] {
  const out: VadEvent[] = [];
  for (let i = 0; i < frames; i += 1) out.push(d.sample({ rms, gate }));
  return out;
}

/** 喂自定义帧序列：[rms, 帧数] 段 */
function feedSeq(d: VadDetector, ...segments: Array<[number, number, VadGate?]>): VadEvent[] {
  const out: VadEvent[] = [];
  for (const [rms, n, gate] of segments) {
    for (let i = 0; i < n; i += 1) out.push(d.sample({ rms, gate }));
  }
  return out;
}

function newDetector(): VadDetector {
  return new VadDetector();
}

describe('resolveVadConfig', () => {
  it('sensitivity 三档映射到起始倍率，默认 balanced', () => {
    expect(resolveVadConfig().startMultiplier).toBe(SENSITIVITY_START_MULTIPLIER.balanced);
    expect(resolveVadConfig({ sensitivity: 'high' }).startMultiplier).toBe(2.6);
    expect(resolveVadConfig({ sensitivity: 'low' }).startMultiplier).toBe(3.8);
  });

  it('用户 silenceMs 覆盖默认值，其余保持默认', () => {
    const cfg = resolveVadConfig({ silenceMs: 1200, sensitivity: 'high' });
    expect(cfg.silenceMs).toBe(1200);
    expect(cfg.frameMs).toBe(32);
    expect(cfg).not.toHaveProperty('sensitivity');
  });
});

describe('VadDetector 校准与底噪', () => {
  it('校准期内只有 none 事件', () => {
    const d = newDetector();
    const events = feed(d, 0.3, CAL_FRAMES - 1);
    expect(events.every((e) => e === 'none')).toBe(true);
    expect(d.getPhase()).toBe('calibrating');
    d.sample({ rms: 0.3 });
    expect(d.getPhase()).toBe('idle');
  });

  it('校准期巨响被 clamp，不会抬高底噪门槛', () => {
    const d = newDetector();
    // 24 帧静音 + 1 帧巨响（校准末帧）
    feed(d, 0.001, CAL_FRAMES - 1);
    d.sample({ rms: 0.9 });
    // clamp 上限 = 0.008*2.5=0.02，EMA 单次权重 0.06 → 底噪远低于 0.9
    expect(d.getNoiseFloor()).toBeLessThan(0.02);
  });

  it('底噪随环境抬升后，低于新门槛的声音不触发', () => {
    const d = newDetector();
    feed(d, 0.02, CAL_FRAMES + 10); // 校准期+空闲态持续学底噪到 ~0.02
    // 起始阈值 ≈ 0.02*3.2=0.064，0.05 虽超默认绝对下限但不超相对门槛
    const events = feed(d, 0.05, 10);
    expect(events).not.toContain('candidate');
  });

  it('说话期间冻结底噪学习', () => {
    const d = newDetector();
    feed(d, 0.001, CAL_FRAMES);
    const floorBefore = d.getNoiseFloor();
    feedSeq(d, [0.1, 12], [0.001, 5]); // 已进入说话态
    expect(d.getNoiseFloor()).toBeCloseTo(floorBefore, 5);
  });
});

describe('VadDetector 起止判定', () => {
  it('校准后持续静音不产任何事件', () => {
    const d = newDetector();
    feed(d, 0.001, CAL_FRAMES + 50);
    const events = feed(d, 0.001, 50);
    expect(events.every((e) => e === 'none')).toBe(true);
  });

  it('候选期掉回阈值下 → candidate-cancel', () => {
    const d = newDetector();
    feed(d, 0.001, CAL_FRAMES);
    const events = feedSeq(d, [0.1, 2], [0.001, 1]); // 64ms 不足 240ms 确认
    expect(events[0]).toBe('candidate');
    expect(events).toContain('candidate-cancel');
    expect(events).not.toContain('speech-start');
    expect(d.getPhase()).toBe('idle');
  });

  it('需连续 240ms（7 帧不足、第 8 帧）才确认 speech-start，起点回溯', () => {
    const d = newDetector();
    feed(d, 0.001, CAL_FRAMES);
    const seven = feed(d, 0.1, 7); // 224ms
    expect(seven).not.toContain('speech-start');
    const eighth = d.sample({ rms: 0.1 }); // 256ms
    expect(eighth).toBe('speech-start');
  });

  it('完整一段话：speech-start 后尾静音 900ms 产 speech-end 且只产一次', () => {
    const d = newDetector();
    feed(d, 0.001, CAL_FRAMES);
    const events = feedSeq(d, [0.1, 12], [0.001, 40]);
    expect(events).toContain('speech-start');
    expect(events.filter((e) => e === 'speech-end')).toHaveLength(1);
    expect(events).not.toContain('discard');
    expect(d.getPhase()).toBe('idle');
  });

  it('迟滞：句中 RMS 低于起始阈值但高于结束阈值时不结束', () => {
    const d = newDetector();
    feed(d, 0.001, CAL_FRAMES);
    feed(d, 0.1, 8); // speech-start
    // stopThreshold=max(0.015, 0.008*1.8)=0.015；0.03 介于两者之间
    const mid = feed(d, 0.03, 20);
    expect(mid).not.toContain('speech-end');
    expect(d.getPhase()).toBe('speech');
  });

  it('短于 minSpeechMs 的段判 discard（小 silenceMs 配置下可达）', () => {
    const d = new VadDetector({
      calibrationMs: 32,
      speechStartMs: 32,
      minSpeechMs: 320,
      silenceMs: 64,
      maxSpeechMs: 60_000,
    });
    d.sample({ rms: 0.001 }); // 校准结束
    // 2 帧高（64ms ≥32 确认）+ 2 帧低（64ms 尾静音）→ 总 128ms < 320
    const events = feedSeq(d, [0.1, 2], [0.001, 2]);
    expect(events).toContain('speech-start');
    expect(events).toContain('discard');
    expect(events).not.toContain('speech-end');
  });

  it('达 maxSpeechMs 强制收尾（不等尾静音）', () => {
    const d = new VadDetector({
      calibrationMs: 32,
      speechStartMs: 32,
      silenceMs: 999_999,
      maxSpeechMs: 96,
    });
    d.sample({ rms: 0.001 });
    const events = feed(d, 0.1, 5); // 第2帧 start（64ms），第3帧 96ms 强切
    expect(events).toContain('speech-start');
    expect(events).toContain('speech-end');
  });
});

describe('VadDetector 播放回声门控', () => {
  const speakingGate: VadGate = { speaking: true, inCooldown: false };
  const idleGate: VadGate = { speaking: false, inCooldown: false };

  it('播报中普通能量不触发（阈值 ×2.2），空闲态同能量可触发', () => {
    // 校准用 0.008 保持底噪 ≈0.008：空闲门槛 0.0256、播报门槛 0.0563
    const speaking = newDetector();
    feed(speaking, 0.008, CAL_FRAMES);
    const events = feed(speaking, 0.04, 25, speakingGate);
    expect(events).not.toContain('candidate');

    const idle = newDetector();
    feed(idle, 0.008, CAL_FRAMES);
    expect(idle.sample({ rms: 0.04, gate: idleGate })).toBe('candidate');
  });

  it('播报中需更响（≥2.2×）且持续 600ms 才确认打断', () => {
    const d = newDetector();
    feed(d, 0.001, CAL_FRAMES);
    const eighteen = feed(d, 0.1, 18, speakingGate); // 576ms < 600
    expect(eighteen).toContain('candidate');
    expect(eighteen).not.toContain('speech-start');
    expect(d.sample({ rms: 0.1, gate: speakingGate })).toBe('speech-start'); // 608ms
  });

  it('停播冷却窗内 RMS 按 0 处理：高能量也不触发；冷却结束恢复', () => {
    const d = newDetector();
    feed(d, 0.001, CAL_FRAMES);
    const cooldown: VadGate = { speaking: false, inCooldown: true };
    const during = feed(d, 0.5, 10, cooldown);
    expect(during).not.toContain('candidate');
    // 冷却结束：同能量立即进入候选
    expect(d.sample({ rms: 0.5, gate: idleGate })).toBe('candidate');
  });

  it('打断确认后切回空闲门控：语音态保持，按正常尾静音结束', () => {
    const d = newDetector();
    feed(d, 0.001, CAL_FRAMES);
    feed(d, 0.1, 19, speakingGate); // 608ms → speech-start（打断）
    expect(d.getPhase()).toBe('speech');
    // 停播后门控摘除，继续说话保持语音态，随后尾静音正常收尾
    expect(feed(d, 0.1, 5, idleGate)).not.toContain('speech-end');
    const tail = feed(d, 0.001, 40, idleGate);
    expect(tail).toContain('speech-end');
  });
});

describe('VadDetector 健壮性', () => {
  it('NaN RMS 按 0 处理', () => {
    const d = newDetector();
    feed(d, 0.001, CAL_FRAMES);
    expect(() => d.sample({ rms: Number.NaN })).not.toThrow();
    expect(d.getPhase()).toBe('idle');
  });

  it('reset 回到校准期并重置底噪', () => {
    const d = newDetector();
    feed(d, 0.05, CAL_FRAMES + 10);
    expect(d.getNoiseFloor()).toBeGreaterThan(0.03);
    d.reset();
    expect(d.getPhase()).toBe('calibrating');
    expect(d.getNoiseFloor()).toBeCloseTo(DEFAULT_VAD_CONFIG.noiseFloorInit, 6);
  });
});
