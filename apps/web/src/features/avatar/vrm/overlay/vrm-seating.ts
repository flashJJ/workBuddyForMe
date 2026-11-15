import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { NormalizedBoneRef } from '../../pose/bones';
import type { VrmAnimationRuntime } from '../../animation/adapters/vrm';
import { applyTwoBoneIk } from '../../animation/adapters/vrm-ik';
import { VrmSeatProp } from './vrm-seat-prop';
import {
  computeSeatPlacement,
  type SeatAnchor,
  type SeatMode,
  type SeatPlacement,
  type SeatRig,
  type SeatVec3,
} from '../../animation/seating';

const POSE_BY_MODE: Readonly<Record<SeatMode, string>> = {
  sill: 'pose.sit-sill',
  desk: 'pose.sit-desk',
};
const BLEND_S = 0.35;
/** 软 IK：越高越保留坐姿原形；下沉变深后要更硬，腿才会真的折起来 */
const IK_RELAX: Readonly<Record<SeatMode, number>> = { sill: 0.5, desk: 0.4 };
const LEGS = [
  { upper: 'leftUpperLeg', lower: 'leftLowerLeg', end: 'leftFoot', key: 'left' },
  { upper: 'rightUpperLeg', lower: 'rightLowerLeg', end: 'rightFoot', key: 'right' },
] as const;

/**
 * 坐窗沿 / 坐桌沿：高度锚点 + 腿部端点 IK。
 *
 * 每帧顺序：叠加坐姿 → 量当前髋/踝（场景局部）→ 算下沉与落脚点 → root 下沉 → 两骨 IK。
 * 只写腿与 root，手臂由坐姿本身决定。
 */
export class VrmSeating {
  private anchor: SeatAnchor | null = null;
  private lastAnchor: SeatAnchor | null = null;
  private weight = 0;
  private dropM = 0;
  private elapsed = 0;
  private rig: SeatRig | null;  /** 髋下的坐垫（无坐面时坐姿读不出来） */
  private readonly prop: VrmSeatProp;
  private readonly inv = new THREE.Matrix4();
  private readonly hipsLocal = new THREE.Vector3();
  private readonly world = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  /** 背向单位向量（模型局部），用于把坐垫推到身体后方 */
  private readonly back = { x: 0, z: 0 };

  constructor(
    private readonly vrm: VRM,
    private readonly bones: Map<string, NormalizedBoneRef>,
    private readonly anim: VrmAnimationRuntime,
  ) {
    this.rig = this.captureRig();
    this.prop = new VrmSeatProp(vrm);
  }

  setAnchor(anchor: SeatAnchor | null): void {
    this.anchor = anchor;
    if (anchor) this.lastAnchor = anchor;
  }

  get active(): boolean {
    // 淡出期间仍需让待机重心/垂臂让位，直到权重归零
    return this.anchor !== null || this.weight > 0;
  }

  /** 当前下沉量（米），由姿态层叠加到场景 Y 上；不在 anim.root 上做增量，避免逐帧累积 */
  get depth(): number {
    return this.dropM;
  }

  update(dt: number): void {
    const goal = this.anchor ? 1 : 0;
    const step = dt / BLEND_S;
    this.weight = goal > this.weight
      ? Math.min(1, this.weight + step)
      : Math.max(0, this.weight - step);
    const anchor = this.anchor ?? this.lastAnchor;
    if (!anchor) {
      this.dropM = 0;
      this.prop.hide();
      return;
    }
    if (this.weight <= 0) {
      this.dropM = 0;
      this.prop.hide();
      this.lastAnchor = null;
      return;
    }
    this.elapsed += dt;
    // additive=false：每帧从绑定姿态重算，避免腿部在没有 clip 驱动时逐帧累加
    this.anim.applyPose(POSE_BY_MODE[anchor.mode], this.weight, this.elapsed, false);
    // 坐姿只写了手臂偏移，这里补上自然垂臂，避免停在 T-pose 高度
    this.anim.applyPose('pose.arms-hang', this.weight, this.elapsed);
    if (!this.rig) {
      this.dropM = 0;
      this.prop.hide();
      return;
    }
    const placement = this.measure(anchor, this.rig);
    this.dropM = placement.rootDropM * this.weight;
    // 坐垫与下沉共用同一套髋部测量；背向由「髋 → 脚」方位反推，不依赖模型朝向约定
    const dx = (placement.feet.left.x + placement.feet.right.x) / 2 - this.hipsLocal.x;
    const dz = (placement.feet.left.z + placement.feet.right.z) / 2 - this.hipsLocal.z;
    const len = Math.hypot(dx, dz);
    this.back.x = len > 1e-4 ? -dx / len : 0;
    this.back.z = len > 1e-4 ? -dz / len : 0;
    this.prop.update(this.rig, anchor.mode, this.weight, this.hipsLocal, this.back);
    for (const leg of LEGS) {
      const local = placement.feet[leg.key];
      this.target.set(local.x, local.y, local.z).applyMatrix4(this.vrm.scene.matrixWorld);
      applyTwoBoneIk(this.bones, {
        upper: leg.upper,
        lower: leg.lower,
        end: leg.end,
        target: { x: this.target.x, y: this.target.y, z: this.target.z },
        weight: this.weight,
        relax: IK_RELAX[anchor.mode],
      });
    }
  }

  /** 每帧量一次：髋/踝的世界坐标换成场景局部，再交给纯函数算目标 */
  private measure(anchor: SeatAnchor, rig: SeatRig): SeatPlacement {
    this.vrm.scene.updateMatrixWorld(true);
    this.inv.copy(this.vrm.scene.matrixWorld).invert();
    const hips = this.nodeOf('hips');
    if (hips) hips.getWorldPosition(this.hipsLocal).applyMatrix4(this.inv);
    const hipsVec: SeatVec3 = { x: this.hipsLocal.x, y: this.hipsLocal.y, z: this.hipsLocal.z };
    return computeSeatPlacement(anchor, rig, hipsVec, {
      left: this.readLocal('leftFoot'),
      right: this.readLocal('rightFoot'),
    });
  }

  private readLocal(name: string): SeatVec3 {
    const node = this.nodeOf(name);
    if (!node) return { x: 0, y: 0, z: 0 };
    node.getWorldPosition(this.world).applyMatrix4(this.inv);
    return { x: this.world.x, y: this.world.y, z: this.world.z };
  }

  /** hips 不在 normalized 骨骼名单里，需要优先从 humanoid 直接取 */
  private nodeOf(name: string): THREE.Object3D | null {
    // 原始骨骼才是实际蒙皮骨架（Q 版缩放写在这里），测量优先用它；
    // normalized 骨骼仍是姿态写入端，缺原始骨骼时回退。
    return (
      this.vrm.humanoid?.getRawBoneNode(name as never) ??
      this.vrm.humanoid?.getNormalizedBoneNode(name as never) ??
      this.bones.get(name)?.node ??
      null
    );
  }

  /** Q 版等骨骼缩放后重测坐姿尺寸（腿长/髋高已变，坐面与下沉必须重算） */
  refreshRig(): void {
    this.rig = this.captureRig();
  }

  /** 绑定姿态下测一次：髋高、踝高、两段腿长（左右取平均） */
  private captureRig(): SeatRig | null {
    const hips = this.nodeOf('hips');
    const kneeL = this.nodeOf('leftLowerLeg');
    const kneeR = this.nodeOf('rightLowerLeg');
    const ankleL = this.nodeOf('leftFoot');
    const ankleR = this.nodeOf('rightFoot');
    if (!hips || !kneeL || !kneeR || !ankleL || !ankleR) return null;
    this.vrm.scene.updateMatrixWorld(true);
    this.inv.copy(this.vrm.scene.matrixWorld).invert();
    const hip = this.localOf(hips, new THREE.Vector3());
    const kl = this.localOf(kneeL, new THREE.Vector3());
    const kr = this.localOf(kneeR, new THREE.Vector3());
    const al = this.localOf(ankleL, new THREE.Vector3());
    const ar = this.localOf(ankleR, new THREE.Vector3());
    const leftLeg = hip.distanceTo(kl) + kl.distanceTo(al);
    const rightLeg = hip.distanceTo(kr) + kr.distanceTo(ar);
    return {
      hipLocalY: hip.y,
      ankleLocalY: (al.y + ar.y) / 2,
      legLengthM: (leftLeg + rightLeg) / 2,
    };
  }

  private localOf(node: THREE.Object3D, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(node.getWorldPosition(this.world)).applyMatrix4(this.inv);
  }
}
