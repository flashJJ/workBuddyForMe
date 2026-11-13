import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { computeAnimatedBounds } from '../../ui/animated-bounds';

/** Q 版比例：头放大、大腿缩短（脚底由取景重新贴底） */
export const CHIBI_HEAD_SCALE = 1.35;
export const CHIBI_LEG_SCALE = 0.7;

const BASE_KEY = '__wbfmChibiBase';

interface ChibiBase {
  head: THREE.Vector3;
  leftUpperLeg: THREE.Vector3;
  rightUpperLeg: THREE.Vector3;
}

/**
 * Q 版骨架缩放（仅 VRM）。
 *
 * 必须写**原始骨骼**：three-vrm 的 normalized → raw 只同步旋转（hips 额外同步位置），
 * 缩放 normalized 骨骼不会影响蒙皮；反之 raw 缩放会穿过 normalized 每帧的旋转写入保留下来。
 * 原值记录在 `vrm.scene.userData`，因此可重复调用（不会叠加）且关闭时精确还原。
 */
export function applyChibi(vrm: VRM, on: boolean): void {
  const humanoid = vrm.humanoid;
  if (!humanoid) return;
  const head = humanoid.getRawBoneNode('head');
  const left = humanoid.getRawBoneNode('leftUpperLeg');
  const right = humanoid.getRawBoneNode('rightUpperLeg');
  const store = vrm.scene.userData as Record<string, unknown>;
  let base = store[BASE_KEY] as ChibiBase | undefined;
  if (!base) {
    base = {
      head: head?.scale.clone() ?? new THREE.Vector3(1, 1, 1),
      leftUpperLeg: left?.scale.clone() ?? new THREE.Vector3(1, 1, 1),
      rightUpperLeg: right?.scale.clone() ?? new THREE.Vector3(1, 1, 1),
    };
    store[BASE_KEY] = base;
  }

  const apply = (node: THREE.Object3D | null, original: THREE.Vector3, factor: number) => {
    if (node) node.scale.copy(original).multiplyScalar(on ? factor : 1);
  };
  apply(head, base.head, CHIBI_HEAD_SCALE);
  apply(left, base.leftUpperLeg, CHIBI_LEG_SCALE);
  apply(right, base.rightUpperLeg, CHIBI_LEG_SCALE);
}

/**
 * Q 版改骨架后按当前姿态把脚底贴回地面（y=0）。
 * 取景比例沿用动作池并集结果，避免重新采样被当前行为姿态污染；
 * 坐姿由座位下沉逻辑接管，调用方需自行跳过。
 */
export function groundFeet(vrm: VRM): void {
  const box = computeAnimatedBounds(vrm.scene);
  if (!Number.isFinite(box.min.y)) return;
  vrm.scene.position.y -= box.min.y;
  vrm.scene.updateMatrixWorld(true);
}
