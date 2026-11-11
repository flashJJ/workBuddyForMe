import { describe, expect, it } from 'vitest';
import { BONE_GROUP_MEMBERS, isBoneInMask } from '../mask';
import { MOTIONS } from '../motions';
import { POSES } from '../poses';

describe('姿势注册表', () => {
  it('id 唯一', () => {
    const ids = POSES.map((pose) => pose.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每根骨骼都在自身 mask 内', () => {
    for (const pose of POSES) {
      for (const bone of Object.keys(pose.bones)) {
        expect(isBoneInMask(pose.mask, bone), `${pose.id} -> ${bone}`).toBe(true);
      }
    }
  });

  it('mask 声明的组都有成员（root / face 由场景与脸层处理）', () => {
    for (const pose of POSES) {
      for (const group of pose.mask.include) {
        if (group === 'root' || group === 'face') continue;
        expect(BONE_GROUP_MEMBERS[group].length, `${pose.id} -> ${group}`).toBeGreaterThan(0);
      }
    }
  });

  it('动作关键帧引用的姿势都存在', () => {
    const ids = new Set(POSES.map((pose) => pose.id));
    for (const motion of MOTIONS) {
      for (const key of motion.keys) {
        expect(ids.has(key.pose), `${motion.id} -> ${key.pose}`).toBe(true);
      }
    }
  });
});
