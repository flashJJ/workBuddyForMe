import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DROP_RATIO,
  computeSeatPlacement,
  computeSeatProp,
  type SeatRig,
} from '../../seating';

const RIG: SeatRig = { hipLocalY: 0.7, ankleLocalY: 0.06, legLengthM: 0.65 };
const HIPS = { x: 0, y: 0.7, z: 0 };
const ANKLES = {
  left: { x: -0.08, y: 0.32, z: 0.18 },
  right: { x: 0.08, y: 0.32, z: 0.18 },
};

function distance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

describe('computeSeatPlacement（坐姿高度锚点）', () => {
  it('坐桌沿：按比例下沉，脚踝回到站立高度，保留坐姿的 x/z', () => {
    const p = computeSeatPlacement({ mode: 'desk' }, RIG, HIPS, ANKLES);
    expect(p.rootDropM).toBeCloseTo(0.7 * DEFAULT_DROP_RATIO.desk, 5);
    expect(p.feet.left.y).toBeCloseTo(RIG.ankleLocalY, 5);
    expect(p.feet.right.y).toBeCloseTo(RIG.ankleLocalY, 5);
    expect(p.feet.left.x).toBeCloseTo(-0.08, 5);
    expect(p.feet.right.z).toBeCloseTo(0.18, 5);
  });

  it('坐窗沿：脚踝垂到髋部下方，且不超过腿长', () => {
    const p = computeSeatPlacement({ mode: 'sill' }, RIG, HIPS, ANKLES);
    expect(p.rootDropM).toBeCloseTo(0.7 * DEFAULT_DROP_RATIO.sill, 5);
    const hip = { x: HIPS.x, y: HIPS.y - p.rootDropM, z: HIPS.z };
    expect(p.feet.left.y).toBeLessThan(hip.y - RIG.legLengthM * 0.5);
    expect(distance(p.feet.left, hip)).toBeLessThanOrEqual(RIG.legLengthM * 0.98 + 1e-6);
    expect(distance(p.feet.right, hip)).toBeLessThanOrEqual(RIG.legLengthM * 0.98 + 1e-6);
  });

  it('目标过远时只收水平距离，脚仍保持地面高度', () => {
    const far = { left: { x: -0.08, y: 0.3, z: 2 }, right: { x: 0.08, y: 0.3, z: 2 } };
    const p = computeSeatPlacement({ mode: 'desk' }, RIG, HIPS, far);
    const hip = { x: HIPS.x, y: HIPS.y - p.rootDropM, z: HIPS.z };
    expect(p.feet.left.y).toBeCloseTo(RIG.ankleLocalY, 5);
    expect(p.feet.left.z).toBeLessThan(far.left.z);
    expect(distance(p.feet.left, hip)).toBeCloseTo(RIG.legLengthM * 0.98, 5);
  });

  it('dropRatio 可覆盖并钳在 0..0.8', () => {
    expect(computeSeatPlacement({ mode: 'desk', dropRatio: 0 }, RIG, HIPS, ANKLES).rootDropM).toBe(0);
    expect(computeSeatPlacement({ mode: 'sill', dropRatio: 0.9 }, RIG, HIPS, ANKLES).rootDropM).toBeCloseTo(
      0.7 * 0.8,
      5,
    );
  });
});

describe('computeSeatProp（坐面尺寸）', () => {
  it('按站立髋高缩放，坐面固定在臀部下方', () => {
    const spec = computeSeatProp('sill', RIG);
    expect(spec.width).toBeCloseTo(0.7 * 0.92, 5);
    expect(spec.depth).toBeCloseTo(0.7 * 0.46, 5);
    expect(spec.thickness).toBeCloseTo(0.7 * 0.07, 5);
    expect(spec.contactDropM).toBeCloseTo(0.7 * 0.13, 5);
    expect(spec.frontGapM).toBeCloseTo(0.7 * 0.02, 5);
  });

  it('坐窗沿更宽更薄，坐桌沿更窄更厚', () => {
    const sill = computeSeatProp('sill', RIG);
    const desk = computeSeatProp('desk', RIG);
    expect(sill.width).toBeGreaterThan(desk.width);
    expect(sill.thickness).toBeLessThan(desk.thickness);
    expect(sill.color).not.toBe(desk.color);
  });
});
