import type { DatabaseInstance } from './client';
import { buildFtsQuery, normalizeForFtsIndex } from './fts-tokenize';

/**
 * chunks_fts 全文索引读写（v1.3 M0）。
 *
 * 虚表由 v017 迁移创建（unicode61）；content 存归一化后的 uni-gram 文本
 * （见 fts-tokenize），chunk_id/kb_id 为 UNINDEXED 元数据。
 * 本模块只负责行级同步与全量重建；检索（MATCH + 打分）在 M1 检索层实现。
 */

export interface FtsChunkRow {
  chunkId: number;
  knowledgeBaseId: string;
  content: string;
}

export function createFtsChunkRepository(db: DatabaseInstance) {
  return {
    /** 与 chunk 批量插入同事务调用：原文经 uni-gram 归一化后写入 FTS */
    bulkInsert(rows: FtsChunkRow[]): void {
      if (rows.length === 0) return;
      const stmt = db.prepare(
        `INSERT INTO chunks_fts(content, chunk_id, kb_id) VALUES(?, ?, ?)`,
      );
      const insertMany = db.transaction((items: FtsChunkRow[]) => {
        for (const row of items) {
          stmt.run(normalizeForFtsIndex(row.content), row.chunkId, row.knowledgeBaseId);
        }
      });
      insertMany(rows);
    },

    /** 删除某文档的全部分片索引（与 chunk 删除同事务） */
    deleteByDocument(knowledgeBaseId: string, documentId: string): void {
      db.prepare(
        `DELETE FROM chunks_fts
         WHERE kb_id = @kbId AND chunk_id IN (
           SELECT id FROM document_chunks WHERE document_id = @docId
         )`,
      ).run({ kbId: knowledgeBaseId, docId: documentId });
    },

    /** 清空全库 FTS（重建前用） */
    clear(): void {
      db.exec(`DELETE FROM chunks_fts`);
    },

    /**
     * 全量重建 FTS（幂等）：从 document_chunks 读取全部现存分片重灌。
     * 用于旧库升级后的懒填充/索引修复；与调用方事务边界外可独立运行（内部自带事务）。
     */
    rebuild(): { indexed: number } {
      const rows = db
        .prepare(
          `SELECT c.id AS chunkId, c.document_id AS docId, d.knowledge_base_id AS kbId, c.content AS content
           FROM document_chunks c JOIN documents d ON d.id = c.document_id`,
        )
        .all() as Array<{ chunkId: number; docId: string; kbId: string; content: string }>;
      const doRebuild = db.transaction(() => {
        db.exec(`DELETE FROM chunks_fts`);
        const insert = db.prepare(
          `INSERT INTO chunks_fts(content, chunk_id, kb_id) VALUES(?, ?, ?)`,
        );
        for (const row of rows) {
          insert.run(normalizeForFtsIndex(row.content), row.chunkId, row.kbId);
        }
      });
      doRebuild();
      return { indexed: rows.length };
    },

    /**
     * 调试/检索共用的最小匹配查询：返回命中的 chunk_id（含总数上限）。
     * 查询无有效 token 时返回空数组（不执行 MATCH）。
     */
    matchChunkIds(knowledgeBaseId: string, query: string, limit: number): number[] {
      const match = buildFtsQuery(query);
      if (!match) return [];
      const rows = db
        .prepare(
          `SELECT chunk_id AS chunkId FROM chunks_fts
           WHERE kb_id = @kbId AND chunks_fts MATCH @match
           LIMIT @limit`,
        )
        .all({ kbId: knowledgeBaseId, match, limit }) as Array<{ chunkId: number }>;
      return rows.map((r) => r.chunkId);
    },
  };
}

export type FtsChunkRepository = ReturnType<typeof createFtsChunkRepository>;
