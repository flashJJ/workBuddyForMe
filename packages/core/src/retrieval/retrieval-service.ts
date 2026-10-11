import {
  createFtsChunkRepository,
  listChunksByIds,
  listChunksByIdsGlobal,
  recallVectorCandidates,
  searchChunks,
} from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import { resolveEmbeddingTarget } from '../ingestion/embedding-target';
import { diversify, reciprocalRankFusion, type ChannelHits } from './hybrid-fusion';
import { ruleRerank } from './rule-rerank';

/** 纯向量回退路径的固定条数（与 v1.2 行为严格一致） */
export const DEFAULT_RETRIEVAL_TOP_K = 4;

/** v1.3 混合检索默认参数 */
export const DEFAULT_CANDIDATE_N = 20;
export const DEFAULT_MAX_CHUNKS = 8;
export const DEFAULT_MIN_VEC_SIMILARITY = 0.55;
export const DEFAULT_MAX_PER_DOC = 3;

export interface RetrievedChunk {
  documentId: string;
  documentName: string;
  ordinal: number;
  content: string;
  /**
   * sqlite-vec L2 距离，越小越相似。FTS 命中但未进入向量候选的片段取
   * Infinity 哨兵（摄取保证每片都有向量，只是不在本路 topN 内），排序时
   * 自然排在有向量距离的片段之后，除非被规则重排的字面信号提升。
   */
  distance: number;
  /** v0.3：网页剪藏来源 URL，本地上传文档为 null */
  sourceUrl: string | null;
  /** v1.3：PDF 页码（无则 null） */
  pageNo?: number | null;
  /** v1.3：段落序号（无则 null） */
  paragraphNo?: number | null;
  /** v1.3：分片在归一化文档中的字符区间 */
  charStart?: number;
  charEnd?: number;
}

export interface RetrieveInput {
  knowledgeBaseId: string;
  query: string;
  topK?: number;
  signal?: AbortSignal;
}

/** v1.5 多库检索入参（query embedding 只计算一次，跨库召回后统一融合） */
export interface RetrieveManyInput {
  knowledgeBaseIds: string[];
  query: string;
  topK?: number;
  signal?: AbortSignal;
}

/** v1.3 检索选项；缺省即全增强（混合+规则重排），关 hybrid 严格回退 v1.2 纯向量 */
export interface RetrievalOptions {
  /** 混合检索（向量+FTS+RRF+规则重排），默认 true；false=v1.2 纯向量 top4 */
  hybridEnabled?: boolean;
  /** 每路候选池大小 */
  candidateN?: number;
  /** 向量相似度下限（单位向量 sim=1-distance/2），低于不入候选 */
  minVecSimilarity?: number;
  /** 同一文档最多保留片段数（多样性去重） */
  maxPerDoc?: number;
  /** 最终注入片段上限（配合 v1.1 token 预算装配） */
  maxChunks?: number;
}

export function createRetrievalService(deps: ServiceDeps) {
  async function embedQuery(
    query: string,
    signal?: AbortSignal,
  ): Promise<number[] | null> {
    const target = resolveEmbeddingTarget(deps);
    if (!target) return null;
    const { vectors } = await target.provider.embed({
      model: target.model.modelId,
      input: [query],
      signal,
    });
    return vectors[0] ?? null;
  }

  /** v1.2 纯向量路径（hybridEnabled=false 的严格回退，固定 top4），v1.5 支持多库 */
  async function retrieveVectorOnlyMany(
    kbIds: string[],
    vector: number[],
    topK: number,
  ): Promise<RetrievedChunk[]> {
    const perKb = await Promise.all(
      kbIds.map((knowledgeBaseId) =>
        searchChunks(deps.db, { knowledgeBaseId, vector, k: topK }),
      ),
    );
    return perKb
      .flat()
      .sort((a, b) => a.distance - b.distance)
      .slice(0, topK);
  }

  /** v1.3 混合路径：每库双通道召回 → 跨库 RRF → 多样性 → 规则重排 */
  async function retrieveHybridMany(
    kbIds: string[],
    query: string,
    vector: number[],
    options: Required<Omit<RetrievalOptions, 'hybridEnabled' | 'topK'>>,
    signal?: AbortSignal,
  ): Promise<RetrievedChunk[]> {
    // 各库向量候选（软下限策略在库内保持：强相关不足保底时回补次相关）
    const distanceById = new Map<number, number>();
    const channels: ChannelHits[] = [];
    const fts = createFtsChunkRepository(deps.db);

    for (const kb of kbIds) {
      const allVec = recallVectorCandidates(deps.db, {
        knowledgeBaseId: kb,
        vector,
        candidateN: options.candidateN,
      });
      const strongVec = allVec.filter((c) => c.similarity >= options.minVecSimilarity);
      const vecHits = strongVec.length >= options.maxChunks ? strongVec : allVec;
      for (const c of allVec) distanceById.set(c.chunkId, c.distance);
      channels.push({ channel: 'vec', hits: vecHits.map((c) => c.chunkId) });
      channels.push({ channel: 'fts', hits: fts.recallChunkIds(kb, query, options.candidateN) });
    }

    const hasAny = channels.some((c) => c.hits.length > 0);
    if (!hasAny) return [];

    const fused = reciprocalRankFusion(channels);

    // 取融合后候选详情（多库：chunk id 全局唯一，直接跨库回查）
    const singleKb = kbIds.length === 1 ? kbIds[0]! : null;
    const details = singleKb
      ? listChunksByIds(deps.db, { knowledgeBaseId: singleKb, chunkIds: fused.map((h) => h.chunkId) })
      : listChunksByIdsGlobal(deps.db, { chunkIds: fused.map((h) => h.chunkId) });
    if (details.length === 0) return [];

    const detailById = new Map(details.map((d) => [d.chunkId, d]));
    const rrfById = new Map(fused.map((h) => [h.chunkId, h]));

    // 多样性去重（真实文档维度），再按上限截取
    const diverse = diversify(
      fused,
      (chunkId) => detailById.get(chunkId)?.documentId ?? `missing-${chunkId}`,
      { maxPerDoc: options.maxPerDoc },
    ).slice(0, options.maxChunks);
    const orderedDetails = diverse
      .map((hit) => detailById.get(hit.chunkId))
      .filter((d): d is NonNullable<typeof d> => Boolean(d));

    const scored = ruleRerank(
      orderedDetails.map((detail) => ({
        chunkId: detail.chunkId,
        content: detail.content,
        documentName: detail.documentName,
        channels: rrfById.get(detail.chunkId)?.channels ?? ['vec'],
        rrf: rrfById.get(detail.chunkId)?.rrf ?? 0,
      })),
      query,
    );
    const scoreById = new Map(scored.map((s) => [s.chunkId, s.score]));

    return orderedDetails
      .slice()
      .sort(
        (a, b) =>
          (scoreById.get(b.chunkId) ?? 0) - (scoreById.get(a.chunkId) ?? 0) ||
          a.chunkId - b.chunkId,
      )
      .map((detail) => ({
        documentId: detail.documentId,
        documentName: detail.documentName,
        ordinal: detail.ordinal,
        content: detail.content,
        distance: distanceById.get(detail.chunkId) ?? Number.POSITIVE_INFINITY,
        sourceUrl: detail.sourceUrl,
        pageNo: detail.pageNo,
        paragraphNo: detail.paragraphNo,
        charStart: detail.charStart,
        charEnd: detail.charEnd,
      }));
  }

  return {
    async retrieve(input: RetrieveInput, options: RetrievalOptions = {}): Promise<RetrievedChunk[]> {
      return this.retrieveMany(
        {
          knowledgeBaseIds: [input.knowledgeBaseId],
          query: input.query,
          ...(input.topK ? { topK: input.topK } : {}),
          ...(input.signal ? { signal: input.signal } : {}),
        },
        options,
      );
    },

    /**
     * v1.5 多库联合检索：query 只 embed 一次，各库分别召回，跨库 RRF 融合后
     * 统一多样性去重与规则重排（混量纲由 RRF k=60 天然归一）；空库数组零成本返回。
     */
    async retrieveMany(
      input: RetrieveManyInput,
      options: RetrievalOptions = {},
    ): Promise<RetrievedChunk[]> {
      const kbIds = [...new Set(input.knowledgeBaseIds)].filter(Boolean);
      const trimmed = input.query.trim();
      if (!trimmed || kbIds.length === 0) return [];

      const vector = await embedQuery(trimmed, input.signal);
      if (!vector) return [];
      const topK = input.topK ?? DEFAULT_RETRIEVAL_TOP_K;

      if (options.hybridEnabled === false) {
        return retrieveVectorOnlyMany(kbIds, vector, topK);
      }
      return retrieveHybridMany(
        kbIds,
        trimmed,
        vector,
        {
          candidateN: options.candidateN ?? DEFAULT_CANDIDATE_N,
          minVecSimilarity: options.minVecSimilarity ?? DEFAULT_MIN_VEC_SIMILARITY,
          maxPerDoc: options.maxPerDoc ?? DEFAULT_MAX_PER_DOC,
          maxChunks: options.maxChunks ?? DEFAULT_MAX_CHUNKS,
        },
        input.signal,
      );
    },
  };
}

export type RetrievalService = ReturnType<typeof createRetrievalService>;
