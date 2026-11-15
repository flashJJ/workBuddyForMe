import { describe, expect, it } from 'vitest';
import {
  PET_SCRIPT_DECISION_LIMITS,
  type PetScriptDecisionRecord,
} from '@wbfm/shared/schemas';
import { appendDecision, resolveDecisions, toDecisionRecord } from './index';

function record(at: number, sceneId = 'gen.test'): PetScriptDecisionRecord {
  return {
    at,
    sceneId,
    title: sceneId,
    source: 'proactive',
    score: 0.7,
    reasons: [{ code: 'fresh:unplayed', delta: 0.075 }],
    context: { hour: 14, idleMinutes: 45, level: 1, mood: 'normal', work: 'unknown' },
  };
}

describe('M3 最近决策存储', () => {
  it('按时间倒序并丢弃坏记录', () => {
    const state = resolveDecisions({
      items: [record(1), { bad: true }, record(3), null, record(2)],
    });
    expect(state.items.map((item) => item.at)).toEqual([3, 2, 1]);
  });

  it('超过上限淘汰最旧', () => {
    let state = resolveDecisions(null);
    for (let index = 0; index < PET_SCRIPT_DECISION_LIMITS.maxStored + 5; index += 1) {
      state = appendDecision(state, record(index + 1, `gen.${index}`));
    }
    expect(state.items).toHaveLength(PET_SCRIPT_DECISION_LIMITS.maxStored);
    expect(state.items[0]?.at).toBe(PET_SCRIPT_DECISION_LIMITS.maxStored + 5);
    expect(state.items.at(-1)?.at).toBe(6);
  });

  it('上报记录补标题，空标题回退 sceneId', () => {
    const report = {
      sceneId: 'gen.teacup',
      source: 'proactive' as const,
      score: 0.66,
      reasons: [{ code: 'hour:late-night' as const, delta: 0.12 }],
      context: { hour: 23, idleMinutes: 32, level: 2, mood: 'low', work: 'idle' as const },
    };
    expect(toDecisionRecord(report, 100, '  茶杯  ').title).toBe('茶杯');
    expect(toDecisionRecord(report, 100, '   ').title).toBe('gen.teacup');
  });
});
