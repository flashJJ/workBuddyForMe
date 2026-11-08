import { describe, expect, it } from 'vitest';
import type { Memory } from '@wbfm/shared/types';
import {
  fuseMemoryScore,
  normalizeFtsRank,
  recallReason,
  recencyScore,
  resolveRecallWeights,
} from './memory-retriever';

function memory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: '1',
    kind: 'fact',
    content: '用户住在北京',
    importance: 0.6,
    sourceConversationId: null,
    sourceMessageId: null,
    recallCount: 0,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastAccessedAt: null,
    scope: 'global',
    assistantId: null,
    source: 'extract',
    pinned: false,
    confidence: 1,
    subjectKey: null,
    version: 1,
    supersededBy: null,
    validFrom: null,
    validTo: null,
    ttlAt: null,
    lastConfirmedAt: null,
    ...overrides,
  };
}

describe('v2.26 混合召回打分', () => {
  it('权重：有嵌入用语义主导；无嵌入把语义权重并入关键词', () => {
    expect(resolveRecallWeights(true)).toEqual({
      semantic: 0.55,
      lexical: 0.2,
      importance: 0.15,
      recency: 0.1,
    });
    const keyword = resolveRecallWeights(false);
    expect(keyword.semantic).toBe(0);
    expect(keyword.lexical).toBeCloseTo(0.75);
  });

  it('FTS 排名归一化：单条命中满分，末条 0', () => {
    expect(normalizeFtsRank(0, 1)).toBe(1);
    expect(normalizeFtsRank(0, 3)).toBe(1);
    expect(normalizeFtsRank(2, 3)).toBe(0);
  });

  it('新鲜度：置顶/约束不衰减，事件半衰期更短', () => {
    const now = new Date('2026-07-01T00:00:00.000Z');
    const base = { createdAt: '2026-01-01T00:00:00.000Z' };
    expect(recencyScore(memory({ ...base, pinned: true }), now)).toBe(1);
    const fact = recencyScore(memory({ ...base, kind: 'fact' }), now);
    const event = recencyScore(memory({ ...base, kind: 'event' }), now);
    expect(event).toBeLessThan(fact);
  });

  it('融合：置顶分数下限 0.9，理由优先级正确', () => {
    const weights = resolveRecallWeights(true);
    const pinned = fuseMemoryScore(
      { semantic: 0, lexical: 0, importance: 0.5, recency: 1, pinned: true },
      weights,
    );
    expect(pinned).toBe(0.9);
    expect(recallReason({ semantic: 0.8, lexical: 0.5, pinned: false })).toBe('hybrid');
    expect(recallReason({ semantic: 0.8, lexical: 0, pinned: false })).toBe('semantic');
    expect(recallReason({ semantic: 0, lexical: 0.5, pinned: false })).toBe('keyword');
    expect(recallReason({ semantic: 0, lexical: 0, pinned: true })).toBe('pinned');
  });
});
