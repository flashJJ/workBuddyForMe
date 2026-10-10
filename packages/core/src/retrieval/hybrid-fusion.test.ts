import { describe, expect, it } from 'vitest';
import { diversify, reciprocalRankFusion, RRF_K } from './hybrid-fusion';

describe('reciprocalRankFusion（RRF 多路排名融合）', () => {
  it('单路输入：分数按 1/(k+rank) 降序，排名与输入一致', () => {
    const fused = reciprocalRankFusion([{ channel: 'vec', hits: [10, 20, 30] }]);
    expect(fused.map((h) => h.chunkId)).toEqual([10, 20, 30]);
    expect(fused[0]!.rrf).toBeCloseTo(1 / (RRF_K + 1));
    expect(fused[0]!.rrf).toBeGreaterThan(fused[1]!.rrf);
    expect(fused[0]!.channels).toEqual(['vec']);
  });

  it('两路一致：同一 chunk 分数相加且 channels 合并', () => {
    const fused = reciprocalRankFusion([
      { channel: 'vec', hits: [1, 2] },
      { channel: 'fts', hits: [1, 3] },
    ]);
    const top = fused.find((h) => h.chunkId === 1)!;
    expect(top.channels).toEqual(['vec', 'fts']);
    // 双路第一名 = 2/(k+1)，必然高于仅一路命中的任何 chunk
    expect(top.rrf).toBeCloseTo(2 / (RRF_K + 1));
    expect(fused[0]!.chunkId).toBe(1);
  });

  it('权重生效：FTS 高权重时只在 FTS 命中的 chunk 可超过向量高位 chunk', () => {
    const equal = reciprocalRankFusion([
      { channel: 'vec', hits: [10] },
      { channel: 'fts', hits: [20] },
    ]);
    // 等权时向量第一名（rank1）与 FTS 第一名同分 → 按 chunkId 升序，10 在前
    expect(equal.map((h) => h.chunkId)).toEqual([10, 20]);

    const weighted = reciprocalRankFusion([
      { channel: 'vec', hits: [10], weight: 0.1 },
      { channel: 'fts', hits: [20], weight: 2 },
    ]);
    expect(weighted[0]!.chunkId).toBe(20);
  });

  it('空通道被忽略；全空返回空数组', () => {
    expect(reciprocalRankFusion([{ channel: 'vec', hits: [] }])).toEqual([]);
    expect(reciprocalRankFusion([])).toEqual([]);
  });

  it('同分确定性：等权且排名相同的不同 chunk 按 chunkId 升序', () => {
    const fused = reciprocalRankFusion([{ channel: 'vec', hits: [30, 10, 20] }]);
    // 不同 rank 分不同，天然有序；再验双路各自独有第一名同分场景
    const tie = reciprocalRankFusion([
      { channel: 'vec', hits: [30] },
      { channel: 'fts', hits: [10] },
    ]);
    expect(tie.map((h) => h.chunkId)).toEqual([10, 30]);
    void fused;
  });
});

describe('diversify（每文档多样性去重）', () => {
  const docOf = (id: number) => (id < 100 ? 'docA' : 'docB');

  it('保持相关性顺序，每文档默认最多 3 条', () => {
    const fused = reciprocalRankFusion([
      { channel: 'vec', hits: [1, 101, 2, 102, 3, 103, 4] },
    ]);
    const result = diversify(fused, docOf);
    // docA: 1,2,3 保留，4 被截；docB: 101,102,103 保留
    expect(result.map((h) => h.chunkId)).toEqual([1, 101, 2, 102, 3, 103]);
  });

  it('maxPerDoc=1 时每文档只留首条（相关性最高的一条）', () => {
    const fused = reciprocalRankFusion([
      { channel: 'vec', hits: [1, 101, 2, 102] },
    ]);
    expect(diversify(fused, docOf, { maxPerDoc: 1 }).map((h) => h.chunkId)).toEqual([
      1, 101,
    ]);
  });

  it('空输入安全；maxPerDoc 非法值被钳到至少 1', () => {
    expect(diversify([], docOf)).toEqual([]);
    const fused = reciprocalRankFusion([{ channel: 'vec', hits: [1, 2] }]);
    expect(diversify(fused, docOf, { maxPerDoc: 0 }).map((h) => h.chunkId)).toEqual([1]);
  });
});
