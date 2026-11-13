/**
 * M0d T2.2：语义通道 → morph 的写入执行器（不依赖 three）。
 *
 * 每帧流程：清掉上一帧自己写过的索引 → 按通道权重写入 → 记录本帧所有权。
 * 只写 binding 里声明的目标；blink / viseme 等保留通道永远不碰，
 * 保证 VrmFaceLayer 的眨眼与口型不被行为表情覆盖。
 *
 * 家族模型常把一个网格拆成多个 primitive（Body_Model_up_1..N），
 * 因此执行器可同时绑定多个共享同一套 morph 字典的网格。
 */

import type { MorphBindingIndex } from '../binding';

/** 一个可写 morph 的网格句柄（three 侧为 morphTargetInfluences / morphTargetDictionary） */
export interface MorphMeshHandle {
  /** 原地修改；长度等于 morph 数量 */
  readonly influences: number[];
  /** morph 名称 → 索引 */
  readonly dictionary: Readonly<Record<string, number>>;
}

export interface MorphDebugSnapshot {
  available: boolean;
  warning: string | null;
  channels: Record<string, number>;
  /** 本帧实际写入的 target 次数 */
  written: number;
  /** 当前被行为表情占用的 morph 索引 */
  activeIndices: number[];
}

function inspectMesh(binding: MorphBindingIndex, mesh: MorphMeshHandle): string | null {
  const expected = binding.definition.morphCount;
  if (mesh.influences.length !== expected) {
    return `morph 数量 ${mesh.influences.length} 与 binding ${expected} 不一致`;
  }
  for (const target of binding.definition.targets) {
    if (mesh.dictionary[target.name] !== target.index) {
      return `morph 名称/索引不匹配: ${target.name} → ${target.index}`;
    }
  }
  return null;
}

export class MorphExecutor {
  readonly available: boolean;
  readonly warning: string | null;

  private readonly binding: MorphBindingIndex;
  private readonly meshes: MorphMeshHandle[] = [];
  /** 每个网格上一帧写入的索引：下一帧先归零，避免表情残留 */
  private readonly owned: number[][] = [];
  /** 本帧是否已触达（Uint8 当布尔数组用，避免 Set 分配） */
  private readonly touched: Uint8Array;
  private written = 0;

  constructor(binding: MorphBindingIndex, mesh: MorphMeshHandle | readonly MorphMeshHandle[] | null) {
    this.binding = binding;
    this.touched = new Uint8Array(binding.definition.morphCount);
    const handles = mesh ? (Array.isArray(mesh) ? mesh : [mesh]) : [];
    let firstIssue: string | null = null;
    for (const handle of handles) {
      const issue = inspectMesh(binding, handle);
      if (issue) {
        firstIssue = firstIssue ?? issue;
        continue;
      }
      this.meshes.push(handle);
      this.owned.push([]);
    }
    this.available = this.meshes.length > 0;
    this.warning = this.available ? null : (firstIssue ?? `未找到绑定网格 ${binding.definition.mesh}`);
  }

  /** 按通道权重写入；channels 为空等价于 clear() */
  apply(channels: ReadonlyMap<string, number>): number {
    this.written = 0;
    if (!this.available || channels.size === 0) {
      this.clear();
      return 0;
    }
    for (let i = 0; i < this.meshes.length; i += 1) this.clearOwned(i);
    for (let i = 0; i < this.meshes.length; i += 1) {
      const influences = this.meshes[i]!.influences;
      const owned = this.owned[i]!;
      for (const [channel, raw] of channels) {
        const value = raw > 1 ? 1 : raw;
        // 0 / 负数 / NaN 不写：让 three-vrm 的 preset 在该索引上恢复正常
        if (!(value > 0)) continue;
        if (this.binding.isReserved(channel)) continue;
        const targets = this.binding.resolve(channel);
        if (!targets) continue;
        for (const target of targets) {
          const index = target.index;
          if (!this.touched[index]) {
            this.touched[index] = 1;
            // 本帧首次触达：先清零，避免叠加在 preset 权重之上
            influences[index] = 0;
            owned.push(index);
          }
          const scaled = value * (target.scale ?? 1) * (target.weight ?? 1);
          const next = (influences[index] ?? 0) + scaled;
          influences[index] = next > 1 ? 1 : next;
          this.written += 1;
        }
      }
      for (const index of owned) this.touched[index] = 0;
    }
    return this.written;
  }

  /** 释放所有权：把上一帧写过的索引归零，之后不再触碰（preset 下一帧恢复） */
  clear(): void {
    for (let i = 0; i < this.meshes.length; i += 1) this.clearOwned(i);
  }

  snapshot(channels: ReadonlyMap<string, number>): MorphDebugSnapshot {
    const record: Record<string, number> = {};
    for (const [channel, value] of channels) record[channel] = value;
    return {
      available: this.available,
      warning: this.warning,
      channels: record,
      written: this.written,
      activeIndices: this.owned[0]?.slice() ?? [],
    };
  }

  private clearOwned(meshIndex: number): void {
    const influences = this.meshes[meshIndex]!.influences;
    const owned = this.owned[meshIndex]!;
    for (const index of owned) influences[index] = 0;
    owned.length = 0;
  }
}
