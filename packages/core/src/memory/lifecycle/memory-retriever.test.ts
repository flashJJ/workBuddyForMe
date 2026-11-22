import { describe, expect, it } from 'vitest';
import type { Memory } from '@wbfm/shared/types';
import {
  MEMORY_RECALL_SCENE_PRESETS,
  applyRecallBudget,
  estimateMemoryTokens,
  fuseMemoryScore,
  normalizeFtsRank,
  recallReason,
  recencyScore,
  resolveMemoryConflicts,
  resolveRecallBudget,
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

describe('v4.21 召回预算', () => {
  it('场景预设：chat/task 3×600，intent-forget 5×750', () => {
    expect(MEMORY_RECALL_SCENE_PRESETS).toEqual({
      chat: { maxItems: 3, maxTokens: 600 },
      task: { maxItems: 3, maxTokens: 600 },
      'intent-forget': { maxItems: 5, maxTokens: 750 },
    });
    expect(resolveRecallBudget()).toEqual({ maxItems: 3, maxTokens: 600 });
  });

  it('显式预算覆盖预设并做下限保护', () => {
    expect(resolveRecallBudget('task', { maxItems: 2 })).toEqual({ maxItems: 2, maxTokens: 600 });
    expect(resolveRecallBudget('chat', { maxItems: 0, maxTokens: -1 })).toEqual({
      maxItems: 1,
      maxTokens: 0,
    });
  });

  it('token 用字符近似：1 token ≈ 2 字符', () => {
    expect(estimateMemoryTokens('')).toBe(0);
    expect(estimateMemoryTokens('abc')).toBe(2);
    expect(estimateMemoryTokens('用户喜欢猫')).toBe(3);
  });

  it('条数预算：只保留分数最高的条目，同分按 id 升序', () => {
    const entries = [
      { id: '10', content: 'b', score: 0.8, pinned: false },
      { id: '2', content: 'a', score: 0.8, pinned: false },
      { id: '3', content: 'c', score: 0.9, pinned: false },
    ];
    const { selected, droppedByBudget } = applyRecallBudget(entries, {
      maxItems: 2,
      maxTokens: 100,
    });
    expect(selected.map((entry) => entry.id)).toEqual(['3', '2']);
    expect(droppedByBudget).toBe(1);
  });

  it('token 预算只裁非置顶条目，置顶永远保留', () => {
    const entries = [
      { id: '1', content: 'x'.repeat(100), score: 0.95, pinned: false },
      { id: '2', content: 'y'.repeat(10), score: 0.7, pinned: true },
      { id: '3', content: 'z'.repeat(40), score: 0.9, pinned: false },
    ];
    const { selected, droppedByBudget } = applyRecallBudget(entries, {
      maxItems: 3,
      maxTokens: 30,
    });
    expect(selected.map((entry) => entry.id)).toEqual(['2', '3']);
    expect(droppedByBudget).toBe(1);
  });

  it('空候选返回空结果', () => {
    expect(applyRecallBudget([], { maxItems: 3, maxTokens: 600 })).toEqual({
      selected: [],
      droppedByBudget: 0,
    });
  });
});

describe('v4.21 冲突裁决', () => {
  interface Candidate {
    id: string;
    subjectKey: string | null;
    pinned: boolean;
    confidence: number;
    version: number;
    createdAt: string;
    lastConfirmedAt: string | null;
  }
  const candidate = (id: string, overrides: Partial<Candidate> = {}): Candidate => ({
    id,
    subjectKey: 'residence:city',
    pinned: false,
    confidence: 1,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastConfirmedAt: null,
    ...overrides,
  });

  it('固定优先：旧但置顶的一条胜出，理由为 pinned', () => {
    const old = candidate('1', { pinned: true, createdAt: '2024-01-01T00:00:00.000Z' });
    const fresh = candidate('2', { createdAt: '2026-06-01T00:00:00.000Z' });
    const { kept, resolutions } = resolveMemoryConflicts([fresh, old]);
    expect(kept.map((entry) => entry.id)).toEqual(['1']);
    expect(resolutions[0]).toMatchObject({ winnerId: '1', reason: 'pinned', loserIds: ['2'] });
  });

  it('新鲜度优先：同固定状态时最新确认的一条胜出', () => {
    const old = candidate('1', { lastConfirmedAt: '2025-01-01T00:00:00.000Z' });
    const fresh = candidate('2', { lastConfirmedAt: '2026-06-01T00:00:00.000Z' });
    expect(resolveMemoryConflicts([old, fresh]).resolutions[0]).toMatchObject({
      winnerId: '2',
      reason: 'fresher',
    });
  });

  it('置信度优先：固定与新鲜度相同时取高置信度', () => {
    const low = candidate('1', { confidence: 0.6 });
    const high = candidate('2', { confidence: 0.95 });
    expect(resolveMemoryConflicts([low, high]).resolutions[0]).toMatchObject({
      winnerId: '2',
      reason: 'higher-confidence',
    });
  });

  it('稳定顺序：全部相同时按 version、id 降序', () => {
    const v1 = candidate('1', { version: 1 });
    const v2 = candidate('2', { version: 2 });
    expect(resolveMemoryConflicts([v1, v2]).resolutions[0]).toMatchObject({
      winnerId: '2',
      reason: 'stable-order',
    });
    const a = candidate('9', { version: 2 });
    const b = candidate('10', { version: 2 });
    expect(resolveMemoryConflicts([a, b]).resolutions[0]!.winnerId).toBe('10');
  });

  it('无主体键不参与裁决，落选值仅从注入集合移除', () => {
    const plain = candidate('1', { subjectKey: null });
    const other = candidate('2', { subjectKey: 'job:city' });
    const duplicate = candidate('3');
    const result = resolveMemoryConflicts([plain, other, duplicate]);
    expect(result.kept.map((entry) => entry.id)).toEqual(['1', '2', '3']);
    expect(result.resolutions).toEqual([]);
  });
});
