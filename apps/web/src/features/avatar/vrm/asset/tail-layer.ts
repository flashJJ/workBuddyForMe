import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';

interface TailRef {
  bone: THREE.Object3D;
  baseQuat: THREE.Quaternion;
  phase: number;
}

/**
 * v3.0 P1：非 humanoid 尾巴的程序化摆动。
 *
 * VRMA/humanoid 动画只驱动标准人形骨；尾巴（tail_01/tail_02/...）不在其中。
 * 如果模型又没有为尾巴配置 SpringBone，它就会完全静止。这里收集未被
 * springBoneManager 接管的 tail 骨，每帧叠加一个很小的正弦摆动。
 */
export class VrmTailLayer {
  private readonly bones: TailRef[] = [];
  private readonly euler = new THREE.Euler();
  private readonly quat = new THREE.Quaternion();

  constructor(vrm: VRM) {
    const springBones = new Set(
      vrm.springBoneManager
        ? [...vrm.springBoneManager.joints].map((joint) => joint.bone)
        : [],
    );
    const found: THREE.Object3D[] = [];
    vrm.scene.traverse((obj) => {
      if (!(obj as THREE.Bone).isBone || !/tail/i.test(obj.name || '')) return;
      if (springBones.has(obj)) return;
      found.push(obj);
    });
    found.sort((a, b) => a.name.localeCompare(b.name));
    found.forEach((bone, index) => {
      this.bones.push({
        bone,
        baseQuat: bone.quaternion.clone(),
        phase: index * 0.55,
      });
    });
  }

  /** 在 vrm.update 之后调用（此时骨骼已被 humanoid/弹簧骨写好） */
  update(t: number): void {
    for (const ref of this.bones) {
      ref.bone.quaternion.copy(ref.baseQuat);
      this.euler.set(
        Math.sin(t * 0.9 + ref.phase) * 0.03,
        Math.sin(t * 1.1 + ref.phase) * 0.05,
        0,
      );
      this.quat.setFromEuler(this.euler);
      ref.bone.quaternion.multiply(this.quat);
    }
  }

  /** 调试/测试：当前接管的尾巴骨数量 */
  get count(): number {
    return this.bones.length;
  }
}
