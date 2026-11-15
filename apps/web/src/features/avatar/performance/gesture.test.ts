import { describe, expect, it } from 'vitest';
import {
  GestureState,
  ambientHeadAngles,
  gestureAngles,
  pickAmbientBehavior,
  pickMotionGesture,
  pickTapGesture,
  type ProceduralGestureKind,
} from './gesture';

describe('pickMotionGesture', () => {
  it('无 VRMA 手势时点击回退到内部 MOTION', () => {
    expect(pickMotionGesture(0.1)).toBe('motion.wave');
    expect(pickMotionGesture(0.9)).toBe('motion.shy');
  });
});

describe('gestureAngles', () => {
  it('首尾归零：包络保证不产生跳变', () => {
    for (const kind of ['nod', 'tilt', 'glanceLeft', 'glanceRight'] as ProceduralGestureKind[]) {
      expect(gestureAngles(kind, 0)).toEqual({ yaw: 0, pitch: 0, roll: 0 });
      expect(gestureAngles(kind, 1)).toEqual({ yaw: 0, pitch: 0, roll: 0 });
      expect(gestureAngles(kind, -0.1)).toEqual({ yaw: 0, pitch: 0, roll: 0 });
    }
  });

  it('点头只有俯仰，歪头带 roll，瞥左/瞥右方向相反', () => {
    const nod = gestureAngles('nod', 0.5);
    expect(nod.pitch).toBeGreaterThan(0.1);
    expect(nod.yaw).toBe(0);

    const tilt = gestureAngles('tilt', 0.5);
    expect(Math.abs(tilt.roll)).toBeGreaterThan(0.1);
    expect(tilt.yaw).toBeGreaterThan(0);

    expect(gestureAngles('glanceLeft', 0.5).yaw).toBeGreaterThan(0.09);
    expect(gestureAngles('glanceRight', 0.5).yaw).toBeLessThan(-0.09);
  });

  it('幅度受控：不超过视线跟随的头部上限', () => {
    for (let i = 1; i < 20; i += 1) {
      const a = gestureAngles('tilt', i / 20);
      expect(Math.abs(a.yaw)).toBeLessThan(0.06);
      expect(Math.abs(a.pitch)).toBeLessThan(0.03);
      expect(Math.abs(a.roll)).toBeLessThan(0.17);
    }
  });
});

describe('pickTapGesture / pickAmbientBehavior', () => {
  it('点击手势是确定性的二分', () => {
    expect(pickTapGesture(0)).toBe('nod');
    expect(pickTapGesture(0.49)).toBe('nod');
    expect(pickTapGesture(0.5)).toBe('tilt');
    expect(pickTapGesture(0.99)).toBe('tilt');
  });

  it('环境行为覆盖眨眼/点头/歪头/两次瞥视', () => {
    expect(pickAmbientBehavior(0)).toBe('blink');
    expect(pickAmbientBehavior(0.4)).toBe('nod');
    expect(pickAmbientBehavior(0.6)).toBe('tilt');
    expect(pickAmbientBehavior(0.85)).toBe('glanceLeft');
    expect(pickAmbientBehavior(0.95)).toBe('glanceRight');
  });
});

describe('ambientHeadAngles', () => {
  it('低频漂移幅度足够小，不会盖过视线跟随', () => {
    for (let t = 0; t < 120; t += 0.5) {
      const a = ambientHeadAngles(t);
      expect(Math.abs(a.yaw)).toBeLessThan(0.05);
      expect(Math.abs(a.pitch)).toBeLessThan(0.02);
    }
  });
});

describe('GestureState', () => {
  it('按进度推进、到期归零，且不再 active', () => {
    const state = new GestureState();
    expect(state.active).toBe(false);
    expect(state.update(1000)).toEqual({ yaw: 0, pitch: 0, roll: 0 });

    state.play('nod', 1000);
    expect(state.active).toBe(true);
    const mid = state.update(1260);
    expect(mid.pitch).toBeGreaterThan(0.1);
    expect(state.update(1520)).toEqual({ yaw: 0, pitch: 0, roll: 0 });
    expect(state.active).toBe(false);
  });

  it('新手势覆盖旧手势的起点', () => {
    const state = new GestureState();
    state.play('tilt', 0);
    state.play('glanceLeft', 300);
    expect(state.update(300).yaw).toBeCloseTo(0, 5);
    expect(state.update(300 + 550).yaw).toBeGreaterThan(0.09);
  });
});
