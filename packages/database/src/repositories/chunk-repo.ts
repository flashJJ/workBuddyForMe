import type { DatabaseInstance } from '../client';
import { nowIso } from '../utils/time';

export interface ChunkContent {
  ordinal: number;
  content: string;
  charStart: number;
  charEnd: number;
  /** v1.3：PDF 页码（从 1）；非 PDF 为 null/undefined */
  pageNo?: number | null;
  /** v1.3：文档内段落序号（从 1）；无法映射时为 null/undefined */
  paragraphNo?: number | null;
}

export interface StoredChunk extends ChunkContent {
  id: number;
  documentId: string;
}

export function createChunkRepository(db: DatabaseInstance) {
  return {
    /** 批量插入并返回带自增 id 的分片（供写入 vec0 rowid 与 FTS chunk_id） */
    bulkInsert(documentId: string, chunks: ChunkContent[]): StoredChunk[] {
      const ts = nowIso();
      const stmt = db.prepare(
        `INSERT INTO document_chunks
           (document_id, ordinal, content, char_start, char_end, page_no, paragraph_no, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertAll = db.transaction((items: ChunkContent[]): StoredChunk[] =>
        items.map((chunk) => {
          const result = stmt.run(
            documentId,
            chunk.ordinal,
            chunk.content,
            chunk.charStart,
            chunk.charEnd,
            chunk.pageNo ?? null,
            chunk.paragraphNo ?? null,
            ts,
          );
          return {
            id: Number(result.lastInsertRowid),
            documentId,
            ...chunk,
          };
        }),
      );
      return insertAll(chunks);
    },

    listByDocument(documentId: string): StoredChunk[] {
      return db
        .prepare(
          `SELECT id, document_id AS documentId, ordinal, content,
                  char_start AS charStart, char_end AS charEnd,
                  page_no AS pageNo, paragraph_no AS paragraphNo
           FROM document_chunks WHERE document_id = ? ORDER BY ordinal ASC`,
        )
        .all(documentId) as StoredChunk[];
    },

    countByDocument(documentId: string): number {
      return (
        db
          .prepare(`SELECT COUNT(*) AS n FROM document_chunks WHERE document_id = ?`)
          .get(documentId) as { n: number }
      ).n;
    },

    deleteByDocument(documentId: string): number {
      return db.prepare(`DELETE FROM document_chunks WHERE document_id = ?`).run(documentId)
        .changes;
    },
  };
}

export type ChunkRepository = ReturnType<typeof createChunkRepository>;
