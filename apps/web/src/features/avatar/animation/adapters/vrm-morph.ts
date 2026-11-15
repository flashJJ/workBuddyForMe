/**
 * M0d T2.2：把 binding 与 VRM 网格接起来。
 *
 * 网格优先按 binding.mesh 名称查找；家族模型网格名可能不同，
 * 退化为「包含全部 target 名称」的唯一网格。任一校验失败都只降级为无表情，不影响骨骼渲染。
 */

import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import animeartBinding from '../bindings/animeart-v1.json';
import { buildMorphBinding, type MorphBindingIndex } from '../binding';
import { MorphExecutor, type MorphMeshHandle } from '../morph';

let cached: MorphBindingIndex | null | undefined;

/** 只在首次使用时解析 binding；失败返回 null（调用方降级） */
function loadBinding(): MorphBindingIndex | null {
  if (cached === undefined) {
    try {
      cached = buildMorphBinding(animeartBinding);
    } catch (error) {
      console.warn('[motion] binding 加载失败，行为表情停用', error);
      cached = null;
    }
  }
  return cached;
}

function isMorphMesh(object: THREE.Object3D): object is THREE.Mesh {
  const mesh = object as THREE.Mesh;
  return Boolean(mesh.isMesh && mesh.morphTargetInfluences?.length && mesh.morphTargetDictionary);
}

function findMeshByName(root: THREE.Object3D, name: string): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((object) => {
    if (found || !isMorphMesh(object)) return;
    if (object.name === name) found = object;
  });
  return found;
}

/** 网格名不一致时按 morph 名称集合匹配：返回覆盖 binding 全部 target 的所有网格 */
function findMeshesByTargets(root: THREE.Object3D, binding: MorphBindingIndex): THREE.Mesh[] {
  const names = binding.definition.targets.map((target) => target.name);
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (!isMorphMesh(object)) return;
    const dictionary = object.morphTargetDictionary ?? {};
    let hits = 0;
    for (const name of names) if (dictionary[name] !== undefined) hits += 1;
    if (hits === names.length) meshes.push(object);
  });
  return meshes;
}

function handleOf(mesh: THREE.Mesh): MorphMeshHandle {
  return {
    influences: mesh.morphTargetInfluences as number[],
    dictionary: mesh.morphTargetDictionary ?? {},
  };
}

/**
 * 家族精简模型会把 Body_Model_up 拆成 _1.._N，且 morph 名被导出成数字。
 * 这类网格按已校验的 binding 索引顺序绑定（家族校验脚本确认 118 个 morph 顺序稳定）。
 */
function findFamilyPrimitives(root: THREE.Object3D, binding: MorphBindingIndex): MorphMeshHandle[] {
  const prefix = `${binding.definition.mesh}_`;
  const expected = binding.definition.morphCount;
  const dictionary: Record<string, number> = {};
  for (const target of binding.definition.targets) dictionary[target.name] = target.index;
  const handles: MorphMeshHandle[] = [];
  root.traverse((object) => {
    if (!isMorphMesh(object) || !object.name.startsWith(prefix)) return;
    if (object.morphTargetInfluences?.length !== expected) return;
    handles.push({ influences: object.morphTargetInfluences as number[], dictionary });
  });
  return handles;
}

/** 找不到可用网格时返回不可用执行器（保留 warning，便于 dev 面板排查） */
export function createVrmMorphExecutor(vrm: VRM): MorphExecutor | null {
  const binding = loadBinding();
  if (!binding) return null;
  const byName = findMeshByName(vrm.scene, binding.definition.mesh);
  const byTargets = byName ? [] : findMeshesByTargets(vrm.scene, binding);
  // 家族模型会把一个网格拆成多个 primitive，全部绑定才能让眉/嘴/脸一起动
  const meshes = byName
    ? [handleOf(byName)]
    : byTargets.length > 0
      ? byTargets.map(handleOf)
      : findFamilyPrimitives(vrm.scene, binding);
  return new MorphExecutor(binding, meshes);
}
