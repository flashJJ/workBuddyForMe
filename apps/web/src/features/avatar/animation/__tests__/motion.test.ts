import { describe, expect, it } from 'vitest';
import type { MotionDefinition } from '../contracts';
import { MotionLibrary, sampleMotion, type MotionSample } from '../motion';
import { MOTIONS } from '../motions';

const newSample = (): MotionSample => ({ from: '', to: '', t: 0, timeMs: 0, done: true });

const MOTION: MotionDefinition = {
  id: 'test.motion',
  durationMs: 600,
  keys: [
    { at: 0, pose: 'a' },
    { at: 200, pose: 'b', easing: 'easeInOut' },
    { at: 600, pose: 'c' },
  ],
};

describe('sampleMotion', () => {
  it('按段采样并应用目标关键帧缓动', () => {
    const out = newSample();
    sampleMotion(out, MOTION, 0);
    expect(out).toMatchObject({ from: 'a', to: 'b', t: 0, done: false });

    sampleMotion(out, MOTION, 100);
    expect(out.from).toBe('a');
    expect(out.to).toBe('b');
    expect(out.t).toBeCloseTo(0.5, 9);

    sampleMotion(out, MOTION, 50);
    expect(out.t).toBeCloseTo(0.0625, 9);
  });

  it('关键帧边界与结束判定', () => {
    const out = newSample();
    sampleMotion(out, MOTION, 200);
    expect(out).toMatchObject({ from: 'b', to: 'c', t: 0, done: false });

    sampleMotion(out, MOTION, 600);
    expect(out).toMatchObject({ from: 'c', to: 'c', t: 0, done: true });

    sampleMotion(out, MOTION, 99_999);
    expect(out.timeMs).toBe(600);
    expect(out.done).toBe(true);
  });

  it('循环取模，相位偏移在取模后生效', () => {
    const out = newSample();
    const loop: MotionDefinition = { ...MOTION, loop: true };
    sampleMotion(out, loop, 700);
    expect(out.timeMs).toBe(100);
    expect(out).toMatchObject({ from: 'a', to: 'b' });

    sampleMotion(out, loop, 0, 300);
    expect(out.timeMs).toBe(300);
    expect(out).toMatchObject({ from: 'b', to: 'c' });
    expect(out.done).toBe(false);
  });

  it('非循环时 offset 会被时长截断', () => {
    const out = newSample();
    sampleMotion(out, MOTION, 0, 500);
    expect(out.timeMs).toBe(500);
    sampleMotion(out, MOTION, 900, 500);
    expect(out.timeMs).toBe(600);
  });

  it('空关键帧或非法时长返回空样本', () => {
    const out = newSample();
    sampleMotion(out, { id: 'empty', durationMs: 0, keys: [] }, 100);
    expect(out).toMatchObject({ from: '', to: '', t: 0, done: true });
  });
});

describe('内置动作数据', () => {
  it('id 唯一、时间严格递增且不超过时长', () => {
    expect(new Set(MOTIONS.map((motion) => motion.id)).size).toBe(MOTIONS.length);
    for (const motion of MOTIONS) {
      expect(motion.durationMs).toBeGreaterThan(0);
      for (let i = 1; i < motion.keys.length; i += 1) {
        const prev = motion.keys[i - 1];
        const curr = motion.keys[i];
        if (!prev || !curr) throw new Error(`${motion.id} 关键帧缺失`);
        expect(curr.at).toBeGreaterThan(prev.at);
      }
      const last = motion.keys[motion.keys.length - 1];
      expect(last).toBeDefined();
      if (last) expect(last.at).toBeLessThanOrEqual(motion.durationMs);
    }
  });

  it('MotionLibrary 按 id 查找', () => {
    const library = new MotionLibrary(MOTIONS);
    expect(library.get('motion.nod')).toBeDefined();
    expect(library.get('missing')).toBeUndefined();
    expect(library.size).toBe(MOTIONS.length);
  });
});
