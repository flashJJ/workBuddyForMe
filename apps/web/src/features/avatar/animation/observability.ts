/**
 * M0c T1.8：行为观测快照（dev 预览面板与 `__petDebug.behaviors` 共用）。
 *
 * 只读：每帧仅在 id/阶段变化时记录一条过渡（最多 10 条），快照按需构造，
 * 不进渲染热路径；生产构建不注册数据源。
 */

import type { BehaviorPhase, BehaviorRunner } from './behavior';

export interface BehaviorTrackDebug {
  kind: string;
  /** pose / motion 轨道引用的数据 id */
  ref?: string;
  /** 叠加后的轨道权重（行为权重 × 轨道权重） */
  weight: number;
}

export interface BehaviorTransitionDebug {
  id: string | null;
  phase: BehaviorPhase | null;
  /** 行为会话内毫秒 */
  atMs: number;
}

export interface BehaviorDebugSnapshot {
  id: string | null;
  phase: BehaviorPhase | null;
  weight: number;
  phaseElapsedMs: number;
  elapsedMs: number;
  tracks: BehaviorTrackDebug[];
  /** 最近 10 条阶段切换（旧 → 新） */
  transitions: BehaviorTransitionDebug[];
}

export const BEHAVIOR_TRANSITION_LIMIT = 10;

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** 行为观测器：稳态零分配，只在 id/阶段变化时入环形记录 */
export class BehaviorObserver {
  private readonly transitions: BehaviorTransitionDebug[] = [];
  private lastId: string | null = null;
  private lastPhase: BehaviorPhase | null = null;
  private lastElapsedMs = 0;

  /** 每帧推进后调用 */
  sample(runner: BehaviorRunner): void {
    const id = runner.behaviorId;
    const phase = runner.phase;
    if (id === null) {
      if (this.lastId !== null) this.record(null, null, this.lastElapsedMs);
      return;
    }
    this.lastElapsedMs = Math.round(runner.elapsedMs);
    if (id !== this.lastId || phase !== this.lastPhase) this.record(id, phase, this.lastElapsedMs);
  }

  snapshot(runner: BehaviorRunner): BehaviorDebugSnapshot {
    const weight = runner.weight;
    return {
      id: runner.behaviorId,
      phase: runner.phase,
      weight: round(weight),
      phaseElapsedMs: Math.round(runner.phaseElapsedMs),
      elapsedMs: Math.round(runner.elapsedMs),
      tracks: runner.tracks.map((track) => ({
        kind: track.kind,
        ref: 'pose' in track ? track.pose : 'motion' in track ? track.motion : undefined,
        weight: round(weight * ('weight' in track ? track.weight ?? 1 : 1)),
      })),
      transitions: this.transitions.slice(),
    };
  }

  private record(id: string | null, phase: BehaviorPhase | null, atMs: number): void {
    this.lastId = id;
    this.lastPhase = phase;
    this.transitions.push({ id, phase, atMs });
    if (this.transitions.length > BEHAVIOR_TRANSITION_LIMIT) this.transitions.shift();
  }
}

type BehaviorDebugSource = () => BehaviorDebugSnapshot | null;
let source: BehaviorDebugSource | null = null;

/** 注册当前运行时的观测源（dev 调试探针安装时调用） */
export function setBehaviorDebugSource(next: BehaviorDebugSource | null): void {
  source = next;
}

/** 读取当前行为快照；无运行时时返回 null */
export function getBehaviorDebug(): BehaviorDebugSnapshot | null {
  return source?.() ?? null;
}
