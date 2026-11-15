/**
 * M0d：姿势/动作的人体运动学约束（L0 校验层）。
 *
 * 运行时骨架是 VRM humanoid（normalized rig），不引入 SMPL-X；
 * 这里用与 13-human-pose-reference.md 一致的关节限位，在内容入库前拦截
 * 反向肘/膝、手指过弯、NaN 等非法姿势，避免只靠肉眼评审。
 */

import type { PoseDefinition } from '../contracts';

export type Axis = 'x' | 'y' | 'z';
export type AxisLimit = readonly [number, number];
export type BoneLimits = Partial<Record<Axis, AxisLimit>>;

const DEG = Math.PI / 180;

/** 单轴限位（弧度）；只约束我们实际会写的骨骼，新增骨骼需同步补表 */
const LIMITS: Record<string, BoneLimits> = {
  head: { x: [-25 * DEG, 25 * DEG], y: [-70 * DEG, 70 * DEG], z: [-30 * DEG, 30 * DEG] },
  neck: { x: [-30 * DEG, 30 * DEG], y: [-40 * DEG, 40 * DEG], z: [-25 * DEG, 25 * DEG] },
  spine: { x: [-25 * DEG, 25 * DEG], y: [-30 * DEG, 30 * DEG], z: [-30 * DEG, 30 * DEG] },

  /**
   * 手臂：抬臂/挥手/端碗需要肩部外展 + 内旋组合，
   * 单轴限位放宽到 105°；肘部允许 ±110°（含手腕内扣的“向上折”姿势）。
   * 反向肘仍由 ±110° 上限拦截。
   */
  leftUpperArm: { x: [-105 * DEG, 105 * DEG], y: [-80 * DEG, 80 * DEG], z: [-105 * DEG, 105 * DEG] },
  rightUpperArm: { x: [-105 * DEG, 105 * DEG], y: [-80 * DEG, 80 * DEG], z: [-105 * DEG, 105 * DEG] },
  leftLowerArm: { x: [-40 * DEG, 40 * DEG], y: [-40 * DEG, 40 * DEG], z: [-110 * DEG, 110 * DEG] },
  rightLowerArm: { x: [-40 * DEG, 40 * DEG], y: [-40 * DEG, 40 * DEG], z: [-110 * DEG, 110 * DEG] },
  leftHand: { x: [-35 * DEG, 35 * DEG], y: [-35 * DEG, 35 * DEG], z: [-30 * DEG, 50 * DEG] },
  rightHand: { x: [-35 * DEG, 35 * DEG], y: [-35 * DEG, 35 * DEG], z: [-50 * DEG, 30 * DEG] },

  /**
   * 腿：雪团（VRM0）的归一化腿骨 x 轴与世界相反——实测（+1.35）膝盖前抬、
   * 脚踝到身体前方，（-1.35）整条腿折到身后。所以屈髋取正值、屈膝取负值。
   */
  leftUpperLeg: { x: [-30 * DEG, 80 * DEG], y: [-30 * DEG, 30 * DEG], z: [-25 * DEG, 25 * DEG] },
  rightUpperLeg: { x: [-30 * DEG, 80 * DEG], y: [-30 * DEG, 30 * DEG], z: [-25 * DEG, 25 * DEG] },
  leftLowerLeg: { x: [-100 * DEG, 5 * DEG] },
  rightLowerLeg: { x: [-100 * DEG, 5 * DEG] },
  leftFoot: { x: [-40 * DEG, 40 * DEG], y: [-25 * DEG, 25 * DEG], z: [-20 * DEG, 20 * DEG] },
  rightFoot: { x: [-40 * DEG, 40 * DEG], y: [-25 * DEG, 25 * DEG], z: [-20 * DEG, 20 * DEG] },
};

const FINGERS = ['Index', 'Middle', 'Ring', 'Little'] as const;
const SEGMENTS = ['Proximal', 'Intermediate', 'Distal'] as const;

for (const side of ['left', 'right'] as const) {
  const mirror = side === 'left' ? 1 : -1;
  for (const finger of FINGERS) {
    for (const segment of SEGMENTS) {
      LIMITS[`${side}${finger}${segment}`] = {
        x: [-15 * DEG, 15 * DEG],
        y: [-20 * DEG, 20 * DEG],
        z: mirror > 0 ? [-20 * DEG, 110 * DEG] : [-110 * DEG, 20 * DEG],
      };
    }
  }
  LIMITS[`${side}ThumbMetacarpal`] = {
    x: [-15 * DEG, 15 * DEG],
    y: [-15 * DEG, 15 * DEG],
    z: mirror > 0 ? [-10 * DEG, 60 * DEG] : [-60 * DEG, 10 * DEG],
  };
  LIMITS[`${side}ThumbProximal`] = { ...LIMITS[`${side}ThumbMetacarpal`] };
  LIMITS[`${side}ThumbDistal`] = { ...LIMITS[`${side}ThumbMetacarpal`] };
}

export const JOINT_LIMITS: Readonly<Record<string, BoneLimits>> = LIMITS;

export interface PoseLimitIssue {
  poseId: string;
  bone: string;
  axis: Axis;
  value: number;
  min: number;
  max: number;
}

const AXES: readonly Axis[] = ['x', 'y', 'z'];

/** 校验单个姿势；返回空数组表示通过 */
export function validatePose(
  pose: PoseDefinition,
  limits: Readonly<Record<string, BoneLimits>> = JOINT_LIMITS,
): PoseLimitIssue[] {
  const issues: PoseLimitIssue[] = [];
  for (const [bone, rotation] of Object.entries(pose.bones)) {
    if (!rotation) continue;
    const boneLimits = limits[bone];
    for (const axis of AXES) {
      const value = rotation[axis];
      if (value === undefined) continue;
      const limit = boneLimits?.[axis];
      if (!limit) continue;
      if (!Number.isFinite(value)) {
        issues.push({ poseId: pose.id, bone, axis, value, min: limit[0], max: limit[1] });
        continue;
      }
      if (value < limit[0] || value > limit[1]) {
        issues.push({ poseId: pose.id, bone, axis, value, min: limit[0], max: limit[1] });
      }
    }
  }
  return issues;
}

/** 批量校验（入库测试/离线生成候选姿势） */
export function validatePoses(
  poses: readonly PoseDefinition[],
  limits: Readonly<Record<string, BoneLimits>> = JOINT_LIMITS,
): PoseLimitIssue[] {
  return poses.flatMap((pose) => validatePose(pose, limits));
}
