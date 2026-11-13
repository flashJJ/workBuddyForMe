import { describe, expect, it } from 'vitest';
import { resolveGazeTarget, type GazeTargetInput } from './gaze-resolver';

const BASE: GazeTargetInput = {
  t: 0,
  pointerX: 0,
  pointerY: 0,
  gazeWeight: 1,
  idle: false,
  muted: true,
  sleeping: false,
  look: null,
  lookWeight: 0,
  pitchSign: 1,
};

describe('resolveGazeTarget（T2.4）', () => {
  it('背对静默时，行为 look 仍生效', () => {
    const target = resolveGazeTarget({ ...BASE, look: 'away', lookWeight: 1 });
    expect(target.headYaw).toBeGreaterThan(0.25);
    expect(target.spineYaw).toBeGreaterThan(0.05);
  });

  it('睡眠优先级高于行为 look', () => {
    const target = resolveGazeTarget({ ...BASE, sleeping: true, look: 'away', lookWeight: 1 });
    expect(Math.abs(target.headYaw)).toBeLessThan(0.01);
    expect(target.headPitch).toBeCloseTo(0.12, 5);
  });

  it('pointer 目标沿用实时指针坐标，只提升权重', () => {
    const target = resolveGazeTarget({
      ...BASE,
      pointerX: 0.5,
      pointerY: 0,
      look: 'pointer',
      lookWeight: 0.4,
    });
    expect(target.headYaw).toBeCloseTo(0.5 * 0.4 * ((26 * Math.PI) / 180), 5);
  });

  it('无 look 且静默时回正，环境漂移也关闭', () => {
    const target = resolveGazeTarget(BASE);
    expect(target.headYaw).toBe(0);
    expect(target.headPitch).toBe(0);
    expect(target.spineYaw).toBe(0);
  });
});
