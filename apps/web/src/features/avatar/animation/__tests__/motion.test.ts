import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { MotionDefinition } from '../contracts';
import { MotionLibrary, sampleMotion, type MotionSample } from '../motion';
import { MOTIONS } from '../motions';
import { clipAnimatesArms } from '../../motion/motion-clips';

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

describe('clipAnimatesArms（垂臂层是否让位）', () => {
  const q = (angle: number) => [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];

  it('上臂静止的 A-pose 片段交给垂臂层', () => {
    const track = new THREE.QuaternionKeyframeTrack(
      'leftUpperArm.quaternion',
      [0, 1],
      [...q(0), ...q(0)],
    );
    expect(clipAnimatesArms(new THREE.AnimationClip('a-pose', 1, [track]))).toBe(false);
  });

  it('上臂大幅摆动（挥手 / 伸展）时让位', () => {
    const track = new THREE.QuaternionKeyframeTrack(
      'leftUpperArm.quaternion',
      [0, 1],
      [...q(0), ...q(Math.PI / 2)],
    );
    expect(clipAnimatesArms(new THREE.AnimationClip('wave', 1, [track]))).toBe(true);
  });

  it('只看上臂，头部摆动不算手臂动画', () => {
    const track = new THREE.QuaternionKeyframeTrack(
      'head.quaternion',
      [0, 1],
      [...q(0), ...q(Math.PI / 2)],
    );
    expect(clipAnimatesArms(new THREE.AnimationClip('head', 1, [track]))).toBe(false);
  });

  it('VRMA 归一化节点名（Normalized_*.quaternion）也能识别上臂动画', () => {
    const track = new THREE.QuaternionKeyframeTrack(
      'Normalized_DEF-Left_arm.quaternion',
      [0, 1],
      [...q(0), ...q(Math.PI / 2)],
    );
    expect(
      clipAnimatesArms(new THREE.AnimationClip('vrma', 1, [track]), [
        'Normalized_DEF-Left_arm',
        'Normalized_DEF-Right_arm',
      ]),
    ).toBe(true);
  });
});
