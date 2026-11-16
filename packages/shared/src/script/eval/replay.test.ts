import { describe, expect, it } from 'vitest';
import type { PetScriptDecisionRecord } from '../../schemas/script/decision';
import { scoreCandidate } from '../score';
import { toDecisionCandidate } from '../select';
import type { DecisionContext } from '../types';
import { replayDecisions } from './replay';

const CONTEXT: DecisionContext = {
  hour: 14,
  relationshipLevel: 1,
  mood: 'normal',
  work: 'unknown',
  idleMinutes: 45,
  recentProps: [],
  recentThemes: [],
  usedTags: [],
};

function recordFor(sceneId: string): PetScriptDecisionRecord {
  const candidate = toDecisionCandidate({
    id: sceneId,
    triggers: [],
    priority: 2,
    cooldownMs: 0,
    interrupt: 'all',
    beats: [{ at: 60_000, cue: { kind: 'look', target: 'camera' } }],
  });
  const scored = scoreCandidate(CONTEXT, candidate);
  return {
    at: 1_700_000_000_000,
    sceneId,
    title: sceneId,
    source: 'proactive',
    score: scored.score,
    reasons: scored.reasons,
    context: {
      hour: CONTEXT.hour,
      idleMinutes: CONTEXT.idleMinutes,
      level: CONTEXT.relationshipLevel,
      mood: CONTEXT.mood,
      work: CONTEXT.work,
    },
  };
}

describe('v4.1 离线回放', () => {
  it('同一权重下回放分与记录一致', () => {
    const record = recordFor('gen.short');
    const summary = replayDecisions([record], {
      'gen.short': toDecisionCandidate({
        id: 'gen.short',
        triggers: [],
        priority: 2,
        cooldownMs: 0,
        interrupt: 'all',
        beats: [{ at: 60_000, cue: { kind: 'look', target: 'camera' } }],
      }),
    });
    expect(summary.replayable).toBe(1);
    expect(summary.rows[0]?.delta).toBe(0);
    expect(summary.rows[0]?.recomputedScore).toBe(record.score);
  });

  it('权重覆盖会改变回放分', () => {
    const record = recordFor('gen.short');
    const candidate = toDecisionCandidate({
      id: 'gen.short',
      triggers: [],
      priority: 2,
      cooldownMs: 0,
      interrupt: 'all',
      beats: [{ at: 60_000, cue: { kind: 'look', target: 'camera' } }],
    });
    const summary = replayDecisions([record], { 'gen.short': candidate }, {
      hour: 0,
      mood: 0,
      level: 0,
      work: 0,
      idleCost: 0,
      fresh: 1,
    });
    expect(summary.rows[0]?.recomputedScore).toBe(1);
    expect(summary.meanAbsDelta).toBeGreaterThan(0);
  });

  it('候选缺失记录标记 missing 且不计入差值', () => {
    const summary = replayDecisions([recordFor('gen.gone')], {});
    expect(summary.missing).toBe(1);
    expect(summary.rows[0]?.missing).toBe(true);
    expect(summary.meanAbsDelta).toBeNull();
  });
});
