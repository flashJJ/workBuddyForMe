import { createHash } from 'node:crypto';
import { ApiError, type DocumentRecord } from '@wbfm/shared';
import { createDocumentRepository, createKnowledgeRepository, deleteVectorsByDocument } from '@wbfm/database';
import type { ServiceDeps } from './deps';
import { detectKind } from '../ingestion/read-document';
import { createIngestionPipeline } from '../ingestion/ingestion-pipeline';
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
