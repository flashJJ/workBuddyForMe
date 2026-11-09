/**
 * v2.34：knowledge 轨序列化（从 export.ts 拆出）。
 * 只备份文本与坐标，不备份向量；增量模式只带 since 之后新建的知识库/文档。
 */
import {
  createChunkRepository,
  createDocumentRepository,
  createKnowledgeRepository,
  type DatabaseInstance,
} from '@wbfm/database';

export interface KnowledgeTrackPayload {
  json: string;
  knowledgeBaseCount: number;
  documentCount: number;
}

export function serializeKnowledgeTrack(
  db: DatabaseInstance,
  since?: string,
): KnowledgeTrackPayload {
  const knowledgeRepo = createKnowledgeRepository(db);
  const documentsRepo = createDocumentRepository(db);
  const chunksRepo = createChunkRepository(db);
  const serialized: Array<{
    knowledgeBase: unknown;
    documents: Array<{ document: unknown; chunks: unknown[] }>;
  }> = [];
  let documentCount = 0;

  for (const kb of knowledgeRepo.list()) {
    const kbNew = !since || kb.createdAt > since;
    const docs = documentsRepo
      .listByKnowledgeBase(kb.id)
      .filter((doc) => kbNew || doc.createdAt > since);
    if (!kbNew && docs.length === 0) continue;
    serialized.push({
      knowledgeBase: {
        id: kb.id,
        name: kb.name,
        description: kb.description ?? '',
        chunkSize: kb.chunkSize,
        chunkOverlap: kb.chunkOverlap,
        createdAt: kb.createdAt,
        updatedAt: kb.updatedAt,
      },
      documents: docs.map((doc) => ({
        document: {
          id: doc.id,
          filename: doc.filename,
          fileType: doc.fileType,
          byteSize: doc.byteSize,
          contentHash: doc.contentHash,
          status: doc.status,
          source: doc.source,
          sourceUrl: doc.sourceUrl,
          chunkCount: doc.chunkCount,
          createdAt: doc.createdAt,
          indexedAt: doc.indexedAt,
        },
        chunks: chunksRepo.listByDocument(doc.id).map((c) => ({
          ordinal: c.ordinal,
          content: c.content,
          charStart: c.charStart,
          charEnd: c.charEnd,
          pageNo: c.pageNo ?? null,
          paragraphNo: c.paragraphNo ?? null,
        })),
      })),
    });
    documentCount += docs.length;
  }

  return {
    json: JSON.stringify(serialized, null, 2),
    knowledgeBaseCount: serialized.length,
    documentCount,
  };
}
