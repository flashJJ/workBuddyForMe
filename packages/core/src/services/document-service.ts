import { createHash } from 'node:crypto';
import { ApiError, type DocumentRecord } from '@wbfm/shared';
import { createDocumentRepository, createKnowledgeRepository, deleteVectorsByDocument } from '@wbfm/database';
import type { ServiceDeps } from './deps';
import { detectKind } from '../ingestion/read-document';
import { createIngestionPipeline } from '../ingestion/ingestion-pipeline';
import { fetchArticle, normalizeClipUrl, toClipError } from '../ingestion/fetch-article';
import type { IngestResult } from '../ingestion/types';

export interface UploadedFile {
  filename: string;
  buffer: Uint8Array;
}

export function hashContent(buffer: Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function createDocumentService(deps: ServiceDeps) {
  const documents = createDocumentRepository(deps.db);
  const knowledgeBases = createKnowledgeRepository(deps.db);
  const pipeline = createIngestionPipeline(deps);

  const requireDocument = (id: string): DocumentRecord => {
    const document = documents.findById(id);
    if (!document) throw ApiError.notFound('文档', id);
    return document;
  };

  return {
    listByKnowledgeBase(knowledgeBaseId: string): DocumentRecord[] {
      if (!knowledgeBases.findById(knowledgeBaseId)) {
        throw ApiError.notFound('知识库', knowledgeBaseId);
      }
      return documents.listByKnowledgeBase(knowledgeBaseId);
    },

    get(id: string): DocumentRecord {
      return requireDocument(id);
    },

    /** 登记上传文档（校验类型/去重），随后由调用方触发后台摄入 */
    upload(knowledgeBaseId: string, { filename, buffer }: UploadedFile): DocumentRecord {
      if (!knowledgeBases.findById(knowledgeBaseId)) {
        throw ApiError.notFound('知识库', knowledgeBaseId);
      }
      const kind = detectKind(filename); // 不支持类型抛 422
      const contentHash = hashContent(buffer);
      const existing = documents.findByHash(knowledgeBaseId, contentHash);
      if (existing) throw ApiError.conflict('相同内容的文档已存在，请勿重复上传');

      const dot = filename.lastIndexOf('.');
      return documents.create({
        knowledgeBaseId,
        filename,
        fileType: dot === -1 ? kind : filename.slice(dot).toLowerCase(),
        byteSize: buffer.byteLength,
        contentHash,
      });
    },

    /**
     * v0.3 网页剪藏：URL 规范化 → 安全抓取+正文抽取 → 来源/正文双重去重 → 登记 pending。
     * 返回 buffer 由调用方随后触发后台摄入（与 upload 同一异步模式）。
     */
    async clip(
      knowledgeBaseId: string,
      rawUrl: string,
    ): Promise<{ document: DocumentRecord; buffer: Uint8Array }> {
      if (!knowledgeBases.findById(knowledgeBaseId)) {
        throw ApiError.notFound('知识库', knowledgeBaseId);
      }
      const normalized = normalizeClipUrl(rawUrl);
      if (documents.findBySourceUrl(knowledgeBaseId, normalized)) {
        throw ApiError.conflict('该网页已剪藏到本知识库，请勿重复导入');
      }

      const article = await fetchArticle(normalized).catch((error: unknown) => {
        throw toClipError(error);
      });
      if (
        article.url !== normalized &&
        documents.findBySourceUrl(knowledgeBaseId, article.url)
      ) {
        throw ApiError.conflict('该网页已剪藏到本知识库（重定向落点），请勿重复导入');
      }
      const contentHash = hashContent(article.buffer);
      if (documents.findByHash(knowledgeBaseId, contentHash)) {
        throw ApiError.conflict('相同正文的网页已存在，请勿重复导入');
      }

      const document = documents.create({
        knowledgeBaseId,
        filename: article.filename,
        fileType: '.md',
        byteSize: article.buffer.byteLength,
        contentHash,
        source: 'webpage',
        sourceUrl: article.url,
      });
      return { document, buffer: article.buffer };
    },

    ingest(documentId: string, buffer: Uint8Array): Promise<IngestResult> {
      requireDocument(documentId);
      return pipeline.ingest({ documentId, buffer });
    },

    delete(id: string): void {
      requireDocument(id);
      deleteVectorsByDocument(deps.db, id);
      documents.delete(id);
    },
  };
}

export type DocumentService = ReturnType<typeof createDocumentService>;
