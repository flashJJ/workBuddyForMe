import { ApiError } from '@wbfm/shared/errors';
import { ProviderError } from '@wbfm/ai';
import {
  createChunkRepository,
  createCompileWriteRepository,
  createDocumentRepository,
  createFtsChunkRepository,
  createKnowledgeRepository,
  deleteVectorsByDocument,
  ensureVectorTable,
  insertChunkVectors,
} from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import { chunkText } from './chunking';
import { resolveEmbeddingTarget } from './embedding-target';
import { extractDocumentText } from './extract-with-ocr';
import {
  assemblePlainText,
  mapChunkCoordinates,
  type StructuredText,
} from './text-structure';
import type { IngestInput, IngestResult } from './types';

const ERROR_EMBEDDING_MISSING = '未配置可用的 embedding 模型，请先在设置中绑定向量模型';
const ERROR_EMPTY = '文档内容为空，无法建立索引';

export function createIngestionPipeline(deps: ServiceDeps) {
  const documents = createDocumentRepository(deps.db);
  const knowledgeBases = createKnowledgeRepository(deps.db);
  const chunks = createChunkRepository(deps.db);
  const fts = createFtsChunkRepository(deps.db);
  const compileWrite = createCompileWriteRepository(deps.db);

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
      let structure: StructuredText;
      let ocrMeta: { engine: 'vision' | 'tesseract'; partial: boolean } | null = null;
      try {
        const extracted = await extractDocumentText(deps, document.filename, buffer, {
          signal,
          onOcrStart: () => {
            documents.setStatus(documentId, 'processing', { ocrStatus: 'running' });
          },
        });
        text = extracted.text;
        ocrMeta = extracted.ocr;
        // 兜底：提取结果未带结构（旧调用方/测试 mock）时由纯文本重建段落结构
        structure = extracted.structure ?? assemblePlainText(extracted.text);
      } catch (error) {
        const message = error instanceof Error ? error.message : '文档解析失败';
        documents.setStatus(documentId, 'failed', {
          errorMessage: message,
          ocrStatus: 'failed',
        });
        return { documentId, status: 'failed', chunkCount: 0, errorMessage: message };
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

      // chunks/vec/fts 三索引同一外层事务（内部仓储事务走 SAVEPOINT），
      // 任一失败整体回滚，避免「向量重建了但 FTS 缺失」的半索引状态
      const writeIndexes = deps.db.transaction(() => {
        const dimension = embeddings[0]?.length ?? 0;
        ensureVectorTable(deps.db, dimension);
        deleteVectorsByDocument(deps.db, documentId);
        fts.deleteByDocument(document.knowledgeBaseId, documentId);
        chunks.deleteByDocument(documentId);
        // v1.3：旧编译产物随索引重建同事务退役（摘要/mention 删除、世代归 0、
        // 状态置 queued），保证提交后检索不会读到上一版内容的静态事实
        compileWrite.purgeForReingest(documentId);

        const coordinates = mapChunkCoordinates(slices, structure.blocks);
        const stored = chunks.bulkInsert(
          documentId,
          slices.map((slice, ordinal) => ({ ordinal, ...slice, ...coordinates[ordinal] })),
        );
        insertChunkVectors(
          deps.db,
          stored.map((row, index) => ({ id: row.id, vector: embeddings[index]! })),
        );
        fts.bulkInsert(
          stored.map((row) => ({
            chunkId: row.id,
            knowledgeBaseId: document.knowledgeBaseId,
            content: row.content,
          })),
        );
      });
      try {
        writeIndexes();
      } catch (error) {
        return fail(documentId, error instanceof Error ? error.message : '向量写入失败');
      }

      // v0.4：OCR 部分成功（超时/超页）→ partial，文本仍可检索但不完整
      const finalStatus = ocrMeta?.partial ? 'partial' : 'indexed';
      documents.setStatus(documentId, finalStatus, {
        chunkCount: slices.length,
        indexedAt: new Date().toISOString(),
        ...(ocrMeta
          ? { ocrStatus: 'done' as const, ocrEngine: ocrMeta.engine }
          : {}),
      });
      return { documentId, status: finalStatus, chunkCount: slices.length };
    },
  };
}

export type IngestionPipeline = ReturnType<typeof createIngestionPipeline>;
