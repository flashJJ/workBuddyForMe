import * as THREE from 'three';
import { samplePropAnimation, type PropAnimationId } from './prop-animation';

const ANIM_QUAT = new THREE.Quaternion();
const ANIM_EULER = new THREE.Euler();

/** 把动画采样结果写到道具对象；由 VrmPropLayer 每帧调用 */
export function applyPropAnimation(
  object: THREE.Object3D,
  base: THREE.Quaternion,
  id: PropAnimationId,
  elapsedMs: number,
): void {
  const frame = samplePropAnimation(id, elapsedMs);
  ANIM_EULER.set(frame.rootX, 0, frame.rootZ);
  ANIM_QUAT.setFromEuler(ANIM_EULER);
  object.quaternion.copy(base).multiply(ANIM_QUAT);

  const cover = object.getObjectByName('book-cover');
  if (cover) cover.rotation.y = frame.coverY;
  const stream = object.getObjectByName('wbfm-pour-stream') as THREE.Mesh | undefined;
  if (stream) {
    stream.visible = frame.streamOpacity > 0.02;
    (stream.material as THREE.MeshBasicMaterial).opacity = frame.streamOpacity;
  }
}
