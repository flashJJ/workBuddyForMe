/**
 * v3.0 剧本引擎 T0.3：Director 的时间轴纯函数协作者。
 *
 * 只做「Scene beats → 相对时间轴」的确定性展开与轨道判定，不持有状态；
 * 条件在 play 时刻求值（M0 语义），branches 递归展开后不再回溯。
 */

import {
  cueTrack,
  evaluateCondition,
  type ConditionContext,
  type Cue,
  type DoNotDisturbConfig,
  type MotionMood,
  type RelationshipLevel,
  type Scene,
  type ScriptTrack,
} from '@wbfm/shared/schemas';

/** 09 §4.1：每次 play 由调用方组装的状态上下文 */
export interface ScriptContext {
  hour: number;
  relationshipLevel: RelationshipLevel;
  mood: MotionMood;
  emotionEnabled: boolean;
  linesEnabled: boolean;
  doNotDisturb: DoNotDisturbConfig;
  /** 对话/语音/拖拽期间为 true；只挡环境级场景（P2/P3） */
  busy: boolean;
  sleeping: boolean;
  faceAway: boolean;
  /** 调用方环境随机；场景内随机由 Director 按 seed 派生，不读此函数 */
  random: () => number;
}

export interface ResolvedCue {
  at: number;
  cue: Cue;
}

export function toConditionContext(ctx: ScriptContext): ConditionContext {
  return {
    hour: ctx.hour,
    relationshipLevel: ctx.relationshipLevel,
    mood: ctx.mood,
    sleeping: ctx.sleeping,
    faceAway: ctx.faceAway,
    busy: ctx.busy,
    linesEnabled: ctx.linesEnabled,
    emotionEnabled: ctx.emotionEnabled,
  };
}

/** 把 beat 时间轴展开为「相对起点 + cue」；wait 只影响同层后续 cue 的偏移 */
export function flattenTimeline(beats: Scene['beats'], ctx: ScriptContext): ResolvedCue[] {
  const out: ResolvedCue[] = [];
  const append = (at: number, cue: Cue): void => {
    if (cue.kind === 'wait') return;
    if (cue.kind === 'branch') {
      const branch = evaluateCondition(cue.if, toConditionContext(ctx)) ? cue.then : cue.else;
      if (branch) appendList(at, branch);
      return;
    }
    out.push({ at, cue });
  };
  const appendList = (at: number, cues: readonly Cue[]): void => {
    let offset = 0;
    for (const cue of cues) {
      if (cue.kind === 'wait') {
        offset += cue.ms;
        continue;
      }
      append(at + offset, cue);
    }
  };
  for (const beat of beats) append(beat.at, beat.cue);
  return out;
}

/** 场景占用的独占轨道（body / world 同一时刻只能有一个） */
export function exclusiveTracks(timeline: readonly ResolvedCue[]): Set<ScriptTrack> {
  const tracks = new Set<ScriptTrack>();
  for (const item of timeline) {
    const track = cueTrack(item.cue);
    if (track === 'body' || track === 'world') tracks.add(track);
  }
  return tracks;
}

export function intersects(a: ReadonlySet<ScriptTrack>, b: ReadonlySet<ScriptTrack>): boolean {
  for (const track of a) if (b.has(track)) return true;
  return false;
}
