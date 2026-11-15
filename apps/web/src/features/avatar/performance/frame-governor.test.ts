import { describe, expect, it } from 'vitest';
import {
  FRAME_INTERVAL_BY_MODE,
  frameRateForMode,
  shouldRenderFrame,
} from './frame-governor';

describe('帧率四档', () => {
  it('档位 → 目标帧率（hidden 暂停 / slow 8fps）', () => {
    expect(frameRateForMode('hidden')).toBe(0);
    expect(frameRateForMode('slow')).toBe(8);
    expect(frameRateForMode('idle')).toBe(30);
    expect(frameRateForMode('interact')).toBe(60);
    expect(FRAME_INTERVAL_BY_MODE.hidden).toBe(0);
  });

  it('slow 至少每 125ms 渲染一帧，保证画布不被清空', () => {
    expect(shouldRenderFrame(126, 0, 'slow')).toBe(true);
    expect(shouldRenderFrame(126, 125, 'slow')).toBe(false);
    expect(shouldRenderFrame(250, 125, 'slow')).toBe(true);
  });

  it('hidden 永不渲染（即使已过很久）', () => {
    expect(shouldRenderFrame(10_000, 0, 'hidden')).toBe(false);
    expect(shouldRenderFrame(10_000, 9_000, 'hidden')).toBe(false);
  });

  it('idle 按 30fps 跳帧，interact 按 60fps 跳帧', () => {
    expect(shouldRenderFrame(20, 0, 'idle')).toBe(true); // 首帧放行
    expect(shouldRenderFrame(20, 19, 'idle')).toBe(false);
    expect(shouldRenderFrame(34, 0, 'idle')).toBe(true);
    expect(shouldRenderFrame(17, 0, 'interact')).toBe(true);
    expect(shouldRenderFrame(16, 0.5, 'interact')).toBe(false);
    expect(shouldRenderFrame(32, 16, 'interact')).toBe(true);
  });

  it('60Hz 屏 16.6ms 帧间隔不会被误跳', () => {
    expect(shouldRenderFrame(16.6, 0, 'interact')).toBe(true);
    expect(shouldRenderFrame(33.2, 16.6, 'interact')).toBe(true);
  });
});
