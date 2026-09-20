import { ApiError } from '@wbfm/shared';
import { ProviderError } from '@wbfm/ai';
import {
  createChunkRepository,
  createDocumentRepository,
  createKnowledgeRepository,
  deleteVectorsByDocument,
  ensureVectorTable,
  insertChunkVectors,
} from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import { chunkText } from './chunking';
import { resolveEmbeddingTarget } from './embedding-target';
import { readDocumentText } from './read-document';
import type { IngestInput, IngestResult } from './types';

const ERROR_EMBEDDING_MISSING = '未配置可用的 embedding 模型，请先在设置中绑定向量模型';
const ERROR_EMPTY = '文档内容为空，无法建立索引';

export function createIngestionPipeline(deps: ServiceDeps) {
  const documents = createDocumentRepository(deps.db);
  const knowledgeBases = createKnowledgeRepository(deps.db);
  const chunks = createChunkRepository(deps.db);

  const fail = (documentId: string, message: string): IngestResult => {
    documents.setStatus(documentId, 'failed', { errorMessage: message });
    return { documentId, status: 'failed', chunkCount: 0, errorMessage: message };
  };

  return {
    /**
     * 文档摄入：解析 → 分片 → 批量嵌入 → 事务落库（chunks + vec0）。
     * 任何阶段失败都将文档置为 failed 并返回原因，不抛出（文档不存在除外）。
     */
    async ingest({ documentId, buffer, signal }: IngestInput): Promise<IngestResult> {
      const document = documents.findById(documentId);
      if (!document) throw ApiError.notFound('文档', documentId);
      const knowledgeBase = knowledgeBases.findById(document.knowledgeBaseId);
      if (!knowledgeBase) return fail(documentId, '所属知识库不存在');

      documents.setStatus(documentId, 'processing');

      const target = resolveEmbeddingTarget(deps);
      if (!target) return fail(documentId, ERROR_EMBEDDING_MISSING);

      let text: string;
      try {
        text = await readDocumentText(document.filename, buffer);
      } catch (error) {
        return fail(documentId, error instanceof Error ? error.message : '文档解析失败');
      }
      if (!text.trim()) return fail(documentId, ERROR_EMPTY);

      const slices = chunkText(text, {
        chunkSize: knowledgeBase.chunkSize,
        chunkOverlap: knowledgeBase.chunkOverlap,
      });
      if (slices.length === 0) return fail(documentId, ERROR_EMPTY);

      let embeddings: number[][];
      try {
        const result = await target.provider.embed({
          model: target.model.modelId,
          input: slices.map((slice) => slice.content),
          signal,
        });
        embeddings = result.vectors;
      } catch (error) {
        // 保留 ApiError/ProviderError 的上游详情（超时/状态码/供应商消息），其余笼统归类
        const message =
          error instanceof ApiError || error instanceof ProviderError
            ? error.message
            : '向量嵌入调用失败';
        return fail(documentId, message);
      }

      try {
        const dimension = embeddings[0]?.length ?? 0;
        ensureVectorTable(deps.db, dimension);
        deleteVectorsByDocument(deps.db, documentId);
        chunks.deleteByDocument(documentId);
        const stored = chunks.bulkInsert(
          documentId,
          slices.map((slice, ordinal) => ({ ordinal, ...slice })),
        );
        insertChunkVectors(
          deps.db,
          stored.map((row, index) => ({ id: row.id, vector: embeddings[index]! })),
        );
      } catch (error) {
        return fail(documentId, error instanceof Error ? error.message : '向量写入失败');
      }

      documents.setStatus(documentId, 'indexed', {
        chunkCount: slices.length,
        indexedAt: new Date().toISOString(),
      });
      return { documentId, status: 'indexed', chunkCount: slices.length };
    },
  };
}

export type IngestionPipeline = ReturnType<typeof createIngestionPipeline>;
