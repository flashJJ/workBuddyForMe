import { FINGER_BONE_NAMES } from '../mask';

/**
 * 骨骼 → 阶段归属表：固定拓扑序的静态声明。
 *
 * 不是运行时排序，而是把「谁先算」写成常量：
 * root → legs → spine → head → arms → hands → fingers。
 * 每个阶段只允许写自己的骨骼；下游阶段可以读上游的最终世界变换。
 */

export type FrameStage = 'root' | 'legs' | 'spine' | 'head' | 'arms' | 'hands' | 'fingers';

export const STAGE_ORDER: readonly FrameStage[] = [
  'root',
  'legs',
  'spine',
  'head',
  'arms',
  'hands',
  'fingers',
];

/** 父阶段：用于断言「父先于子」 */
const STAGE_PARENT: Readonly<Record<FrameStage, FrameStage | null>> = {
  root: null,
  legs: 'root',
  spine: 'root',
  head: 'spine',
  arms: 'spine',
  hands: 'arms',
  fingers: 'hands',
};

/**
 * 每根骨骼恰好归一个阶段。
 * `hips/chest` 当前不在 normalized 骨骼表里，仍先登记，便于后续接 IK/坐姿。
 * 肩膀归 spine：手臂阶段只读肩部世界变换，不负责肩部微动。
 */
const STAGE_BONES: Readonly<Record<FrameStage, readonly string[]>> = {
  root: ['hips'],
  legs: [
    'leftUpperLeg', 'leftLowerLeg', 'leftFoot',
    'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
  ],
  spine: ['spine', 'chest', 'leftShoulder', 'rightShoulder'],
  head: ['neck', 'head'],
  arms: ['leftUpperArm', 'leftLowerArm', 'rightUpperArm', 'rightLowerArm'],
  hands: ['leftHand', 'rightHand'],
  fingers: FINGER_BONE_NAMES,
};

const STAGE_OF_BONE = new Map<string, FrameStage>();
for (const stage of STAGE_ORDER) {
  for (const bone of STAGE_BONES[stage]) STAGE_OF_BONE.set(bone, stage);
}

const STAGE_INDEX = new Map<FrameStage, number>(STAGE_ORDER.map((stage, index) => [stage, index]));

export function stageOfBone(bone: string): FrameStage | undefined {
  return STAGE_OF_BONE.get(bone);
}

export function stageIndexOf(stage: FrameStage): number {
  return STAGE_INDEX.get(stage) ?? -1;
}

/** 父阶段必须先于子阶段 */
export function isStageOrderValid(stage: FrameStage): boolean {
  const parent = STAGE_PARENT[stage];
  return parent === null || stageIndexOf(parent) < stageIndexOf(stage);
}

/** 骨骼列表里出现的最小阶段（用于行为轨道排序审计） */
export function earliestStageOfBones(bones: readonly string[]): FrameStage | null {
  let earliest: FrameStage | null = null;
  for (const bone of bones) {
    const stage = STAGE_OF_BONE.get(bone);
    if (!stage) continue;
    if (earliest === null || stageIndexOf(stage) < stageIndexOf(earliest)) earliest = stage;
  }
  return earliest;
}
