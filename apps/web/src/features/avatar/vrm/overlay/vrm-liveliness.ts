import * as THREE from 'three';
import type { NormalizedBoneRef } from '../../pose/bones';
import { LivelinessLayer, supportFactor, type LivelinessParams } from '../../animation/liveliness';
import type { VrmAnimationRuntime } from '../../animation/adapters/vrm';

/**
 * 自然度层在 VRM 侧的接线：把骨骼世界坐标换成重心支撑系数，
 * 再交给纯数学的 LivelinessLayer。
 */
export class VrmLiveliness {
  private readonly layer = new LivelinessLayer();
  private params: LivelinessParams;
  private readonly hipsWorld = new THREE.Vector3();
  private readonly leftWorld = new THREE.Vector3();
  private readonly rightWorld = new THREE.Vector3();

  constructor(
    private readonly bones: Map<string, NormalizedBoneRef>,
    private readonly anim: VrmAnimationRuntime,
    params: LivelinessParams,
  ) {
    this.params = { ...params };
  }

  setParams(patch: Partial<LivelinessParams>): void {
    this.params = { ...this.params, ...patch };
  }

  update(dt: number, sleeping: boolean): void {
    const hips = this.bones.get('hips');
    const left = this.bones.get('leftFoot');
    const right = this.bones.get('rightFoot');
    let support = 1;
    if (hips && left && right) {
      hips.node.getWorldPosition(this.hipsWorld);
      left.node.getWorldPosition(this.leftWorld);
      right.node.getWorldPosition(this.rightWorld);
      support = supportFactor(
        this.hipsWorld.x,
        this.hipsWorld.z,
        this.leftWorld.x,
        this.leftWorld.z,
        this.rightWorld.x,
        this.rightWorld.z,
      );
    }
    this.layer.update(this.anim.skeleton, this.params, dt, support, sleeping);
  }
}
