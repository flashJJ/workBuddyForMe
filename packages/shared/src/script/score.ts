import {
  PET_SCRIPT_DECISION_LIMITS,
  type PetScriptDecisionReason,
  type PetScriptDecisionReasonCode,
} from '../schemas/script/decision';
import type { DecisionCandidate, DecisionContext } from './types';

/**
 * M3 Utility 打分（阶段 1）；v4.1 下沉到 shared，供 web 与离线评测共用。
 *
 * 硬门控在调用方完成；这里只对合法候选做加权排序，输出总分与理由码。
 * 权重是常量表；评测脚本可传入覆盖值做「调参前后」对比，线上调用不传即保持默认。
 */

export interface DecisionWeights {
  hour: number;
  mood: number;
  level: number;
  work: number;
  idleCost: number;
  fresh: number;
}

export const DECISION_WEIGHTS: DecisionWeights = {
  hour: 0.2,
  mood: 0.15,
  level: 0.15,
  work: 0.2,
  idleCost: 0.15,
  fresh: 0.15,
};

const NEUTRAL = 0.5;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function hourDimension(hour: number, durationMs: number): number {
  if (hour >= 22 || hour < 6) return durationMs <= 60_000 ? 0.95 : 0.3;
  if (hour >= 9 && hour < 18) return durationMs <= 90_000 ? 0.85 : 0.4;
  return 0.55 + 0.15 * clamp01((durationMs - 60_000) / 60_000);
}

function moodDimension(mood: string, durationMs: number): number {
  if (mood === 'low') return durationMs >= 90_000 ? 0.85 : 0.55;
  if (mood === 'good') return durationMs <= 90_000 ? 0.9 : 0.4;
  return NEUTRAL;
}

function levelDimension(level: number, durationMs: number): number {
  if (level >= 2) return durationMs >= 90_000 ? 0.85 : 0.6;
  if (level <= 1) return durationMs <= 60_000 ? 0.8 : 0.4;
  return NEUTRAL;
}

function workDimension(work: DecisionContext['work'], durationMs: number): number {
  if (work === 'busy') return durationMs <= 60_000 ? 0.95 : 0.15;
  if (work === 'idle') return durationMs >= 90_000 ? 0.85 : 0.55;
  return NEUTRAL;
}

function idleCostDimension(idleMinutes: number, candidate: DecisionCandidate): number {
  const idle = clamp01(idleMinutes / 30);
  const cost = clamp01(1 - candidate.durationMs / 120_000 - candidate.props.length * 0.05);
  return idle * 0.5 + cost * 0.5;
}

function propOverlap(candidate: DecisionCandidate, recentProps: readonly string[]): boolean {
  return candidate.props.some((prop) => recentProps.includes(prop));
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function sameTheme(candidate: DecisionCandidate, recentThemes: readonly string[]): boolean {
  if (!candidate.theme) return false;
  const theme = normalizeKey(candidate.theme);
  return recentThemes.some((item) => normalizeKey(item) === theme);
}

function sharedTagCount(candidate: DecisionCandidate, usedTags: readonly string[]): number {
  return candidate.tags.filter((tag) =>
    usedTags.some((used) => normalizeKey(used) === normalizeKey(tag)),
  ).length;
}

function inHourWindow(hour: number, from: number, to: number): boolean {
  return from <= to ? hour >= from && hour <= to : hour >= from || hour <= to;
}

function push(
  list: PetScriptDecisionReason[],
  code: PetScriptDecisionReasonCode,
  delta: number,
): void {
  const value = round(delta);
  if (Math.abs(value) >= 0.02) list.push({ code, delta: value });
}

/** 单候选打分；相同输入与权重必须得到相同输出 */
export function scoreCandidate(
  ctx: DecisionContext,
  candidate: DecisionCandidate,
  weights: DecisionWeights = DECISION_WEIGHTS,
): { score: number; reasons: PetScriptDecisionReason[] } {
  const dims = {
    hour: hourDimension(ctx.hour, candidate.durationMs),
    mood: moodDimension(ctx.mood, candidate.durationMs),
    level: levelDimension(ctx.relationshipLevel, candidate.durationMs),
    work: workDimension(ctx.work, candidate.durationMs),
    idleCost: idleCostDimension(ctx.idleMinutes, candidate),
    fresh: candidate.playedToday ? 0.2 : 1,
  };
  const base =
    dims.hour * weights.hour +
    dims.mood * weights.mood +
    dims.level * weights.level +
    dims.work * weights.work +
    dims.idleCost * weights.idleCost +
    dims.fresh * weights.fresh;
  // 去重与弱偏好必须真正影响排序，而不只是解释文案
  const propDup = propOverlap(candidate, ctx.recentProps);
  const themeDup = sameTheme(candidate, ctx.recentThemes);
  const tagDup = sharedTagCount(candidate, ctx.usedTags) > 0;
  const prefHour =
    candidate.preferredHours?.some((window) => inHourWindow(ctx.hour, window.from, window.to)) ??
    false;
  const prefMood = candidate.preferredMoods?.some((mood) => mood === ctx.mood) ?? false;
  const longScene = candidate.durationMs >= 90_000;
  const penalty =
    (propDup ? -0.12 : 0) +
    (themeDup ? -0.15 : 0) +
    (tagDup ? -0.08 : 0) +
    (longScene ? -0.06 : 0);
  const bonus = (prefHour ? 0.04 : 0) + (prefMood ? 0.03 : 0);
  const score = round(clamp01(base + penalty + bonus));

  const reasons: PetScriptDecisionReason[] = [];
  if (ctx.hour >= 22 || ctx.hour < 6) {
    push(reasons, 'hour:late-night', weights.hour * (dims.hour - NEUTRAL));
  }
  if (ctx.hour >= 9 && ctx.hour < 18) {
    push(reasons, 'hour:work-hours', weights.hour * (dims.hour - NEUTRAL));
  }
  if (ctx.mood === 'low') push(reasons, 'mood:calm', weights.mood * (dims.mood - NEUTRAL));
  if (ctx.mood === 'good') {
    push(reasons, 'mood:lively', weights.mood * (dims.mood - NEUTRAL));
  }
  if (ctx.relationshipLevel >= 2) {
    push(reasons, 'level:partner', weights.level * (dims.level - NEUTRAL));
  }
  if (ctx.work === 'busy') {
    push(reasons, 'work:busy-short', weights.work * (dims.work - NEUTRAL));
  }
  if (ctx.work === 'idle') {
    push(reasons, 'work:idle-companion', weights.work * (dims.work - NEUTRAL));
  }
  if (ctx.idleMinutes >= 30) {
    push(reasons, 'idle:long', weights.idleCost * (dims.idleCost - NEUTRAL));
  }
  if (!candidate.playedToday) {
    push(reasons, 'fresh:unplayed', weights.fresh * (dims.fresh - NEUTRAL));
  }
  if (propDup) push(reasons, 'dedupe:prop', -0.12);
  if (themeDup) push(reasons, 'dedupe:theme', -0.15);
  if (tagDup) push(reasons, 'dedupe:tag', -0.08);
  if (longScene) push(reasons, 'cost:long-scene', -0.06);
  if (prefHour) push(reasons, 'pref:hour', 0.04);
  if (prefMood) push(reasons, 'pref:mood', 0.03);

  const ranked = [...reasons]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.code.localeCompare(b.code))
    .slice(0, PET_SCRIPT_DECISION_LIMITS.maxReasons);
  return { score, reasons: ranked };
}
