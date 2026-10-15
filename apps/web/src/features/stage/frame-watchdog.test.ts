import { describe, expect, it } from 'vitest';
import {
  WATCHDOG_AVG_FRAME_MS,
  WATCHDOG_MIN_FRAMES,
  evaluateWatchdog,
} from './frame-watchdog';

describe('v1.9 帧率看门狗纯判定', () => {
  it('帧数不足窗口下限不判定（切场景瞬间防误报）', () => {
    expect(evaluateWatchdog(new Array(WATCHDOG_MIN_FRAMES - 1).fill(40)).slow).toBe(false);
  });

  it('全部 16.7ms（60fps）不触发', () => {
    const reading = evaluateWatchdog(new Array(120).fill(16.7));
    expect(reading.slow).toBe(false);
    expect(reading.avgFrameMs).toBeCloseTo(16.7, 4);
  });

  it('持续 30ms（约 33fps）触发，均值如实上报', () => {
    const reading = evaluateWatchdog(new Array(WATCHDOG_MIN_FRAMES).fill(30));
    expect(reading.slow).toBe(true);
    expect(reading.avgFrameMs).toBe(30);
  });

  it('恰为阈值 25ms 不触发（>25 才算慢）', () => {
    expect(evaluateWatchdog(new Array(WATCHDOG_MIN_FRAMES).fill(WATCHDOG_AVG_FRAME_MS)).slow).toBe(false);
  });

  it('少量长帧被均值稀释不触发（偶发卡顿允许）', () => {
    const frames = [...new Array(110).fill(16.7), ...new Array(10).fill(80)];
    expect(evaluateWatchdog(frames).slow).toBe(false);
  });
});
