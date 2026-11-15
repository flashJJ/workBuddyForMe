import type {
  PetScriptDecisionReasonCode,
  PetScriptDecisionRecord,
} from '../../schemas/script/decision';
import type { CompanionQualityReport, QualityGateSnapshot } from './types';

/** 决策质量汇总（只依赖记录字段，不读取聊天正文） */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function rate(hits: number, total: number): number {
  return total > 0 ? round(hits / total) : 0;
}

const EMPTY_GATE: QualityGateSnapshot = {
  perDay: 0,
  playsToday: 0,
  budgetRemaining: 0,
  unplayedScenes: 0,
  quietHoursActive: false,
};

export function summarizeDecisions(
  records: readonly PetScriptDecisionRecord[],
  window = records.length,
): CompanionQualityReport {
  const count = records.length;
  const sceneIds = new Set(records.map((record) => record.sceneId));
  const reasonCounts = new Map<PetScriptDecisionReasonCode, number>();
  let dedupeHits = 0;
  let freshHits = 0;
  let prefHits = 0;
  let longSceneHits = 0;
  let scoreSum = 0;

  for (const record of records) {
    scoreSum += record.score;
    const codes = record.reasons.map((reason) => reason.code);
    const isDedupe = codes.some((code) => code.startsWith('dedupe:'));
    const isPref = codes.some((code) => code === 'pref:hour' || code === 'pref:mood');
    if (isDedupe) dedupeHits += 1;
    if (codes.includes('fresh:unplayed')) freshHits += 1;
    if (isPref) prefHits += 1;
    if (codes.includes('cost:long-scene')) longSceneHits += 1;
    for (const code of codes) {
      reasonCounts.set(code, (reasonCounts.get(code) ?? 0) + 1);
    }
  }

  const topReasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([code, hits]) => ({ code, count: hits }));

  return {
    window,
    count,
    repeats: count - sceneIds.size,
    repeatRate: rate(count - sceneIds.size, count),
    dedupeHits,
    dedupeRate: rate(dedupeHits, count),
    freshHits,
    freshRate: rate(freshHits, count),
    prefHits,
    prefRate: rate(prefHits, count),
    longSceneHits,
    avgScore: count > 0 ? round(scoreSum / count) : 0,
    topReasons,
    gate: EMPTY_GATE,
  };
}

export function attachGate(
  report: CompanionQualityReport,
  gate: QualityGateSnapshot,
): CompanionQualityReport {
  return { ...report, gate };
}
