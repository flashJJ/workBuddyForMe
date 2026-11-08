import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApiError } from '@wbfm/shared/errors';
import { DOCUMENT_PARSE_VERSION } from '@wbfm/shared/constants';
import { type DocumentRecord } from '@wbfm/shared/types';
import {
  createDocumentBlockRepository,
  createDocumentRepository,
  createKnowledgeRepository,
  deleteVectorsByDocument,
} from '@wbfm/database';
import { resolveDataPath } from '@wbfm/config';
import type { ServiceDeps } from '../base/deps';
import { detectKind } from '../../ingestion/read-document';
import { createIngestionPipeline } from '../../ingestion/ingestion-pipeline';
import { fetchArticle, normalizeClipUrl, toClipError } from '../../ingestion/fetch-article';
import { resolveVisionTarget } from '../../ingestion/vision-target';
import type { IngestResult } from '../../ingestion/types';
import { summarizeDocumentFigure } from './document-figure-service';
import {
  buildDocumentStructureView,
  type DocumentStructureView,
} from './structure/document-structure-view';

export interface UploadedFile {
  filename: string;
  buffer: Uint8Array;
}

/** v2.19：结构预览 API 返回（块 id 仅视图层使用，不入库） */
export type { DocumentStructureView } from './structure/document-structure-view';

export function hashContent(buffer: Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function createDocumentService(deps: ServiceDeps) {
  const documents = createDocumentRepository(deps.db);
  const blocks = createDocumentBlockRepository(deps.db);
  const knowledgeBases = createKnowledgeRepository(deps.db);
  const pipeline = createIngestionPipeline(deps);
  const sourceDir = resolveDataPath('documents');
  const sourcePath = (id: string) => join(sourceDir, `${id}.bin`);

  const saveSource = (id: string, buffer: Uint8Array): void => {
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(sourcePath(id), buffer);
  };

  const readSource = (id: string): Uint8Array | null =>
    existsSync(sourcePath(id)) ? new Uint8Array(readFileSync(sourcePath(id))) : null;

  /** v2.29：可等待的重建；批量队列用它串行执行并隔离单篇失败 */
  const reparseNow = async (id: string): Promise<IngestResult> => {
    const source = readSource(id);
    if (!source) {
      throw ApiError.validation('原始文件未保留，无法重建结构；请重新上传该文档后再试');
    }
    return pipeline.ingest({ documentId: id, buffer: source });
  };

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

    /** v2.19：文档结构预览（页/章节/块/表格/解析警告） */
    getStructure(id: string): DocumentStructureView {
      return buildDocumentStructureView({
        document: requireDocument(id),
        stored: blocks.listByDocument(id),
        sourceRetained: existsSync(sourcePath(id)),
        visionAvailable: resolveVisionTarget(deps) !== null,
      });
    },

    /**
     * v2.19：手动重建结构/分块/索引。必须保留原始文件；
     * 重建失败时管线在写入事务前失败，旧索引保持不变。
     */
    reparse(id: string): { queued: true } {
      requireDocument(id);
      if (!existsSync(sourcePath(id))) {
        throw ApiError.validation('原始文件未保留，无法重建结构；请重新上传该文档后再试');
      }
      void reparseNow(id).catch((error: unknown) => {
        console.error(`[reparse] 文档 ${id} 重建异常：`, error);
      });
      return { queued: true };
    },

    /** v2.29：批量重建使用；调用方负责串行与失败隔离 */
    reparseNow(id: string): Promise<IngestResult> {
      requireDocument(id);
      return reparseNow(id);
    },

    hasSource(id: string): boolean {
      requireDocument(id);
      return existsSync(sourcePath(id));
    },

    listPendingReparse(knowledgeBaseId: string): DocumentRecord[] {
      if (!knowledgeBases.findById(knowledgeBaseId)) {
        throw ApiError.notFound('知识库', knowledgeBaseId);
      }
      return documents.listPendingReparse(knowledgeBaseId, DOCUMENT_PARSE_VERSION);
    },

    /** v2.19 M4：按需解读图注所在 PDF 页面（视觉模型可选；未配置时明确拒绝） */
    summarizeFigure(id: string, blockId: string, signal?: AbortSignal) {
      const document = requireDocument(id);
      return summarizeDocumentFigure({
        deps,
        document,
        blocks: blocks.listByDocument(id),
        blockId,
        source: readSource(id),
        ...(signal ? { signal } : {}),
      });
    },

    /** 登记上传文档（校验类型/去重），随后由调用方触发后台摄入 */
    upload(knowledgeBaseId: string, { filename, buffer }: UploadedFile): DocumentRecord {
      if (!knowledgeBases.findById(knowledgeBaseId)) {
        throw ApiError.notFound('知识库', knowledgeBaseId);
      }
      const kind = detectKind(filename); // 不支持类型抛 422
      const contentHash = hashContent(buffer);
      const sameContent = documents.findByHash(knowledgeBaseId, contentHash);
      if (sameContent) throw ApiError.conflict('相同内容的文档已存在，请勿重复上传');

      const dot = filename.lastIndexOf('.');
      const fileType = dot === -1 ? kind : filename.slice(dot).toLowerCase();

      // v1.3：同库同名即「替换」——复用文档行（id 不变），内容元数据复位，
      // 由调用方重新摄入：chunk/vec/fts 重建且旧编译产物同事务退役
      const sameName = documents.findByFilename(knowledgeBaseId, filename);
      if (sameName) {
        documents.replaceContent(sameName.id, {
          fileType,
          byteSize: buffer.byteLength,
          contentHash,
        });
        return documents.findById(sameName.id)!;
      }

      return documents.create({
        knowledgeBaseId,
        filename,
        fileType,
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
      saveSource(documentId, buffer);
      return pipeline.ingest({ documentId, buffer });
    },

    delete(id: string): void {
      requireDocument(id);
      deleteVectorsByDocument(deps.db, id);
      documents.delete(id);
      rmSync(sourcePath(id), { force: true });
    },
  };
}

export type DocumentService = ReturnType<typeof createDocumentService>;
