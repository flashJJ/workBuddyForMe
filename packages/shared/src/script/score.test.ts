import { describe, expect, it } from 'vitest';
import { PET_SCRIPT_DECISION_LIMITS } from '../schemas/script/decision';
import { DECISION_WEIGHTS, scoreCandidate } from './score';
import type { DecisionCandidate, DecisionContext } from './types';

const BASE_CONTEXT: DecisionContext = {
  hour: 14,
  relationshipLevel: 1,
  mood: 'normal',
  work: 'unknown',
  idleMinutes: 45,
  recentProps: [],
  recentThemes: [],
  usedTags: [],
};

function candidate(overrides: Partial<DecisionCandidate> = {}): DecisionCandidate {
  return {
    sceneId: 'gen.sample',
    durationMs: 60_000,
    beatCount: 4,
    props: [],
    playedToday: false,
    lastPlayedAt: null,
    tags: [],
    ...overrides,
  };
}

describe('v4.1 shared Utility 打分', () => {
  it('默认权重保持 v3.0 取值', () => {
    expect(DECISION_WEIGHTS).toEqual({
      hour: 0.2,
      mood: 0.15,
      level: 0.15,
      work: 0.2,
      idleCost: 0.15,
      fresh: 0.15,
    });
  });

  it('相同输入与权重得到相同分数与理由', () => {
    const first = scoreCandidate(BASE_CONTEXT, candidate());
    const second = scoreCandidate(BASE_CONTEXT, candidate());
    expect(second).toEqual(first);
  });

  it('权重覆盖会改变分数，且不传时保持默认', () => {
    const ctx: DecisionContext = { ...BASE_CONTEXT, work: 'busy' };
    const short = candidate({ durationMs: 30_000 });
    const defaults = scoreCandidate(ctx, short);
    const workOnly = scoreCandidate(ctx, short, {
      hour: 0,
      mood: 0,
      level: 0,
      work: 1,
      idleCost: 0,
      fresh: 0,
    });
    expect(workOnly.score).toBeGreaterThan(defaults.score);
    expect(scoreCandidate(ctx, short)).toEqual(defaults);
  });

  it('理由码按增量绝对值排序且不超过上限', () => {
    const ctx: DecisionContext = {
      ...BASE_CONTEXT,
      hour: 23,
      work: 'busy',
      recentProps: ['teacup'],
      recentThemes: ['tea'],
      usedTags: ['cozy'],
    };
    const result = scoreCandidate(
      ctx,
      candidate({ durationMs: 120_000, props: ['teacup'], theme: 'tea', tags: ['cozy'] }),
    );
    expect(result.reasons.length).toBeLessThanOrEqual(PET_SCRIPT_DECISION_LIMITS.maxReasons);
    const magnitudes = result.reasons.map((reason) => Math.abs(reason.delta));
    expect([...magnitudes].sort((a, b) => b - a)).toEqual(magnitudes);
  });

  it('总分始终落在 0–1', () => {
    const extremes: DecisionContext[] = [
      BASE_CONTEXT,
      { ...BASE_CONTEXT, hour: 3, work: 'busy', idleMinutes: 0 },
      { ...BASE_CONTEXT, hour: 20, work: 'idle', idleMinutes: 120, relationshipLevel: 3 },
    ];
    for (const ctx of extremes) {
      const result = scoreCandidate(ctx, candidate({ durationMs: 120_000 }));
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }
  });
});
