import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';

/**
 * v3.0 P1：VRM 资产兜底修复。
 *
 * 1. 布料单面：AnimeArt/VRoid 的裙子常与身体共用单面 MToon 材质，侧栏这种
 *    高窄取景会把相机放低，看到裙内背面导致「裙子消失 / 裤子往上翻」。
 * 2. 裙子弹簧：部分模型合并骨骼后会产生重复的 dress 关节与重复碰撞体
 *    （实测 717 个关节、单关节 144 个碰撞体），裙摆会被推飞。重复/过载时
 *    直接冻结布料弹簧，保留静止裙形，避免乱飞。
 */

const CLOTH_RE = /dress|skirt|cloth|onepiece|tops|uniform|pants|body/i;
const SKIP_RE = /outline|hair|eye|face|teeth|tongue|eyebrow|eyeline/i;

/** 把裙子/身体材质改为双面，返回 patch 数 */
export function applyDoubleSidedCloth(vrm: VRM): number {
  let patched = 0;
  vrm.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      const name = `${mesh.name || ''} ${material.name || ''}`;
      if (SKIP_RE.test(name) || !CLOTH_RE.test(name)) continue;
      if (material.side === THREE.DoubleSide) continue;
      material.side = THREE.DoubleSide;
      material.needsUpdate = true;
      patched += 1;
    }
  });
  return patched;
}

/** 重复或碰撞体过载的布料弹簧：冻结并复位，返回冻结关节数 */
export function freezeUnstableClothSprings(vrm: VRM): number {
  const manager = vrm.springBoneManager;
  if (!manager) return 0;
  const joints = [...manager.joints].filter((joint) => CLOTH_RE.test(joint.bone.name || ''));
  if (joints.length === 0) return 0;
  const unique = new Set(joints.map((joint) => joint.bone.name));
  const overloaded = joints.some(
    (joint) =>
      joint.colliderGroups.reduce((total, group) => total + group.colliders.length, 0) > 24,
  );
  if (joints.length <= unique.size && !overloaded) return 0;

  for (const joint of joints) {
    try {
      joint.reset();
    } catch {
      /* best-effort：个别模型的初始状态缺失 */
    }
    manager.deleteJoint(joint);
  }
  console.warn(
    `[vrm] cloth spring disabled (joints=${joints.length}, unique=${unique.size}, overloaded=${overloaded})`,
  );
  return joints.length;
}

/** 模型加载后、首次 vrm.update 之前调用 */
export function prepareVrmModel(vrm: VRM): void {
  const patched = applyDoubleSidedCloth(vrm);
  const frozen = freezeUnstableClothSprings(vrm);
  if (patched > 0 || frozen > 0) {
    console.info(`[vrm] model fix: doubleSided=${patched}, frozenClothJoints=${frozen}`);
  }
}
