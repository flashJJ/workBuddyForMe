/**
 * M0c 动效分层库 T1.4：L3 行为 Runner（enter → loop → exit）。
 *
 * 单时钟：所有阶段由 update(dtMs) 推进，hidden 档传 0 即冻结；不使用 setTimeout。
 * 只暴露当前阶段与轨道数据，不直接写骨骼（合成交给 composer）。
 */

import type { BehaviorDefinition, TrackDefinition } from './contracts';
import { smoothDamp } from './math';

export class BehaviorLibrary {
  private readonly behaviors = new Map<string, BehaviorDefinition>();

  constructor(behaviors: readonly BehaviorDefinition[] = []) {
    for (const behavior of behaviors) this.behaviors.set(behavior.id, behavior);
  }

  get(id: string): BehaviorDefinition | undefined {
    return this.behaviors.get(id);
  }

  has(id: string): boolean {
    return this.behaviors.has(id);
  }

  get size(): number {
    return this.behaviors.size;
  }
}

export type BehaviorPhase = 'enter' | 'loop' | 'exit';

export interface BehaviorRunnerOptions {
  /** 进入/退出淡入淡出时长，默认 120ms */
  fadeMs?: number;
}

export interface RunnerSnapshot {
  id: string | null;
  phase: BehaviorPhase | null;
  /** 当前阶段已走时长 */
  phaseElapsedMs: number;
  /** 行为总时长 */
  elapsedMs: number;
  /** 0..1 淡入淡出权重 */
  weight: number;
}

interface ActiveBehavior {
  def: BehaviorDefinition;
  phase: BehaviorPhase;
  phaseElapsedMs: number;
  elapsedMs: number;
  weight: number;
}

const NO_TRACKS: readonly TrackDefinition[] = [];

export class BehaviorRunner {
  private readonly fadeMs: number;
  private readonly queued: string[] = [];
  private current: ActiveBehavior | null = null;
  private readonly snap: RunnerSnapshot = {
    id: null,
    phase: null,
    phaseElapsedMs: 0,
    elapsedMs: 0,
    weight: 0,
  };

  constructor(
    private readonly library: BehaviorLibrary,
    options: BehaviorRunnerOptions = {},
  ) {
    this.fadeMs = Math.max(1, options.fadeMs ?? 120);
  }

  get active(): boolean {
    return this.current !== null;
  }

  get behaviorId(): string | null {
    return this.current?.def.id ?? null;
  }

  get phase(): BehaviorPhase | null {
    return this.current?.phase ?? null;
  }

  get weight(): number {
    return this.current?.weight ?? 0;
  }

  get elapsedMs(): number {
    return this.current?.elapsedMs ?? 0;
  }

  get phaseElapsedMs(): number {
    return this.current?.phaseElapsedMs ?? 0;
  }

  get definition(): BehaviorDefinition | undefined {
    return this.current?.def;
  }

  get tracks(): readonly TrackDefinition[] {
    const current = this.current;
    if (!current) return NO_TRACKS;
    return current.def[current.phase]?.tracks ?? NO_TRACKS;
  }

  /** dev/探针：当前排队的行为 id */
  get queuedIds(): readonly string[] {
    return this.queued;
  }

  get snapshot(): Readonly<RunnerSnapshot> {
    this.snap.id = this.current?.def.id ?? null;
    this.snap.phase = this.current?.phase ?? null;
    this.snap.phaseElapsedMs = this.current?.phaseElapsedMs ?? 0;
    this.snap.elapsedMs = this.current?.elapsedMs ?? 0;
    this.snap.weight = this.current?.weight ?? 0;
    return this.snap;
  }

  /** 请求播放；返回是否立即接管（同级/不可打断时进队列） */
  play(id: string): boolean {
    const def = this.library.get(id);
    if (!def) return false;
    const current = this.current;
    if (!current) {
      this.enter(def);
      return true;
    }
    if (current.def.id === id) return false;
    if (current.def.interrupt === 'never') {
      this.enqueue(id);
      return false;
    }
    if (current.phase === 'exit' && def.priority >= current.def.priority) {
      this.enqueue(id);
      return false;
    }
    if (def.priority < current.def.priority) {
      this.enter(def);
      return true;
    }
    this.enqueue(id);
    return false;
  }

  /** 强制接管：清空队列并立即进入新行为（用户交互/场景新 cue 用） */
  playNow(id: string): boolean {
    const def = this.library.get(id);
    if (!def) return false;
    this.queued.length = 0;
    this.enter(def);
    return true;
  }

  /** 清空排队行为（场景结束/强制切换时用） */
  clearQueue(): void {
    this.queued.length = 0;
  }

  /** 请求收尾；已在 exit 或空闲时返回 false */
  stop(): boolean {
    if (!this.current || this.current.phase === 'exit') return false;
    this.beginExit();
    return true;
  }

  /** 推进单帧；dtMs = 0 时冻结（hidden 档） */
  update(dtMs: number): void {
    const current = this.current;
    if (!current) return;
    const dt = Math.max(0, dtMs);
    if (dt === 0) return;
    current.elapsedMs += dt;
    current.phaseElapsedMs += dt;
    this.advancePhases(current);
    if (this.current !== current) return;
    const target = current.phase === 'exit' ? 0 : 1;
    const phase =
      current.phase === 'enter'
        ? current.def.enter
        : current.phase === 'exit'
          ? current.def.exit
          : current.def.loop;
    const fadeMs = Math.max(1, phase?.fadeMs ?? this.fadeMs);
    current.weight = smoothDamp(current.weight, target, 1000 / fadeMs, dt / 1000);
  }

  private advancePhases(current: ActiveBehavior): void {
    for (let guard = 0; guard < 4; guard += 1) {
      if (current.phase === 'enter') {
        const duration = current.def.enter?.durationMs ?? 0;
        if (current.phaseElapsedMs < duration) return;
        current.phaseElapsedMs -= duration;
        if (current.def.loop) {
          current.phase = 'loop';
          continue;
        }
        this.beginExit(current.phaseElapsedMs);
        return;
      }
      if (current.phase === 'loop') return;
      const duration = current.def.exit?.durationMs ?? this.fadeMs;
      if (current.phaseElapsedMs < duration) return;
      this.finish();
      return;
    }
  }

  private enter(def: BehaviorDefinition): void {
    this.current = {
      def,
      phase: def.enter ? 'enter' : def.loop ? 'loop' : 'exit',
      phaseElapsedMs: 0,
      elapsedMs: 0,
      weight: 0,
    };
  }

  private beginExit(carryMs = 0): void {
    const current = this.current;
    if (!current) return;
    current.phase = 'exit';
    current.phaseElapsedMs = Math.max(0, carryMs);
  }

  private finish(): void {
    this.current = null;
    const next = this.dequeue();
    if (next) this.enter(next);
  }

  private enqueue(id: string): void {
    if (this.queued.includes(id)) return;
    // 队列上限：防止连续点击/场景 cue 无限堆积，导致后续交互全部排队
    if (this.queued.length >= 4) this.queued.shift();
    this.queued.push(id);
  }

  /** 同级按优先数值（小者优先）、再按入队顺序出队 */
  private dequeue(): BehaviorDefinition | undefined {
    let bestIndex = -1;
    let bestPriority = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.queued.length; i += 1) {
      const id = this.queued[i];
      if (!id) continue;
      const def = this.library.get(id);
      if (!def) continue;
      if (def.priority < bestPriority) {
        bestPriority = def.priority;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) {
      this.queued.length = 0;
      return undefined;
    }
    const [id] = this.queued.splice(bestIndex, 1);
    return id ? this.library.get(id) : undefined;
  }
}
