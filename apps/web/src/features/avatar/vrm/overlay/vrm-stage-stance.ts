import * as THREE from 'three';
import type { NormalizedBoneRef } from '../../pose/bones';

/** 上腿沿 Z 轴外旋约 5°：让舞台三席的双脚自然分开，避免鞋子重叠 */
const STAGE_STANCE_AXIS = new THREE.Vector3(0, 0, 1);
const STAGE_STANCE_LEFT = new THREE.Quaternion().setFromAxisAngle(STAGE_STANCE_AXIS, -0.09);
const STAGE_STANCE_RIGHT = new THREE.Quaternion().setFromAxisAngle(STAGE_STANCE_AXIS, 0.09);

/** 舞台固定站姿；腿轨已在舞台待机里剔除，不会被动画覆盖 */
export class VrmStageStance {
  private on = false;

  setEnabled(on: boolean): void {
    this.on = on;
  }

  apply(bones: Map<string, NormalizedBoneRef>): void {
    if (!this.on) return;
    const left = bones.get('leftUpperLeg');
    const right = bones.get('rightUpperLeg');
    if (left) left.node.quaternion.copy(left.baseQuat).multiply(STAGE_STANCE_LEFT);
    if (right) right.node.quaternion.copy(right.baseQuat).multiply(STAGE_STANCE_RIGHT);
  }
}
