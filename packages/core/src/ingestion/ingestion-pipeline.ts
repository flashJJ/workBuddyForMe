import { ApiError } from '@wbfm/shared/errors';
import { ProviderError } from '@wbfm/ai';
import {
  createChunkRepository,
  createCompileWriteRepository,
  createDocumentBlockRepository,
  createDocumentRepository,
  createFtsChunkRepository,
  createKnowledgeRepository,
  createSettingsRepository,
  deleteVectorsByDocument,
  ensureVectorTable,
  insertChunkVectors,
} from '@wbfm/database';
import { getCompileQueueService } from '../knowledge/compile-queue-service';
import type { ServiceDeps } from '../services/base/deps';
import { chunkDocument } from './structure';
import { resolveEmbeddingTarget } from './embedding-target';
import { extractDocumentText } from './extract-with-ocr';
import {
  fallbackParsedDocument,
  type ParsedDocument,
} from './structure';
import {
  assemblePlainText,
  type StructuredText,
} from './text-structure';
import type { IngestInput, IngestResult } from './types';

const ERROR_EMBEDDING_MISSING = '未配置可用的 embedding 模型，请先在设置中绑定向量模型';
const ERROR_EMPTY = '文档内容为空，无法建立索引';

/**
 * 单批写入的分片数上限。
 * 分片落库（chunks + vec0 + FTS）是同步 CPU/IO 操作，大文档一次性提交会长时间
 * 占住主线程；按批提交可把单次阻塞压到数十毫秒量级。
 */
export const INDEX_WRITE_BATCH_SIZE = 200;

/** 让出事件循环一拍，给渲染/输入等其它任务执行机会 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export function createIngestionPipeline(deps: ServiceDeps) {
  const documents = createDocumentRepository(deps.db);
  const knowledgeBases = createKnowledgeRepository(deps.db);
  const chunks = createChunkRepository(deps.db);
  const blocks = createDocumentBlockRepository(deps.db);
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
      let parsed: ParsedDocument;
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
        parsed = extracted.parsed ?? fallbackParsedDocument(structure, [
          '结构解析结果缺失，已按纯文本块处理',
        ]);
        text = parsed.text;
      } catch (error) {
        const message = error instanceof Error ? error.message : '文档解析失败';
        documents.setStatus(documentId, 'failed', {
          errorMessage: message,
          ocrStatus: 'failed',
        });
        return { documentId, status: 'failed', chunkCount: 0, errorMessage: message };
      }
      if (!text.trim()) return fail(documentId, ERROR_EMPTY);

      const slices = chunkDocument(parsed, {
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

      // 索引重建前先清空旧索引与旧编译产物（短事务：只删不写）。
      // 维度冲突在清理之前判定，避免换模型失败时把仍可用的旧索引删掉。
      try {
        ensureVectorTable(deps.db, embeddings[0]?.length ?? 0);
      } catch (error) {
        return fail(documentId, error instanceof Error ? error.message : '向量写入失败');
      }

      const purgeIndexes = deps.db.transaction(() => {
        deleteVectorsByDocument(deps.db, documentId);
        fts.deleteByDocument(document.knowledgeBaseId, documentId);
        chunks.deleteByDocument(documentId);
        blocks.deleteByDocument(documentId);
        // v1.3：旧编译产物随索引重建同事务退役（摘要/mention 删除、世代归 0、
        // 状态置 queued），保证提交后检索不会读到上一版内容的静态事实
        compileWrite.purgeForReingest(documentId);
      });

      // 单批内 chunks/vec0/FTS 同事务（内部仓储事务嵌套为 SAVEPOINT），
      // 批间让出事件循环；任一批失败则清理已写批次，保持「不留下半索引」的原语义
      const writeChunkBatch = deps.db.transaction((start: number, end: number) => {
        const batch = slices.slice(start, end);
        const stored = chunks.bulkInsert(
          documentId,
          batch.map((slice, index) => ({ ordinal: start + index, ...slice })),
        );
        insertChunkVectors(
          deps.db,
          stored.map((row, index) => ({ id: row.id, vector: embeddings[start + index]! })),
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
        purgeIndexes();
        for (let start = 0; start < slices.length; start += INDEX_WRITE_BATCH_SIZE) {
          writeChunkBatch(start, Math.min(start + INDEX_WRITE_BATCH_SIZE, slices.length));
          if (start + INDEX_WRITE_BATCH_SIZE < slices.length) await yieldToEventLoop();
        }
        blocks.bulkInsert(documentId, parsed.blocks);
      } catch (error) {
        try {
          purgeIndexes();
        } catch {
          // 清理失败不掩盖原始错误
        }
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

      // v1.3 M4：自动编译（autoCompile 缺省开）——索引就绪后入队后台编译，
      // 失败不影响摄入结果；关闭时文档保持 queued 待手动触发
      const settings = createSettingsRepository(deps.db).getJson('app-settings', null) as
        | { autoCompile?: boolean }
        | null;
      if (settings?.autoCompile !== false) {
        getCompileQueueService(deps).enqueue(document.knowledgeBaseId, [documentId]);
      }

      return { documentId, status: finalStatus, chunkCount: slices.length };
    },
  };
}

export type IngestionPipeline = ReturnType<typeof createIngestionPipeline>;
