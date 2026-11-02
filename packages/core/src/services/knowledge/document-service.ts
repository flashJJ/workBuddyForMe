import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApiError } from '@wbfm/shared/errors';
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
import type { DocumentBlockKind, DocumentTable } from '../../ingestion/structure';
import { fetchArticle, normalizeClipUrl, toClipError } from '../../ingestion/fetch-article';
import { resolveVisionTarget } from '../../ingestion/vision-target';
import type { IngestResult } from '../../ingestion/types';
import { summarizeDocumentFigure } from './document-figure-service';

export interface UploadedFile {
  filename: string;
  buffer: Uint8Array;
}

/** v2.19：结构预览 API 返回（块 id 仅视图层使用，不入库） */
export interface DocumentStructureView {
  documentId: string;
  parsedAt: string | null;
  structureAvailable: boolean;
  pages: Array<{ pageNo: number; blockIds: string[] }>;
  sections: Array<{ path: string[]; blockIds: string[] }>;
  blocks: Array<{
    id: string;
    kind: DocumentBlockKind;
    pageNo: number | null;
    sectionPath: string[];
    content: string;
    charStart: number;
    charEnd: number;
    table?: DocumentTable;
  }>;
  tables: DocumentTable[];
  warnings: string[];
  /** v2.19 M4：是否已配置视觉模型（图表/图片理解按需可用） */
  visionAvailable: boolean;
}

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
      const document = requireDocument(id);
      const stored = blocks.listByDocument(id);
      const viewBlocks = stored.map((block) => ({
        id: `b${block.ordinal + 1}`,
        kind: block.kind,
        pageNo: block.pageNo,
        sectionPath: block.sectionPath,
        content: block.content,
        charStart: block.charStart,
        charEnd: block.charEnd,
        ...(block.table ? { table: block.table as DocumentTable } : {}),
      }));
      const tables = viewBlocks.flatMap((block) => (block.table ? [block.table] : []));

      const pageMap = new Map<number, string[]>();
      const sectionMap = new Map<string, { path: string[]; blockIds: string[] }>();
      for (const block of viewBlocks) {
        if (block.pageNo !== null) {
          const ids = pageMap.get(block.pageNo) ?? [];
          ids.push(block.id);
          pageMap.set(block.pageNo, ids);
        }
        if (block.sectionPath.length > 0) {
          const key = JSON.stringify(block.sectionPath);
          const section = sectionMap.get(key) ?? { path: block.sectionPath, blockIds: [] };
          section.blockIds.push(block.id);
          sectionMap.set(key, section);
        }
      }

      const warnings: string[] = [];
      if (viewBlocks.length === 0) {
        warnings.push('尚未解析文档结构（旧文档或解析失败）；请重新上传后重建');
      } else {
        if (!viewBlocks.some((block) => block.kind === 'heading')) {
          warnings.push('未检测到标题结构，章节路径为空');
        }
        for (const table of tables) {
          if (table.confidence !== undefined && table.confidence < 0.75) {
            warnings.push(
              `表 ${table.tableNo} 置信度较低（${Math.round(table.confidence * 100)}%），表格结构可能不准确`,
            );
          }
          if (table.header.length === 0) {
            warnings.push(`表 ${table.tableNo} 无表头`);
            continue;
          }
          const mismatch = table.rows.findIndex((row) => row.length !== table.header.length);
          if (mismatch >= 0) {
            warnings.push(`表 ${table.tableNo} 第 ${mismatch + 1} 行单元格数与表头不一致`);
          }
        }
      }
      if (document.ocrStatus === 'done') {
        warnings.push('扫描件结构由 OCR 文本启发式重建，表格识别可能不准确');
      }

      return {
        documentId: id,
        parsedAt: document.indexedAt ?? document.createdAt,
        structureAvailable: viewBlocks.length > 0,
        pages: [...pageMap.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([pageNo, blockIds]) => ({ pageNo, blockIds })),
        sections: [...sectionMap.values()],
        blocks: viewBlocks,
        tables,
        warnings,
        visionAvailable: resolveVisionTarget(deps) !== null,
      };
    },

    /**
     * v2.19：手动重建结构/分块/索引。必须保留原始文件；
     * 重建失败时管线在写入事务前失败，旧索引保持不变。
     */
    reparse(id: string): { queued: true } {
      requireDocument(id);
      const source = readSource(id);
      if (!source) {
        throw ApiError.validation('原始文件未保留，无法重建结构；请重新上传该文档后再试');
      }
      void pipeline.ingest({ documentId: id, buffer: source }).catch((error: unknown) => {
        console.error(`[reparse] 文档 ${id} 重建异常：`, error);
      });
      return { queued: true };
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
