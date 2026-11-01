import * as THREE from 'three';
import { DEFAULT_MOTION_MOOD } from '@wbfm/shared/schemas';
import type { MotionEntry } from './motion-segments';

/**
 * 动作播放的小工具（由 MotionMixer / HoldMotionScheduler 共用，避免同段 action 起播逻辑重复）。
 */

/** Tap clip 单次播放的轨道名匹配模式（中英文都覆盖） */
const TAP_CLIP_PATTERNS = /tap|click|hit|touch|poke|点击|挥|摆/i;
/** Idle clip 循环播放的轨道名匹配模式（覆盖中文「默认」「待机N」） */
const IDLE_CLIP_PATTERNS = /idle|loop|standby|待\s*机|默认|待机\d|アイドル|ポーズ/i;

/** 模型内嵌 clip 里挑出的兜底 idle / tap */
export interface EmbeddedClips {
  idleClip: THREE.AnimationClip | null;
  tapClip: THREE.AnimationClip | null;
}

/** 动作池为空时，从模型内嵌 AnimationClip 里挑 idle（名匹配或最长）与 tap（名匹配） */
export function selectEmbeddedClips(clips: THREE.AnimationClip[]): EmbeddedClips {
  if (clips.length === 0) return { idleClip: null, tapClip: null };
  const idleClip =
    clips.find((c) => IDLE_CLIP_PATTERNS.test(c.name)) ??
    [...clips].sort((a, b) => b.duration - a.duration)[0] ??
    null;
  const tapClip = clips.find((c) => TAP_CLIP_PATTERNS.test(c.name)) ?? null;
  return { idleClip, tapClip };
}

/** 把内嵌 idle clip 包成单段条目（动作池为空时避免整只走程序化姿态） */
export function embeddedSingleEntry(clip: THREE.AnimationClip): MotionEntry {
  return {
    key: null,
    clips: { single: clip },
    mood: DEFAULT_MOTION_MOOD,
    minRelationshipLevel: null,
    loopClip: clip,
  };
}

/** 条目池的全部 clip（去重；fit 采样用） */
export function allEntryClips(entries: MotionEntry[]): THREE.AnimationClip[] {
  const seen = new Set<THREE.AnimationClip>();
  for (const entry of entries) {
    for (const clip of Object.values(entry.clips)) {
      if (clip) seen.add(clip);
    }
  }
  return [...seen];
}

/** 起一个循环 action（reset + LoopRepeat + 权重 1 + play） */
export function startLoopAction(
  mixer: THREE.AnimationMixer,
  clip: THREE.AnimationClip,
): THREE.AnimationAction {
  const action = mixer.clipAction(clip);
  action.reset();
  action.setLoop(THREE.LoopRepeat, Infinity);
  action.setEffectiveWeight(1);
  action.play();
  return action;
}

/** 从 from 交叉淡入到新的循环 action；返回新 action */
export function crossFadeLoopAction(
  mixer: THREE.AnimationMixer,
  from: THREE.AnimationAction | null,
  clip: THREE.AnimationClip,
  duration: number,
  warp = false,
): THREE.AnimationAction {
  const action = startLoopAction(mixer, clip);
  if (from && from !== action) from.crossFadeTo(action, duration, warp);
  return action;
}

/** 播一次一次性 clip（LoopOnce + clampWhenFinished）；返回 action */
export function playOnceAction(
  mixer: THREE.AnimationMixer,
  clip: THREE.AnimationClip,
  from: THREE.AnimationAction | null,
  fade = 0.25,
): THREE.AnimationAction {
  const action = mixer.clipAction(clip);
  action.reset();
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.setEffectiveWeight(1);
  action.play();
  if (from && from !== action) from.crossFadeTo(action, fade, false);
  return action;
}
