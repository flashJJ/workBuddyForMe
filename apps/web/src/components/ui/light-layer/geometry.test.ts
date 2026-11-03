import { describe, expect, it } from 'vitest';
import {
  buildCurve,
  clamp01,
  curvePath,
  easeInOutCubic,
  pointOnCurve,
  seedFromString,
  segmentPath,
} from './geometry';

describe('v2.20 M3 Light UI 几何', () => {
  it('缓动两端慢、中段快，且端点与中点稳定', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25);
    expect(easeInOutCubic(0.75)).toBeGreaterThan(0.75);
  });

  it('控制点沿法线偏移，seed 决定弯曲方向', () => {
    const left = buildCurve({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.1);
    const right = buildCurve({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.9);
    expect(left.from).toEqual({ x: 0, y: 0 });
    expect(left.to).toEqual({ x: 100, y: 0 });
    expect(left.c1.y).not.toBe(0);
    expect(right.c1.y).not.toBe(0);
    expect(Math.sign(left.c1.y)).toBe(-Math.sign(right.c1.y));
    expect(left.c1.y).not.toBe(right.c1.y);
  });

  it('同一 seed 生成同一曲线，路径与采样端点一致', () => {
    const curve = buildCurve({ x: 10, y: 20 }, { x: 90, y: 60 }, 0.33);
    const same = buildCurve({ x: 10, y: 20 }, { x: 90, y: 60 }, 0.33);
    expect(curve).toEqual(same);
    expect(curvePath(curve)).toMatch(/^M .* C .*, .*, .*/);
    expect(pointOnCurve(curve, 0)).toEqual({ x: 10, y: 20 });
    expect(pointOnCurve(curve, 1)).toEqual({ x: 90, y: 60 });
    const segment = segmentPath(curve, 0, 0.5, 4);
    expect(segment.startsWith('M ')).toBe(true);
    expect(segment.split(' ').filter((part) => part === 'L')).toHaveLength(4);
  });

  it('clamp 与字符串 seed 稳定落在 [0,1)', () => {
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(3)).toBe(1);
    const seed = seedFromString('light:node:chat:c1:message:m1');
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(1);
    expect(seedFromString('light:node:chat:c1:message:m1')).toBe(seed);
    expect(seedFromString('another')).not.toBe(seed);
  });
});
