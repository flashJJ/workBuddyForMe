import { describe, expect, it } from 'vitest';
import type { PoseDefinition } from '../../contracts';
import { JOINT_LIMITS, validatePose, validatePoses } from '../../constraints';
import { POSES } from '../../poses';

function pose(bones: PoseDefinition['bones']): PoseDefinition {
  return { id: 'test.pose', mask: { include: ['leftArm', 'rightArm', 'leftLeg', 'head'] }, bones };
}

describe('人体运动学约束', () => {
  it('所有内置姿势通过限位，且用到的骨骼都有限位表', () => {
    expect(validatePoses(POSES)).toEqual([]);
    for (const item of POSES) {
      for (const bone of Object.keys(item.bones)) {
        expect(JOINT_LIMITS[bone], `${item.id} -> ${bone}`).toBeDefined();
      }
    }
  });

  it('拦截超出肘屈曲上限的姿势', () => {
    const issues = validatePose(pose({ leftLowerArm: { z: 2.6 } }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ bone: 'leftLowerArm', axis: 'z' });
  });

  it('拦截手指过弯', () => {
    const issues = validatePose(pose({ leftIndexProximal: { z: 2.5 } }));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.bone).toBe('leftIndexProximal');
  });

  it('拦截 NaN 与未知轴溢出', () => {
    expect(validatePose(pose({ head: { x: Number.NaN } }))).toHaveLength(1);
    expect(validatePose(pose({ rightUpperArm: { z: -0.4 } }))).toHaveLength(0);
    expect(validatePose(pose({ rightUpperArm: { z: 2.2 } }))).toHaveLength(1);
  });
});
