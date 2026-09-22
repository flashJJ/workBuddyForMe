import { searchChunks } from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import { resolveEmbeddingTarget } from '../ingestion/embedding-target';

export const DEFAULT_RETRIEVAL_TOP_K = 4;

export interface RetrievedChunk {
  documentId: string;
  documentName: string;
  ordinal: number;
  content: string;
  /** sqlite-vec L2 距离，越小越相似 */
  distance: number;
  /** v0.3：网页剪藏来源 URL，本地上传文档为 null */
  sourceUrl: string | null;
}

export interface RetrieveInput {
  knowledgeBaseId: string;
  query: string;
  topK?: number;
  signal?: AbortSignal;
}

export function createRetrievalService(deps: ServiceDeps) {
  return {
    /** 查询 embedding → vec0 top-k；未配置 embedding 模型或空库时返回空数组 */
    async retrieve({ knowledgeBaseId, query, topK, signal }: RetrieveInput): Promise<
      RetrievedChunk[]
    > {
      const trimmed = query.trim();
      if (!trimmed) return [];
      const target = resolveEmbeddingTarget(deps);
      if (!target) return [];

      const { vectors } = await target.provider.embed({
        model: target.model.modelId,
        input: [trimmed],
        signal,
      });
      const queryVector = vectors[0];
      if (!queryVector) return [];

      const k = topK ?? DEFAULT_RETRIEVAL_TOP_K;
      return searchChunks(deps.db, { knowledgeBaseId, vector: queryVector, k }).map((hit) => ({
        documentId: hit.documentId,
        documentName: hit.documentName,
        ordinal: hit.ordinal,
        content: hit.content,
        distance: hit.distance,
        sourceUrl: hit.sourceUrl,
      }));
    },
  };
}

export type RetrievalService = ReturnType<typeof createRetrievalService>;
