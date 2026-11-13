import * as THREE from 'three';
import type { NormalizedBoneRef } from '../../pose/bones';
import type { PoseDefinition } from '../../animation/contracts';
import { applyPose } from '../../animation/pose';
import { smoothDamp } from '../../animation/math';
import { clearanceTarget, DEFAULT_HAND_CLEARANCE, type HandClearanceParams } from '../../animation/liveliness';
import type { VrmAnimationRuntime } from '../../animation/adapters/vrm';

/**
 * 手部防穿模的 VRM 适配：测左右手世界间距，按需给上臂叠加一个很小的外旋。
 *
 * 外旋方向经真机标定：两臂局部 Z 同为负值时间距变大（同一 clip 下实测
 * 0.15 → 0.21、0.07 → 0.11），因此这里统一用负 Z 增量。
 * 每帧只写「目标 - 已应用」的差值，避免 additive 累积。
 */
export class VrmHandClearance {
  private applied = 0;
  private readonly params: HandClearanceParams;
  private readonly leftWorld = new THREE.Vector3();
  private readonly rightWorld = new THREE.Vector3();
  private readonly pose: PoseDefinition = {
    id: 'runtime.hand-clearance',
    mask: { include: ['leftArm', 'rightArm'] },
    bones: { leftUpperArm: { z: 0 }, rightUpperArm: { z: 0 } },
  };

  constructor(
    private readonly bones: Map<string, NormalizedBoneRef>,
    private readonly anim: VrmAnimationRuntime,
    params: HandClearanceParams = DEFAULT_HAND_CLEARANCE,
  ) {
    this.params = { ...params };
  }

  update(dt: number, paused: boolean): void {
    if (!(dt > 0)) return;
    const left = this.bones.get('leftHand');
    const right = this.bones.get('rightHand');
    if (!left || !right) return;
    left.node.getWorldPosition(this.leftWorld);
    right.node.getWorldPosition(this.rightWorld);
    const gap = this.leftWorld.distanceTo(this.rightWorld);
    const target = paused ? 0 : clearanceTarget(gap, this.params.minGap);
    const next = smoothDamp(this.applied, target, 6, dt);
    const delta = next - this.applied;
    this.applied = next;
    if (Math.abs(delta) < 1e-4) return;
    const angle = -delta * this.params.maxAngle;
    const bones = this.pose.bones;
    if (bones.leftUpperArm) bones.leftUpperArm.z = angle;
    if (bones.rightUpperArm) bones.rightUpperArm.z = angle;
    applyPose(this.anim.skeleton, this.pose);
  }
}
