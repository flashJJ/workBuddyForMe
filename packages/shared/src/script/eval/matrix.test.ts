import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EVAL_CONTEXTS,
  diffMatrix,
  runMatrix,
} from './matrix';
import type { CompanionCandidateSnapshot, CompanionMatrixRow } from './types';

const CANDIDATES: CompanionCandidateSnapshot[] = [
  { sceneId: 'gen.short', durationMs: 30_000, props: [], tags: ['tea'] },
  { sceneId: 'gen.medium', durationMs: 60_000, props: ['book'], tags: ['read'] },
  { sceneId: 'gen.long', durationMs: 120_000, props: ['table'], tags: ['work'] },
];

describe('v4.1 场景矩阵', () => {
  it('固定 12 组上下文', () => {
    expect(DEFAULT_EVAL_CONTEXTS).toHaveLength(12);
    expect(new Set(DEFAULT_EVAL_CONTEXTS.map((context) => context.id)).size).toBe(12);
  });

  it('同一输入连续两次输出完全一致', () => {
    const first = runMatrix(DEFAULT_EVAL_CONTEXTS, CANDIDATES);
    const second = runMatrix(DEFAULT_EVAL_CONTEXTS, CANDIDATES);
    expect(second).toEqual(first);
    expect(first.every((row) => row.ranked.length === CANDIDATES.length)).toBe(true);
  });

  it('权重覆盖会改变排序', () => {
    const context = [{ ...DEFAULT_EVAL_CONTEXTS[0]!, hour: 20, work: 'busy' as const }];
    const byWork = runMatrix(context, CANDIDATES);
    const byHour = runMatrix(context, CANDIDATES, {
      hour: 1,
      mood: 0,
      level: 0,
      work: 0,
      idleCost: 0,
      fresh: 0,
    });
    expect(byWork[0]?.ranked[0]?.sceneId).toBe('gen.short');
    expect(byHour[0]?.ranked[0]?.sceneId).toBe('gen.long');
    expect(diffMatrix(byWork, byHour).length).toBeGreaterThan(0);
  });

  it('diffMatrix 输出换位与掉出场景', () => {
    const previous: CompanionMatrixRow[] = [
      {
        contextId: 'ctx-01',
        label: 'a',
        ranked: [
          { sceneId: 'gen.short', score: 0.8, reasons: [] },
          { sceneId: 'gen.long', score: 0.4, reasons: [] },
        ],
      },
    ];
    const next: CompanionMatrixRow[] = [
      {
        contextId: 'ctx-01',
        label: 'a',
        ranked: [
          { sceneId: 'gen.long', score: 0.7, reasons: [] },
          { sceneId: 'gen.new', score: 0.5, reasons: [] },
        ],
      },
    ];
    expect(diffMatrix(previous, next)).toEqual([
      { contextId: 'ctx-01', sceneId: 'gen.long', fromRank: 2, toRank: 1 },
      { contextId: 'ctx-01', sceneId: 'gen.new', fromRank: null, toRank: 2 },
      { contextId: 'ctx-01', sceneId: 'gen.short', fromRank: 1, toRank: null },
    ]);
  });
});
