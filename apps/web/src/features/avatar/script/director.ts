/**
 * v3.0 剧本引擎 T0.3：ScriptDirector 单时钟骨架。
 *
 * 职责：场景注册、门控、冷却、优先级抢占、beat 推进、确定性随机与 cue 日志。
 * 不认识 VRM/Live2D：所有表现交给 CueSink（T0.4 的适配器）。
 * 不新开定时器：update(dt) 由现有 rAF 驱动；dt<=0（hidden 档）不推进。
 */

import {
  cueTrack,
  evaluateCondition,
  isDoNotDisturbHour,
  isM0IgnoredCue,
  type Cue,
  type Scene,
  type ScriptTrack,
} from '@wbfm/shared/schemas';
import { sceneRandom } from './random';
import {
  exclusiveTracks,
  flattenTimeline,
  intersects,
  toConditionContext,
  type ResolvedCue,
  type ScriptContext,
} from './timeline';

export type { ScriptContext } from './timeline';

export type CancelReason = 'drag' | 'voice' | 'sleep' | 'dispose';
export type SceneEndReason = 'complete' | 'preempt' | 'cancel' | 'dispose';

export interface CueLogEntry {
  sceneId: string;
  /** Director 会话时间（ms） */
  at: number;
  /** 相对场景起点的毫秒（golden 对比基准） */
  beatAt: number;
  track: ScriptTrack;
  cue: Cue;
}

/** 调试快照：当前活跃场景（只读，不参与调度） */
export interface ActiveSceneSnapshot {
  sceneId: string;
  priority: Scene['priority'];
  /** 已消费的 timeline cue 数 */
  cursor: number;
  total: number;
}

export interface CueSink {
  execute(entry: CueLogEntry, random: () => number): void;
  end?(sceneId: string, reason: SceneEndReason): void;
}

export interface ScriptDirectorOptions {
  scenes: readonly Scene[];
  sink: CueSink;
  /** 会话级 seed；同 seed + sceneId + playIndex 可重放 */
  seed?: number;
  /** 日志保留条数（默认 256，防长稳内存漂移） */
  logLimit?: number;
}

interface ActivePlay {
  scene: Scene;
  ctx: ScriptContext;
  startedAt: number;
  timeline: readonly ResolvedCue[];
  cursor: number;
  random: () => number;
}

export class ScriptDirector {
  private readonly scenes: Map<string, Scene>;
  private readonly sink: CueSink;
  private readonly seed: number;
  private readonly logLimit: number;
  private readonly entries: CueLogEntry[] = [];
  private readonly active: ActivePlay[] = [];
  private readonly pending: Array<{ sceneId: string; ctx: ScriptContext }> = [];
  private readonly lastPlayedAt = new Map<string, number>();
  private readonly playCounts = new Map<string, number>();
  private lastSceneId: string | null = null;
  private consecutive = 0;
  private time = 0;
  private disposed = false;

  constructor(options: ScriptDirectorOptions) {
    this.scenes = new Map(options.scenes.map((scene) => [scene.id, scene]));
    this.sink = options.sink;
    this.seed = options.seed ?? 1;
    this.logLimit = options.logLimit ?? 256;
  }

  /** 返回是否被接受（未知场景/门控/冷却/低优先级被拒时 false；同优先级进队列返 true） */
  play(sceneId: string, ctx: ScriptContext): boolean {
    if (this.disposed) return false;
    const scene = this.scenes.get(sceneId);
    if (!scene) {
      console.warn('[ScriptDirector] 未知场景:', sceneId);
      return false;
    }
    if (!this.passesGate(scene, ctx)) return false;
    if (this.inCooldown(scene)) return false;
    if (this.isRepeatBlocked(scene)) return false;

    const timeline = flattenTimeline(scene.beats, ctx);
    const ownTracks = exclusiveTracks(timeline);
    const conflicts = this.active.filter((play) =>
      intersects(exclusiveTracks(play.timeline), ownTracks),
    );
    if (conflicts.length > 0) {
      if (conflicts.some((play) => play.scene.interrupt === 'never')) return false;
      // 数值越小优先级越高；更低优先级不能抢占
      if (conflicts.some((play) => play.scene.priority < scene.priority)) return false;
      if (conflicts.some((play) => play.scene.priority === scene.priority)) {
        this.pending.push({ sceneId, ctx });
        return true;
      }
      for (const play of conflicts) this.finish(play, 'preempt');
    }
    this.start(scene, timeline, ctx);
    this.drainPending();
    return true;
  }

  /** 外部打断：drag 取消非 P0；voice/sleep 取消 P2/P3；dispose 全取消 */
  cancel(reason: CancelReason, policy: 'all' | 'ambient' = 'all'): void {
    const threshold =
      policy === 'ambient' || reason === 'voice' || reason === 'sleep' ? 2 : reason === 'drag' ? 1 : 0;
    for (const play of [...this.active]) {
      if (play.scene.priority >= threshold) {
        this.finish(play, reason === 'dispose' ? 'dispose' : 'cancel');
      }
    }
    if (reason === 'dispose') this.pending.length = 0;
  }

  /** 单时钟推进；dt<=0 时整体冻结（hidden 档不补帧） */
  update(dt: number): void {
    if (this.disposed || !(dt > 0)) return;
    this.time += dt;
    for (const play of [...this.active]) {
      this.advance(play);
      if (play.cursor >= play.timeline.length) this.finish(play, 'complete');
    }
    this.drainPending();
  }

  getLog(): readonly CueLogEntry[] {
    return this.entries;
  }

  /** 调试快照：当前活跃场景与推进游标（T0.8 __petDebug） */
  getActive(): readonly ActiveSceneSnapshot[] {
    return this.active.map((play) => ({
      sceneId: play.scene.id,
      priority: play.scene.priority,
      cursor: play.cursor,
      total: play.timeline.length,
    }));
  }

  getSeed(): number {
    return this.seed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancel('dispose');
    this.disposed = true;
    this.entries.length = 0;
  }

  private start(scene: Scene, timeline: readonly ResolvedCue[], ctx: ScriptContext): void {
    const playIndex = this.playCounts.get(scene.id) ?? 0;
    this.playCounts.set(scene.id, playIndex + 1);
    this.lastPlayedAt.set(scene.id, this.time);
    if (this.lastSceneId === scene.id) {
      this.consecutive += 1;
    } else {
      this.lastSceneId = scene.id;
      this.consecutive = 1;
    }

    const play: ActivePlay = {
      scene,
      ctx,
      startedAt: this.time,
      timeline,
      cursor: 0,
      random: sceneRandom(this.seed, scene.id, playIndex),
    };
    this.active.push(play);
    this.advance(play);
    if (play.cursor >= play.timeline.length) this.finish(play, 'complete');
  }

  private advance(play: ActivePlay): void {
    const elapsed = this.time - play.startedAt;
    while (play.cursor < play.timeline.length) {
      const item = play.timeline[play.cursor];
      if (!item || item.at > elapsed) break;
      play.cursor += 1;
      this.emit(play, item);
    }
  }

  private emit(play: ActivePlay, item: ResolvedCue): void {
    const { cue } = item;
    if (isM0IgnoredCue(cue)) {
      console.warn('[ScriptDirector] M0 忽略 cue:', play.scene.id, cue.kind);
      return;
    }
    const track = cueTrack(cue);
    if (!track) return;
    // 勿扰/关闭台词只影响 voice 轨道，不阻断整场
    if (track === 'voice' && (!play.ctx.linesEnabled || isDoNotDisturbHour(play.ctx.hour, play.ctx.doNotDisturb))) {
      return;
    }
    const entry: CueLogEntry = {
      sceneId: play.scene.id,
      at: this.time,
      beatAt: item.at,
      track,
      cue,
    };
    this.entries.push(entry);
    if (this.entries.length > this.logLimit) {
      this.entries.splice(0, this.entries.length - this.logLimit);
    }
    this.sink.execute(entry, play.random);
  }

  private finish(play: ActivePlay, reason: SceneEndReason): void {
    const index = this.active.indexOf(play);
    if (index >= 0) this.active.splice(index, 1);
    this.sink.end?.(play.scene.id, reason);
  }

  /** 同优先级队列：独占轨道空出来后按入队顺序启动 */
  private drainPending(): void {
    while (this.pending.length > 0) {
      const next = this.pending[0];
      if (!next) return;
      const scene = this.scenes.get(next.sceneId);
      if (
        !scene ||
        !this.passesGate(scene, next.ctx) ||
        this.inCooldown(scene) ||
        this.isRepeatBlocked(scene)
      ) {
        this.pending.shift();
        continue;
      }
      const timeline = flattenTimeline(scene.beats, next.ctx);
      const ownTracks = exclusiveTracks(timeline);
      const blocked = this.active.some((play) =>
        intersects(exclusiveTracks(play.timeline), ownTracks),
      );
      if (blocked) return;
      this.pending.shift();
      this.start(scene, timeline, next.ctx);
    }
  }

  private passesGate(scene: Scene, ctx: ScriptContext): boolean {
    if (scene.gating && !evaluateCondition(scene.gating, toConditionContext(ctx))) return false;
    // 对话/睡眠/背对只挡环境级，触摸与 P0 仍可响应
    if (scene.priority >= 2 && (ctx.busy || ctx.sleeping || ctx.faceAway)) return false;
    return true;
  }

  private inCooldown(scene: Scene): boolean {
    const last = this.lastPlayedAt.get(scene.id);
    return last !== undefined && this.time - last < scene.cooldownMs;
  }

  private isRepeatBlocked(scene: Scene): boolean {
    return this.lastSceneId === scene.id && this.consecutive >= 2;
  }
}
