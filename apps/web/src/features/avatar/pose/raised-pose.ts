/**
 * v3.0：程序化「被拎起」姿态（不依赖新动画资产）。
 *
 * 语义：整体轻微上提 + 身体轻摆 + 手臂下垂/腿部悬空 + 头部后仰侧倾；
 * 权重由 RaisedPose 内部平滑，松手后回到基准姿态。骨骼方向用世界空间 aimBone 求解，
 * 因此不绑定具体模型的局部轴。
 */

import * as THREE from 'three';
import { aimBone } from '../performance/arm-relax';
import { smoothDamp } from '../performance/gaze';

export const RAISED_BLEND_LAMBDA = 8;
const RAISED_LIFT_M = 0.1;
const RAISED_SWAY_Y = 0.07;
const RAISED_SWAY_Z = 0.05;
const RAISED_HEAD_PITCH = 0.16;
const RAISED_HEAD_YAW = 0.06;
const RAISED_HEAD_ROLL = 0.14;

const LIMB_BONES = [
  'leftUpperArm',
  'rightUpperArm',
  'leftLowerArm',
  'rightLowerArm',
  'leftHand',
  'rightHand',
  'leftUpperLeg',
  'rightUpperLeg',
  'leftLowerLeg',
  'rightLowerLeg',
  'leftFoot',
  'rightFoot',
] as const;

interface RaisedBone {
  node: THREE.Object3D;
  baseQuat: THREE.Quaternion;
}
type BoneLookup = (name: string) => RaisedBone | undefined;

const LIMBS = [
  { upper: 'leftUpperArm', lower: 'leftLowerArm', end: 'leftHand', u: [0.28, -1, -0.1], l: [0.1, -1, 0.12], phase: 0, w: 1 },
  { upper: 'rightUpperArm', lower: 'rightLowerArm', end: 'rightHand', u: [-0.28, -1, -0.1], l: [-0.1, -1, 0.12], phase: 0.9, w: 1 },
  { upper: 'leftUpperLeg', lower: 'leftLowerLeg', end: 'leftFoot', u: [0.06, -1, 0.3], l: [0.03, -1, -0.2], phase: 0.4, w: 0.8 },
  { upper: 'rightUpperLeg', lower: 'rightLowerLeg', end: 'rightFoot', u: [-0.06, -1, 0.3], l: [-0.03, -1, -0.2], phase: 1.2, w: 0.8 },
] as const;

const AIM = new THREE.Vector3();

export class RaisedPose {
  private target = 0;
  private weight = 0;
  private wasRaised = false;

  setRaised(raised: boolean): void {
    this.target = raised ? 1 : 0;
  }

  /** 正在提起或尚在收尾（用于抑制待机 relaxArms） */
  get active(): boolean {
    return this.target > 0 || this.weight > 0.02;
  }

  /** 每帧推进权重；返回当前 0..1 */
  update(dt: number): number {
    this.weight = smoothDamp(this.weight, this.target, RAISED_BLEND_LAMBDA, dt);
    return this.weight;
  }

  /** 头部后仰/侧倾偏移（弧度；pitch 正值=低头，调用方再乘骨骼标定符号） */
  headOffsets(): { yaw: number; pitch: number; roll: number } {
    return {
      yaw: RAISED_HEAD_YAW * this.weight,
      pitch: RAISED_HEAD_PITCH * this.weight,
      roll: RAISED_HEAD_ROLL * this.weight,
    };
  }

  get liftY(): number {
    return RAISED_LIFT_M * this.weight;
  }

  bodySway(t: number): { y: number; z: number } {
    return {
      y: Math.sin(t * 2.2) * RAISED_SWAY_Y * this.weight,
      z: Math.sin(t * 1.7) * RAISED_SWAY_Z * this.weight,
    };
  }

  /** 手臂/腿部悬空姿态；weight 收敛到 0 时恢复基准一次 */
  applyLimbs(lookup: BoneLookup, t: number): void {
    if (this.weight <= 0.001) {
      if (this.wasRaised) {
        this.reset(lookup);
        this.wasRaised = false;
      }
      return;
    }
    this.wasRaised = true;
    this.reset(lookup);
    for (const limb of LIMBS) {
      const upper = lookup(limb.upper);
      const lower = lookup(limb.lower);
      const end = lookup(limb.end);
      if (!upper || !lower || !end) continue;
      const sway = Math.sin(t * 1.9 + limb.phase) * 0.03;
      AIM.set(limb.u[0] + sway, limb.u[1], limb.u[2]);
      aimBone(upper.node, lower.node, AIM, this.weight * limb.w);
      AIM.set(limb.l[0] + sway * 0.6, limb.l[1], limb.l[2]);
      aimBone(lower.node, end.node, AIM, this.weight * limb.w);
    }
  }

  private reset(lookup: BoneLookup): void {
    for (const name of LIMB_BONES) {
      const ref = lookup(name);
      if (ref) ref.node.quaternion.copy(ref.baseQuat);
    }
  }
}
