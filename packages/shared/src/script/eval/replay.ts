import type {
  PetScriptDecisionReasonCode,
  PetScriptDecisionRecord,
} from '../../schemas/script/decision';
import { baseScore, type DecisionWeights } from '../score';
import type { DecisionCandidate, DecisionContext } from '../types';
import type { CompanionReplayRow, CompanionReplaySummary } from './types';

/**
 * v4.1 离线回放：用当前权重重算六个基础维度，叠加记录里的去重/偏好/长场次增量。
 *
 * 决策记录不保存最近的 props/themes/tags 集合，无法重算去重维度；因此这些增量
 * 直接沿用记录中的理由码 delta。报告需标注该口径，不把回放分等同于线上原始分。
 */

const RECORDED_ADJUSTMENTS: ReadonlySet<PetScriptDecisionReasonCode> = new Set([
  'dedupe:prop',
  'dedupe:theme',
  'dedupe:tag',
  'cost:long-scene',
  'pref:hour',
  'pref:mood',
]);

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function toDecisionContext(record: PetScriptDecisionRecord): DecisionContext {
  return {
    hour: record.context.hour,
    relationshipLevel: record.context.level,
    mood: record.context.mood,
    work: record.context.work,
    idleMinutes: record.context.idleMinutes,
    recentProps: [],
    recentThemes: [],
    usedTags: [],
  };
}

function replayOne(
  record: PetScriptDecisionRecord,
  candidate: DecisionCandidate | undefined,
  weights?: DecisionWeights,
): CompanionReplayRow {
  if (!candidate) {
    return {
      at: record.at,
      sceneId: record.sceneId,
      recordedScore: record.score,
      recomputedScore: null,
      delta: null,
      missing: true,
    };
  }
  const playedToday = !record.reasons.some((reason) => reason.code === 'fresh:unplayed');
  const adjustments = record.reasons
    .filter((reason) => RECORDED_ADJUSTMENTS.has(reason.code))
    .reduce((sum, reason) => sum + reason.delta, 0);
  const recomputedScore = round(
    clamp01(baseScore(toDecisionContext(record), { ...candidate, playedToday }, weights) + adjustments),
  );
  return {
    at: record.at,
    sceneId: record.sceneId,
    recordedScore: record.score,
    recomputedScore,
    delta: round(recomputedScore - record.score),
    missing: false,
  };
}

export function replayDecisions(
  records: readonly PetScriptDecisionRecord[],
  candidatesById: Readonly<Record<string, DecisionCandidate>>,
  weights?: DecisionWeights,
): CompanionReplaySummary {
  const rows = records.map((record) => replayOne(record, candidatesById[record.sceneId], weights));
  const deltas = rows
    .filter((row): row is CompanionReplayRow & { delta: number } => row.delta !== null)
    .map((row) => row.delta);
  const meanAbsDelta = deltas.length
    ? round(deltas.reduce((sum, value) => sum + Math.abs(value), 0) / deltas.length)
    : null;
  const maxAbsDelta = deltas.length
    ? round(Math.max(...deltas.map((value) => Math.abs(value))))
    : null;
  return {
    rows,
    total: rows.length,
    replayable: rows.filter((row) => !row.missing).length,
    missing: rows.filter((row) => row.missing).length,
    meanAbsDelta,
    maxAbsDelta,
  };
}
