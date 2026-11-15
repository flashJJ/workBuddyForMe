/**
 * KK 表情执行器：把「morph 名称 → 权重」直接写到已加载模型的 morphTargetInfluences。
 *
 * 为什么不用 VRM expressionManager：
 * - 模型只有 5 个 VRM 0.x 情绪组，没有 surprised，表情通道受限；
 * - KK 的 118 个 morph 里只有 18 个被标准组绑定，直接按名称驱动才能用满。
 *
 * 写入时机在 VrmFaceLayer（vrm.update 之后、眨眼/口型之前），
 * 每帧先清掉自己上一帧写过的索引，避免表情残留。
 */
import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import animeartBinding from '../../animation/bindings/animeart-v1.json';

interface MeshHandle {
  influences: number[];
  dictionary: Record<string, number>;
}

/**
 * 不同导出批次会把 Body_Model_up 拆成多个 primitive，命名与 morph 名称都不稳定：
 * 有的批次带 targetNames，有的被导出成 "0"/"1" 数字键。前者按字典探针识别，
 * 后者按 binding 顺序补名（家族模型 118 个 morph 顺序稳定）。
 */
const MORPH_COUNT = animeartBinding.morphCount;
const PROBES = ['Eyes_smile_op', 'Mouth_smile_op', 'Eyebrows_smug_op'];
const FAMILY_DICTIONARY: Record<string, number> = Object.fromEntries(
  (animeartBinding.targets as { index: number; name: string }[]).map((target) => [target.name, target.index]),
);

function resolveDictionary(mesh: THREE.Mesh): Record<string, number> | null {
  if (!mesh.isMesh || !mesh.morphTargetInfluences?.length) return null;
  const dictionary = mesh.morphTargetDictionary ?? {};
  if (PROBES.every((name) => dictionary[name] !== undefined)) return dictionary;
  if (mesh.morphTargetInfluences.length === MORPH_COUNT) return FAMILY_DICTIONARY;
  return null;
}

export class KkFaceDriver {
  private readonly handles: MeshHandle[] = [];
  private readonly owned: number[][] = [];

  constructor(vrm: VRM) {
    vrm.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      const dictionary = resolveDictionary(mesh);
      if (!dictionary) return;
      this.handles.push({
        influences: mesh.morphTargetInfluences as number[],
        dictionary,
      });
      this.owned.push([]);
    });
    if (this.handles.length === 0) {
      const meshes: string[] = [];
      vrm.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || !mesh.morphTargetInfluences?.length) return;
        const keys = Object.keys(mesh.morphTargetDictionary ?? {}).slice(0, 2).join('/');
        meshes.push(`${mesh.name || '(anon)'}:${mesh.morphTargetInfluences.length}:${keys}`);
      });
      console.warn(`[vrm] KK 面部网格未命中，表情回退 preset；morph meshes=${meshes.join(', ') || 'none'}`);
    }
  }

  get available(): boolean {
    return this.handles.length > 0;
  }

  /** 每帧应用一组权重；空 Map 等价于只清理上一帧 */
  apply(weights: ReadonlyMap<string, number>): number {
    let written = 0;
    for (let i = 0; i < this.handles.length; i += 1) {
      const handle = this.handles[i]!;
      const owned = this.owned[i]!;
      for (const index of owned) handle.influences[index] = 0;
      owned.length = 0;
      for (const [name, raw] of weights) {
        const index = handle.dictionary[name];
        if (index === undefined) continue;
        const value = raw > 1 ? 1 : raw;
        if (!(value > 0)) continue;
        handle.influences[index] = value;
        owned.push(index);
        written += 1;
      }
    }
    return written;
  }

  clear(): void {
    this.apply(new Map());
  }
}
