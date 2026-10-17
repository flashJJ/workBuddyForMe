import { describe, expect, it } from 'vitest';
import {
  clampVelocity,
  edgeSnapPosition,
  isEdgeWithin,
  nearestEdgeWithin,
  stepThrow,
  velocitySpeed,
  SNAP_ENTER_PX,
  SNAP_KEEP_PX,
  THROW_DAMPING_RETAIN_PER_SECOND,
  THROW_MAX_SPEED,
} from './pet-throw-physics';

const AREA = { x: 0, y: 0, width: 1920, height: 1040 };
const SIZE = { width: 260, height: 340 };

describe('pet-throw-physics 阻尼与限幅', () => {
  it('velocitySpeed 为欧氏模长', () => {
    expect(velocitySpeed({ x: 3, y: 4 })).toBe(5);
    expect(velocitySpeed({ x: 0, y: 0 })).toBe(0);
  });

  it('clampVelocity 保持方向并压到上限', () => {
    const clamped = clampVelocity({ x: 4000, y: 3000 });
    expect(velocitySpeed(clamped)).toBeCloseTo(THROW_MAX_SPEED, 6);
    expect(clamped.x).toBeCloseTo(2560, 6);
    expect(clamped.y).toBeCloseTo(1920, 6);
    // 未超上限：原样返回
    expect(clampVelocity({ x: 100, y: 0 })).toEqual({ x: 100, y: 0 });
  });

  it('stepThrow：位移 = 速度 × 时长；速度按指数阻尼衰减（新对象，不改入参）', () => {
    const velocity = { x: 1000, y: 0 };
    const out = stepThrow({ x: 0, y: 0 }, velocity, 100);
    expect(out.position.x).toBeCloseTo(100, 6);
    expect(out.velocity.x).toBeCloseTo(1000 * Math.pow(THROW_DAMPING_RETAIN_PER_SECOND, 0.1), 6);
    expect(out.velocity.x).toBeLessThan(velocity.x); // 确实衰减
    expect(velocity).toEqual({ x: 1000, y: 0 }); // 入参未被修改
  });
});

describe('pet-throw-physics 贴边判定与落点', () => {
  it('nearestEdgeWithin：阈值内取最近边；都在阈值外返回 null', () => {
    expect(nearestEdgeWithin({ x: 1650, y: 400, ...SIZE }, AREA, SNAP_ENTER_PX)).toBe('right');
    expect(nearestEdgeWithin({ x: 800, y: 300, ...SIZE }, AREA, SNAP_ENTER_PX)).toBeNull();
    // 越界（负距离）也视为可吸附
    expect(nearestEdgeWithin({ x: -20, y: 300, ...SIZE }, AREA, SNAP_ENTER_PX)).toBe('left');
  });

  it('isEdgeWithin：维持阈值判定（越界视为仍在）', () => {
    const rect = { x: 1690, y: 400, ...SIZE }; // right 距离 = 1920 - 1950 = -30（越界 → 仍在）
    expect(isEdgeWithin(rect, AREA, 'right', SNAP_KEEP_PX)).toBe(true);
    // 正距离超过阈值则不在
    expect(isEdgeWithin({ x: 1600, y: 400, ...SIZE }, AREA, 'right', 10)).toBe(false);
    expect(isEdgeWithin({ x: 1600, y: 400, ...SIZE }, AREA, 'right', SNAP_KEEP_PX)).toBe(true);
  });

  it('edgeSnapPosition：贴左/右/上/下，另一轴保持原位', () => {
    const rect = { x: 1650, y: 400, ...SIZE };
    expect(edgeSnapPosition(rect, AREA, 'left', 8)).toEqual({ x: 8, y: 400 });
    expect(edgeSnapPosition(rect, AREA, 'right', 8)).toEqual({ x: 1920 - 260 - 8, y: 400 });
    expect(edgeSnapPosition(rect, AREA, 'top', 8)).toEqual({ x: 1650, y: 8 });
    expect(edgeSnapPosition(rect, AREA, 'bottom', 8)).toEqual({ x: 1650, y: 1040 - 340 - 8 });
  });
});
