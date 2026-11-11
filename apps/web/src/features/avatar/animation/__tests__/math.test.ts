import { describe, expect, it } from 'vitest';
import {
  clamp01,
  ease,
  lerp,
  pendulum,
  quatFromEuler,
  quatIdentity,
  quatMultiply,
  quatNlerp,
  quatNormalize,
  smoothDamp,
  springStep,
  type SpringState,
} from '../math';
import type { BoneQuat } from '../contracts';

const HALF_PI = Math.PI / 2;

describe('标量与缓动', () => {
  it('clamp01 / lerp 边界正确', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(2)).toBe(1);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
  });

  it('缓动端点固定且单调', () => {
    for (const name of ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const) {
      expect(ease(name, 0)).toBeCloseTo(0, 9);
      expect(ease(name, 1)).toBeCloseTo(1, 9);
      expect(ease(name, -1)).toBe(0);
      expect(ease(name, 2)).toBe(1);
      let prev = 0;
      for (let i = 1; i <= 20; i += 1) {
        const value = ease(name, i / 20);
        expect(value).toBeGreaterThanOrEqual(prev);
        prev = value;
      }
    }
    expect(ease('easeInOut', 0.5)).toBeCloseTo(0.5, 9);
  });

  it('smoothDamp 与步数无关（拆帧不改变收敛结果）', () => {
    const oneStep = smoothDamp(0, 1, 10, 1 / 30);
    const twoSteps = smoothDamp(smoothDamp(0, 1, 10, 1 / 60), 1, 10, 1 / 60);
    expect(twoSteps).toBeCloseTo(oneStep, 12);
    expect(smoothDamp(0.3, 1, 10, 0)).toBe(0.3);
  });

  it('钟摆零点与四分之一周期', () => {
    expect(pendulum(0, 0.1, 0.5)).toBeCloseTo(0, 9);
    expect(pendulum(0.5, 0.1, 0.5)).toBeCloseTo(0.1, 9);
    expect(pendulum(0, 0.2, 1, HALF_PI)).toBeCloseTo(0.2, 9);
  });
});

describe('弹簧', () => {
  it('收敛到目标且速度归零', () => {
    const state: SpringState = { value: 0, velocity: 0 };
    for (let i = 0; i < 240; i += 1) springStep(state, 1, 120, 18, 1 / 60);
    expect(state.value).toBeCloseTo(1, 3);
    expect(state.velocity).toBeCloseTo(0, 3);
  });

  it('超大 dt 被限幅，不发散', () => {
    const state: SpringState = { value: 0, velocity: 0 };
    springStep(state, 1, 120, 18, 5);
    expect(Number.isFinite(state.value)).toBe(true);
    expect(Math.abs(state.value)).toBeLessThan(1);
    springStep(state, 1, 120, 18, 0);
    expect(state.value).not.toBeNaN();
  });
});

describe('四元数', () => {
  const q = (): BoneQuat => ({ x: 0, y: 0, z: 0, w: 1 });

  it('欧拉 0 与单位四元数一致，绕 Y 90° 正确', () => {
    const out = quatFromEuler(q());
    expect(out).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    quatFromEuler(out, 0, HALF_PI, 0);
    const s = Math.SQRT1_2;
    expect(out.x).toBeCloseTo(0, 9);
    expect(out.y).toBeCloseTo(s, 9);
    expect(out.z).toBeCloseTo(0, 9);
    expect(out.w).toBeCloseTo(s, 9);
  });

  it('乘单位元不变，nlerp 端点与中点合法', () => {
    const a = q();
    const b = quatFromEuler(q(), 0.2, -0.4, 0.6);
    const out = q();
    quatMultiply(out, a, b);
    expect(out).toEqual(b);
    quatMultiply(out, b, a);
    expect(out).toEqual(b);

    quatNlerp(out, a, b, 0);
    expect(out).toEqual(a);
    quatNlerp(out, a, b, 1);
    expect(out).toEqual(b);
    quatNlerp(out, a, b, 0.5);
    expect(Math.hypot(out.x, out.y, out.z, out.w)).toBeCloseTo(1, 9);
  });

  it('归一化零四元数回落到单位元', () => {
    const zero: BoneQuat = { x: 0, y: 0, z: 0, w: 0 };
    expect(quatNormalize(zero)).toEqual(quatIdentity(q()));
  });
});
