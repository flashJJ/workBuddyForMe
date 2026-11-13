import { describe, expect, it } from 'vitest';
import { TENSION, dampTension, tensionTarget } from '../../liveliness';

describe('tensionTarget（自然度张力上游）', () => {
  it('默认待机最低', () => {
    expect(tensionTarget({})).toBe(TENSION.idle);
  });

  it('按优先级取最高者：睡眠 > 拎起 > 触摸 > 行为 > 说话 > 背对', () => {
    expect(tensionTarget({ sleeping: true, raised: true, touching: true })).toBe(TENSION.sleeping);
    expect(tensionTarget({ raised: true, touching: true, behavior: true })).toBe(TENSION.raised);
    expect(tensionTarget({ touching: true, behavior: true, speaking: true })).toBe(TENSION.touching);
    expect(tensionTarget({ behavior: true, speaking: true, faceAway: true })).toBe(TENSION.behavior);
    expect(tensionTarget({ speaking: true, faceAway: true })).toBe(TENSION.speaking);
    expect(tensionTarget({ faceAway: true })).toBe(TENSION.faceAway);
  });

  it('待机 < 说话 < 行为 < 触摸 < 拎起', () => {
    expect(TENSION.idle).toBeLessThan(TENSION.speaking);
    expect(TENSION.speaking).toBeLessThan(TENSION.behavior);
    expect(TENSION.behavior).toBeLessThan(TENSION.touching);
    expect(TENSION.touching).toBeLessThan(TENSION.raised);
  });

  it('全部目标落在 0..1', () => {
    for (const value of Object.values(TENSION)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe('dampTension（平滑跟随）', () => {
  it('dt 为 0 时保持不变', () => {
    expect(dampTension(0.2, 0.9, 0)).toBe(0.2);
  });

  it('单调趋近目标且不越界', () => {
    let current = 0.2;
    for (let i = 0; i < 60; i += 1) {
      const next = dampTension(current, 0.9, 1 / 60);
      expect(next).toBeGreaterThan(current);
      expect(next).toBeLessThanOrEqual(0.9);
      current = next;
    }
    expect(current).toBeGreaterThan(0.85);
  });

  it('tau 非正时直接跳到目标', () => {
    expect(dampTension(0.2, 0.9, 0.016, 0)).toBe(0.9);
  });
});
