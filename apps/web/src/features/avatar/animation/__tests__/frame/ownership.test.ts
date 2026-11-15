import { describe, expect, it } from 'vitest';
import { NORM_BONE_NAMES } from '../../../pose/bones';
import {
  earliestStageOfBones,
  isStageOrderValid,
  STAGE_ORDER,
  stageIndexOf,
  stageOfBone,
} from '../../frame/ownership';

describe('骨骼阶段归属与固定拓扑序', () => {
  it('所有 normalized 骨骼都能归到一个阶段', () => {
    const missing = NORM_BONE_NAMES.filter((bone) => !stageOfBone(bone));
    expect(missing).toEqual([]);
  });

  it('父阶段严格先于子阶段', () => {
    expect(stageIndexOf('root')).toBeLessThan(stageIndexOf('legs'));
    expect(stageIndexOf('root')).toBeLessThan(stageIndexOf('spine'));
    expect(stageIndexOf('spine')).toBeLessThan(stageIndexOf('head'));
    expect(stageIndexOf('spine')).toBeLessThan(stageIndexOf('arms'));
    expect(stageIndexOf('arms')).toBeLessThan(stageIndexOf('hands'));
    expect(stageIndexOf('hands')).toBeLessThan(stageIndexOf('fingers'));
    for (const stage of STAGE_ORDER) expect(isStageOrderValid(stage)).toBe(true);
  });

  it('关键骨骼归属符合树状区域', () => {
    expect(stageOfBone('spine')).toBe('spine');
    expect(stageOfBone('neck')).toBe('head');
    expect(stageOfBone('head')).toBe('head');
    expect(stageOfBone('leftUpperArm')).toBe('arms');
    expect(stageOfBone('leftLowerArm')).toBe('arms');
    expect(stageOfBone('leftHand')).toBe('hands');
    expect(stageOfBone('leftIndexDistal')).toBe('fingers');
    expect(stageOfBone('leftFoot')).toBe('legs');
  });

  it('骨骼列表取最早阶段，用于行为轨道顺序审计', () => {
    expect(earliestStageOfBones(['leftHand', 'leftIndexDistal'])).toBe('hands');
    expect(earliestStageOfBones(['leftUpperArm', 'leftHand'])).toBe('arms');
    expect(earliestStageOfBones(['spine', 'leftUpperArm'])).toBe('spine');
    expect(earliestStageOfBones(['unknown'])).toBeNull();
  });
});
