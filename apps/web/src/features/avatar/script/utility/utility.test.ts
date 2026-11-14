import { describe, expect, it } from 'vitest';
import type { Scene } from '@wbfm/shared/schemas';
import {
  orderTriggerCandidates,
  rankCandidates,
  rankSceneCandidates,
  selectBestCandidate,
  toDecisionCandidate,
  type DecisionContext,
} from './index';

type PropId = 'teacup' | 'book';

/** 构造最小 Scene：最后一个 beat 决定时长，prop cue 提取道具 */
function scene(id: string, durationMs: number, props: PropId[] = []): Scene {
  return {
    id,
    triggers: [],
    priority: 2,
    cooldownMs: 0,
    interrupt: 'all',
    beats: [
      { at: 0, cue: { kind: 'look', target: 'camera' } },
      ...props.map((prop, index) => ({
        at: 1000 * (index + 1),
        cue: { kind: 'prop', prop, action: 'attach' },
      })),
      { at: durationMs, cue: { kind: 'look', target: 'camera' } },
    ],
  } as Scene;
}

const BASE: DecisionContext = {
  hour: 14,
  relationshipLevel: 1,
  mood: 'normal',
  work: 'unknown',
  idleMinutes: 45,
  recentProps: [],
  recentThemes: [],
  usedTags: [],
};

describe('M3 Utility 打分（阶段 1）', () => {
  it('忙碌时短场景胜出，并给出 work:busy-short 理由', () => {
    const ctx: DecisionContext = { ...BASE, work: 'busy' };
    const ranked = rankCandidates(ctx, [
      toDecisionCandidate(scene('gen.long', 120_000)),
      toDecisionCandidate(scene('gen.short', 45_000)),
    ]);
    expect(ranked[0]?.candidate.sceneId).toBe('gen.short');
    expect(ranked[0]?.reasons.some((reason) => reason.code === 'work:busy-short')).toBe(true);
  });

  it('深夜偏好短场景', () => {
    const ctx: DecisionContext = { ...BASE, hour: 23, work: 'idle' };
    const ranked = rankCandidates(ctx, [
      toDecisionCandidate(scene('gen.long', 120_000)),
      toDecisionCandidate(scene('gen.short', 45_000)),
    ]);
    expect(ranked[0]?.candidate.sceneId).toBe('gen.short');
    expect(ranked[0]?.reasons.some((reason) => reason.code === 'hour:late-night')).toBe(true);
  });

  it('空闲且关系亲近时长场景胜出', () => {
    const ctx: DecisionContext = {
      ...BASE,
      hour: 20,
      work: 'idle',
      relationshipLevel: 3,
      mood: 'low',
    };
    const ranked = rankCandidates(ctx, [
      toDecisionCandidate(scene('gen.long', 120_000)),
      toDecisionCandidate(scene('gen.short', 45_000)),
    ]);
    expect(ranked[0]?.candidate.sceneId).toBe('gen.long');
    expect(
      ranked[0]?.reasons.some(
        (reason) => reason.code === 'work:idle-companion' || reason.code === 'idle:long',
      ),
    ).toBe(true);
  });

  it('最近用过的道具降权', () => {
    const ctx: DecisionContext = { ...BASE, recentProps: ['teacup'] };
    const ranked = rankCandidates(ctx, [
      toDecisionCandidate(scene('gen.tea', 60_000, ['teacup'])),
      toDecisionCandidate(scene('gen.book', 60_000, ['book'])),
    ]);
    expect(ranked[0]?.candidate.sceneId).toBe('gen.book');
    const tea = ranked.find((item) => item.candidate.sceneId === 'gen.tea');
    expect(tea?.reasons.some((reason) => reason.code === 'dedupe:prop')).toBe(true);
  });

  it('同分时按场景 id 稳定排序，重复调用结果一致', () => {
    const candidates = [
      toDecisionCandidate(scene('gen.b', 60_000)),
      toDecisionCandidate(scene('gen.a', 60_000)),
    ];
    expect(rankCandidates(BASE, candidates).map((item) => item.candidate.sceneId)).toEqual([
      'gen.a',
      'gen.b',
    ]);
    expect(selectBestCandidate(BASE, candidates)?.candidate.sceneId).toBe('gen.a');
  });

  it('从 Scene 提取时长、beat 数与道具', () => {
    const candidate = toDecisionCandidate(scene('gen.book', 72_000, ['book']));
    expect(candidate.durationMs).toBe(72_000);
    expect(candidate.beatCount).toBe(3);
    expect(candidate.props).toEqual(['book']);
    expect(candidate.playedToday).toBe(false);
  });

  it('最近主题/梗标签重复时降权', () => {
    const ctx: DecisionContext = { ...BASE, recentThemes: ['喝茶'], usedTags: ['便签'] };
    const ranked = rankCandidates(ctx, [
      { ...toDecisionCandidate(scene('gen.tea', 60_000)), theme: '喝茶' },
      { ...toDecisionCandidate(scene('gen.walk', 60_000)), theme: '散步', tags: ['便签'] },
      { ...toDecisionCandidate(scene('gen.book', 60_000)), theme: '看书', tags: ['书页'] },
    ]);
    expect(ranked[0]?.candidate.sceneId).toBe('gen.book');
    expect(ranked[1]?.reasons.some((reason) => reason.code === 'dedupe:tag')).toBe(true);
    expect(ranked[2]?.reasons.some((reason) => reason.code === 'dedupe:theme')).toBe(true);
  });

  it('弱偏好只是加分项：时段/心情匹配时小幅提升', () => {
    const ctx: DecisionContext = { ...BASE, hour: 12, mood: 'good' };
    const plain = toDecisionCandidate(scene('gen.plain', 60_000));
    const hinted = {
      ...toDecisionCandidate(scene('gen.hint', 60_000)),
      preferredHours: [{ from: 11, to: 13 }],
      preferredMoods: ['good' as const],
    };
    const ranked = rankCandidates(ctx, [plain, hinted]);
    expect(ranked[0]?.candidate.sceneId).toBe('gen.hint');
    expect(ranked[0]?.reasons.some((reason) => reason.code === 'pref:hour')).toBe(true);
    expect(ranked[0]?.reasons.some((reason) => reason.code === 'pref:mood')).toBe(true);
  });

  it('从 Scene + meta 提取主题/标签与弱偏好', () => {
    const candidate = toDecisionCandidate(scene('gen.meta', 60_000), {
      theme: '夜读',
      tags: ['书页'],
      moods: ['low'],
      hours: [{ from: 21, to: 23 }],
    });
    expect(candidate.theme).toBe('夜读');
    expect(candidate.tags).toEqual(['书页']);
    expect(candidate.preferredMoods).toEqual(['low']);
    expect(candidate.preferredHours).toEqual([{ from: 21, to: 23 }]);
  });

  it('rankSceneCandidates 排除候选自身，不会因自己的主题/标签被扣分', () => {
    const ctx: DecisionContext = { ...BASE, recentThemes: ['喝茶'] };
    const meta = {
      'gen.tea': { theme: '喝茶', tags: ['茶'] },
      'gen.walk': { theme: '散步', tags: ['路'] },
    };
    const ranked = rankSceneCandidates(
      ctx,
      [scene('gen.tea', 60_000), scene('gen.walk', 60_000)],
      meta,
      ['gen.tea'],
    );
    const tea = ranked.find((item) => item.candidate.sceneId === 'gen.tea');
    expect(
      tea?.reasons.some(
        (reason) => reason.code === 'dedupe:theme' || reason.code === 'dedupe:tag',
      ),
    ).toBe(false);
  });

  it('同触发键候选按上下文排序：忙时短场景优先，关系名转数值', () => {
    const result = orderTriggerCandidates(
      { hour: 12, relationshipLevel: 'partner', mood: 'normal' },
      {
        work: 'busy',
        recentProps: [],
        recentThemes: [],
        usedTags: [],
        recentSceneIds: [],
        sceneMeta: {},
      },
      [scene('gen.long', 120_000), scene('gen.short', 45_000)],
      0,
    );
    expect(result.ordered[0]?.candidate.sceneId).toBe('gen.short');
    expect(result.context.relationshipLevel).toBe(2);
  });

  it('同分候选在最高分组内轮换，不同分不参与轮换', () => {
    const scenes = [scene('gen.a', 60_000), scene('gen.b', 60_000), scene('gen.long', 120_000)];
    const ctx = { hour: 20, relationshipLevel: 'stranger', mood: 'normal' };
    const extras = {
      work: 'unknown' as const,
      recentProps: [],
      recentThemes: [],
      usedTags: [],
      recentSceneIds: [],
      sceneMeta: {},
    };
    const first = orderTriggerCandidates(ctx, extras, scenes, 0);
    const second = orderTriggerCandidates(ctx, extras, scenes, first.nextRotation);
    expect(first.ordered[0]?.candidate.sceneId).toBe('gen.a');
    expect(second.ordered[0]?.candidate.sceneId).toBe('gen.b');
    expect(first.ordered.at(-1)?.candidate.sceneId).toBe('gen.long');
  });
});
