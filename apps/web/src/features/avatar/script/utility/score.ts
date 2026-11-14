import type {
  PetScriptDecisionReason,
  PetScriptDecisionReasonCode,
} from '@wbfm/shared/schemas';
import type { DecisionCandidate, DecisionContext } from './types';

/**
 * M3 Utility 打分（阶段 1）。
 *
 * 硬门控在调用方完成；这里只对合法候选做加权排序，输出总分与理由码。
 * 权重是常量表，先按直觉给一套保守值，真机对比后再调。
 */

export const DECISION_WEIGHTS = {
  hour: 0.2,
  mood: 0.15,
  level: 0.15,
  work: 0.2,
  idleCost: 0.15,
  fresh: 0.15,
} as const;

const NEUTRAL = 0.5;
const MAX_REASONS = 6;

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

function push(
  list: PetScriptDecisionReason[],
  code: PetScriptDecisionReasonCode,
  delta: number,
): void {
  const value = round(delta);
  if (Math.abs(value) >= 0.02) list.push({ code, delta: value });
}

/** 单候选打分；相同输入必须得到相同输出 */
export function scoreCandidate(
  ctx: DecisionContext,
  candidate: DecisionCandidate,
): { score: number; reasons: PetScriptDecisionReason[] } {
  const dims = {
    hour: hourDimension(ctx.hour, candidate.durationMs),
    mood: moodDimension(ctx.mood, candidate.durationMs),
    level: levelDimension(ctx.relationshipLevel, candidate.durationMs),
    work: workDimension(ctx.work, candidate.durationMs),
    idleCost: idleCostDimension(ctx.idleMinutes, candidate),
    fresh: candidate.playedToday ? 0.2 : 1,
  };
  const score = round(
    clamp01(
      dims.hour * DECISION_WEIGHTS.hour +
        dims.mood * DECISION_WEIGHTS.mood +
        dims.level * DECISION_WEIGHTS.level +
        dims.work * DECISION_WEIGHTS.work +
        dims.idleCost * DECISION_WEIGHTS.idleCost +
        dims.fresh * DECISION_WEIGHTS.fresh,
    ),
  );

  const reasons: PetScriptDecisionReason[] = [];
  if (ctx.hour >= 22 || ctx.hour < 6) {
    push(reasons, 'hour:late-night', DECISION_WEIGHTS.hour * (dims.hour - NEUTRAL));
  }
  if (ctx.hour >= 9 && ctx.hour < 18) {
    push(reasons, 'hour:work-hours', DECISION_WEIGHTS.hour * (dims.hour - NEUTRAL));
  }
  if (ctx.mood === 'low') push(reasons, 'mood:calm', DECISION_WEIGHTS.mood * (dims.mood - NEUTRAL));
  if (ctx.mood === 'good') {
    push(reasons, 'mood:lively', DECISION_WEIGHTS.mood * (dims.mood - NEUTRAL));
  }
  if (ctx.relationshipLevel >= 2) {
    push(reasons, 'level:partner', DECISION_WEIGHTS.level * (dims.level - NEUTRAL));
  }
  if (ctx.work === 'busy') {
    push(reasons, 'work:busy-short', DECISION_WEIGHTS.work * (dims.work - NEUTRAL));
  }
  if (ctx.work === 'idle') {
    push(reasons, 'work:idle-companion', DECISION_WEIGHTS.work * (dims.work - NEUTRAL));
  }
  if (ctx.idleMinutes >= 30) {
    push(reasons, 'idle:long', DECISION_WEIGHTS.idleCost * (dims.idleCost - NEUTRAL));
  }
  if (!candidate.playedToday) {
    push(reasons, 'fresh:unplayed', DECISION_WEIGHTS.fresh * (dims.fresh - NEUTRAL));
  }
  if (propOverlap(candidate, ctx.recentProps)) push(reasons, 'dedupe:prop', -0.12);
  if (candidate.durationMs >= 90_000) push(reasons, 'cost:long-scene', -0.06);

  const ranked = [...reasons]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.code.localeCompare(b.code))
    .slice(0, MAX_REASONS);
  return { score, reasons: ranked };
}
