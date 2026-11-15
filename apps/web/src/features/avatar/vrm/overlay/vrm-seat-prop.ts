import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import {
  computeSeatProp,
  type SeatMode,
  type SeatRig,
  type SeatVec3,
} from '../../animation/seating';

/**
 * 座位道具：坐窗沿 / 坐桌沿时在臀部后方渲染一段坐面（横向露出两侧）。
 *
 * 没有坐面时，坐姿只能靠「腿前伸 + 身体下沉」读出，近看像半蹲；
 * 一条退到身后的坐面给出支撑后，正面也能读出「坐在沿上」。
 * 挂在 `vrm.scene` 下随模型一起下沉，避免道具与身体分离。
 */
export class VrmSeatProp {
  private readonly mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;

  constructor(vrm: VRM) {
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, transparent: true, opacity: 0 }),
    );
    this.mesh.name = 'pet-seat-prop';
    this.hide();
    vrm.scene.add(this.mesh);
  }

  /**
   * @param hip 髋部（模型局部）
   * @param back 背向单位向量（由髋 → 脚的方位反推，不依赖模型朝向约定）
   * @param weight 坐姿权重 0-1，用于淡入淡出
   */
  update(
    rig: SeatRig,
    mode: SeatMode,
    weight: number,
    hip: SeatVec3,
    back: { x: number; z: number },
  ): void {
    if (weight <= 0.002) {
      this.hide();
      return;
    }
    const spec = computeSeatProp(mode, rig);
    const contact = hip.y - spec.contactDropM;
    // 前缘退到裙摆后方，再按进深补一半，得到盒子中心
    const centerBack = spec.frontGapM + spec.depth / 2;
    this.mesh.visible = true;
    this.mesh.scale.set(spec.width, spec.thickness, spec.depth);
    this.mesh.position.set(
      hip.x + back.x * centerBack,
      contact - spec.thickness / 2,
      hip.z + back.z * centerBack,
    );
    this.mesh.material.color.setHex(spec.color);
    this.mesh.material.opacity = weight;
  }

  /** 隐藏时缩到 0：取景用的 Box3 不看 visible，只按几何算包围盒 */
  hide(): void {
    this.mesh.visible = false;
    this.mesh.scale.setScalar(0);
  }
}
