import {
  createFtsChunkRepository,
  listChunksByIds,
  recallVectorCandidates,
  searchChunks,
} from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import { resolveEmbeddingTarget } from '../ingestion/embedding-target';
import { diversify, reciprocalRankFusion } from './hybrid-fusion';
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
}

export interface RetrieveInput {
  knowledgeBaseId: string;
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

  /** v1.2 纯向量路径（hybridEnabled=false 的严格回退，固定 top4） */
  async function retrieveVectorOnly(
    input: RetrieveInput,
  ): Promise<RetrievedChunk[]> {
    const vector = await embedQuery(input.query, input.signal);
    if (!vector) return [];
    return searchChunks(deps.db, {
      knowledgeBaseId: input.knowledgeBaseId,
      vector,
      k: input.topK ?? DEFAULT_RETRIEVAL_TOP_K,
    });
  }

  /** v1.3 混合路径：双通道召回 → RRF → 多样性 → 规则重排 */
  async function retrieveHybrid(
    input: RetrieveInput,
    options: Required<Omit<RetrievalOptions, 'hybridEnabled' | 'topK'>>,
  ): Promise<RetrievedChunk[]> {
    const vector = await embedQuery(input.query, input.signal);
    if (!vector) return [];

    // 向量候选（不在 SQL 层硬砍：sim 阈值做「软下限」——高相关不足保底数量时
    // 回补次相关，避免弱相关但仍可参考的片段被一刀切导致结果骤空）
    const allVec = recallVectorCandidates(deps.db, {
      knowledgeBaseId: input.knowledgeBaseId,
      vector,
      candidateN: options.candidateN,
    });
    const strongVec = allVec.filter((c) => c.similarity >= options.minVecSimilarity);
    const vecHits = strongVec.length >= options.maxChunks ? strongVec : allVec;
    const distanceById = new Map(allVec.map((c) => [c.chunkId, c.distance]));
    const fts = createFtsChunkRepository(deps.db);
    const ftsIds = fts.recallChunkIds(input.knowledgeBaseId, input.query, options.candidateN);

    if (vecHits.length === 0 && ftsIds.length === 0) return [];

    const fused = reciprocalRankFusion([
      { channel: 'vec', hits: vecHits.map((c) => c.chunkId) },
      { channel: 'fts', hits: ftsIds },
    ]);

    // 取融合后候选详情（多样性需真实文档 id，先 join 再按文档去重）
    const details = listChunksByIds(deps.db, {
      knowledgeBaseId: input.knowledgeBaseId,
      chunkIds: fused.map((h) => h.chunkId),
    });
    if (details.length === 0) return [];

    const detailById = new Map(details.map((d) => [d.chunkId, d]));
    const rrfById = new Map(fused.map((h) => [h.chunkId, h]));

    // 多样性去重（纯函数，真实文档维度），再按上限截取
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
      input.query,
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
      }));
  }

  return {
    async retrieve(input: RetrieveInput, options: RetrievalOptions = {}): Promise<RetrievedChunk[]> {
      const trimmed = input.query.trim();
      if (!trimmed) return [];
      const nextInput = { ...input, query: trimmed };

      if (options.hybridEnabled === false) return retrieveVectorOnly(nextInput);

      return retrieveHybrid(nextInput, {
        candidateN: options.candidateN ?? DEFAULT_CANDIDATE_N,
        minVecSimilarity: options.minVecSimilarity ?? DEFAULT_MIN_VEC_SIMILARITY,
        maxPerDoc: options.maxPerDoc ?? DEFAULT_MAX_PER_DOC,
        maxChunks: options.maxChunks ?? DEFAULT_MAX_CHUNKS,
      });
    },
  };
}

export type RetrievalService = ReturnType<typeof createRetrievalService>;
