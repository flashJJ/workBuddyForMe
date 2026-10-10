/**
 * 混合检索纯函数（v1.3 M1）：召回排名融合与多样性去重。
 *
 * 向量 L2 距离与 FTS5 bm25 分量纲不同，直接加权需要反复标定；这里采用
 * Reciprocal Rank Fusion（Cormack et al. 2009），只依赖各路内部排名：
 *   score(d) = Σ_channel weight_c · 1 / (k + rank_c(d))
 * 免标定、对各路分数量纲不敏感，权重仅用于调节「路与路」的相对重要性。
 */

export type RecallChannel = 'vec' | 'fts';

export interface ChannelHits {
  channel: RecallChannel;
  /** 路内已按相关性从高到低排序的 chunk id（允许跨路重复同一 chunk） */
  hits: number[];
  /** 路权重，默认 1（两路等权）；范围建议 (0, 2] */
  weight?: number;
}

export interface FusedHit {
  chunkId: number;
  /** RRF 融合分（越高越相关，仅用于排序，不展示给用户） */
  rrf: number;
  /** 该 chunk 被哪些通道命中（双通道命中是高置信信号，供重排加权） */
  channels: RecallChannel[];
}

/** RRF 平滑常数；文献默认 60，削弱头部排名的极端差距 */
export const RRF_K = 60;

/** 融合分比较器：分高在前；同分时按 chunkId 升序保证确定性输出 */
function compareFused(a: FusedHit, b: FusedHit): number {
  if (b.rrf !== a.rrf) return b.rrf - a.rrf;
  return a.chunkId - b.chunkId;
}

/**
 * 多路排名 RRF 融合。
 * 同 chunk 在多路命中时分数相加并合并 channels；空通道被忽略。
 */
export function reciprocalRankFusion(
  channels: readonly ChannelHits[],
  k: number = RRF_K,
): FusedHit[] {
  const acc = new Map<number, FusedHit>();
  for (const { channel, hits, weight = 1 } of channels) {
    if (!hits.length) continue;
    hits.forEach((chunkId, index) => {
      const contribution = weight / (k + index + 1); // rank 从 1 起
      const existing = acc.get(chunkId);
      if (existing) {
        existing.rrf += contribution;
        if (!existing.channels.includes(channel)) existing.channels.push(channel);
      } else {
        acc.set(chunkId, { chunkId, rrf: contribution, channels: [channel] });
      }
    });
  }
  return [...acc.values()].sort(compareFused);
}

export interface DiversifyOptions {
  /** 每个文档最多保留的片段数（默认 3），超出按融合分保留前面的 */
  maxPerDoc: number;
}

/**
 * 每文档多样性去重：保持相关性顺序，同一文档至多保留 maxPerDoc 个片段。
 * docOf 在遍历时为每个 chunk 解析文档 id；返回顺序与输入一致（稳定）。
 */
export function diversify(
  fused: readonly FusedHit[],
  docOf: (chunkId: number) => string,
  options: DiversifyOptions = { maxPerDoc: 3 },
): FusedHit[] {
  const max = Math.max(1, options.maxPerDoc);
  const seenPerDoc = new Map<string, number>();
  const result: FusedHit[] = [];
  for (const hit of fused) {
    const docId = docOf(hit.chunkId);
    const used = seenPerDoc.get(docId) ?? 0;
    if (used >= max) continue;
    seenPerDoc.set(docId, used + 1);
    result.push(hit);
  }
  return result;
}
