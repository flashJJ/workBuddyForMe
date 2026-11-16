import { describe, expect, it } from 'vitest';
import type { PetScriptDecisionRecord } from '../../schemas/script/decision';
import { attachGate, summarizeDecisions } from './metrics';

function record(
  sceneId: string,
  score: number,
  codes: PetScriptDecisionRecord['reasons'],
): PetScriptDecisionRecord {
  return {
    at: 1_700_000_000_000,
    sceneId,
    title: sceneId,
    source: 'proactive',
    score,
    reasons: codes,
    context: { hour: 21, idleMinutes: 45, level: 2, mood: 'low', work: 'idle' },
  };
}

const RECORDS: PetScriptDecisionRecord[] = [
  record('gen.a', 0.72, [
    { code: 'dedupe:prop', delta: -0.12 },
    { code: 'pref:hour', delta: 0.04 },
    { code: 'fresh:unplayed', delta: 0.075 },
  ]),
  record('gen.a', 0.48, [{ code: 'fresh:unplayed', delta: 0.075 }]),
  record('gen.b', 0.6, [{ code: 'cost:long-scene', delta: -0.06 }]),
];

describe('v4.1 质量指标', () => {
  it('统计重复率、去重/弱偏好/未播命中与理由 Top', () => {
    const report = summarizeDecisions(RECORDS, 50);
    expect(report.window).toBe(50);
    expect(report.count).toBe(3);
    expect(report.repeats).toBe(1);
    expect(report.repeatRate).toBe(0.333);
    expect(report.dedupeHits).toBe(1);
    expect(report.dedupeRate).toBe(0.333);
    expect(report.freshHits).toBe(2);
    expect(report.freshRate).toBe(0.667);
    expect(report.prefHits).toBe(1);
    expect(report.prefRate).toBe(0.333);
    expect(report.longSceneHits).toBe(1);
    expect(report.avgScore).toBe(0.6);
    expect(report.topReasons[0]).toEqual({ code: 'fresh:unplayed', count: 2 });
  });

  it('空记录返回零值报告', () => {
    const report = summarizeDecisions([], 50);
    expect(report.count).toBe(0);
    expect(report.repeatRate).toBe(0);
    expect(report.avgScore).toBe(0);
    expect(report.topReasons).toEqual([]);
  });

  it('attachGate 只替换门控快照', () => {
    const report = summarizeDecisions(RECORDS, 50);
    const withGate = attachGate(report, {
      perDay: 3,
      playsToday: 1,
      budgetRemaining: 2,
      unplayedScenes: 4,
      quietHoursActive: true,
    });
    expect(withGate.gate.budgetRemaining).toBe(2);
    expect(withGate.count).toBe(report.count);
  });
});
