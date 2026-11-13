import { describe, expect, it } from 'vitest';
import { MOTIONS } from '../../motions';
import { POSES } from '../../poses';
import { resolveTransitionExecutor } from '../../adapters/vrm-executors';

const poseIds = new Set(POSES.map((pose) => pose.id));

describe('动效库：动作定义校验', () => {
  it('每个动作的姿势都存在、时间递增且在时长内', () => {
    for (const motion of MOTIONS) {
      expect(motion.keys.length, motion.id).toBeGreaterThan(0);
      let last = -1;
      for (const key of motion.keys) {
        expect(poseIds.has(key.pose), `${motion.id}: 缺少姿势 ${key.pose}`).toBe(true);
        expect(key.at, `${motion.id}: 关键帧时间未递增`).toBeGreaterThan(last);
        expect(key.at, `${motion.id}: 关键帧超出时长`).toBeLessThanOrEqual(motion.durationMs);
        last = key.at;
      }
    }
  });

  it('动作首尾不使用空姿势，避免绑定 T-pose 泄露', () => {
    for (const motion of MOTIONS) {
      expect(motion.keys[0]?.pose, motion.id).not.toBe('pose.stance-neutral');
      expect(motion.keys.at(-1)?.pose, motion.id).not.toBe('pose.stance-neutral');
    }
  });
});

describe('执行器过渡协议', () => {
  it('进入时进度 = t', () => {
    expect(resolveTransitionExecutor('pose.arms-hang', 'pose.react-flinch', 0.25)).toEqual({
      id: 'pose.react-flinch',
      progress: 0.25,
    });
  });

  it('停留时进度恒为 1', () => {
    expect(resolveTransitionExecutor('pose.react-flinch', 'pose.react-flinch', 0)).toEqual({
      id: 'pose.react-flinch',
      progress: 1,
    });
  });

  it('退出时进度 = 1 - t', () => {
    expect(resolveTransitionExecutor('pose.react-flinch', 'pose.arms-hang', 0.25)).toEqual({
      id: 'pose.react-flinch',
      progress: 0.75,
    });
  });

  it('普通动作返回 null', () => {
    expect(resolveTransitionExecutor('pose.arms-hang', 'pose.wave-raised', 0.5)).toBeNull();
  });
});
