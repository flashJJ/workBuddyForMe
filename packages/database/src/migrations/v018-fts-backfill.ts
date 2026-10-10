import type { Database } from 'better-sqlite3';
import { normalizeForFtsIndex } from '../fts-tokenize';

/**
 * v1.3 FTS 存量回填（版本 18）。
 *
 * v017 创建 chunks_fts 时刻意只建空表（旧分片不回填，留「懒填充」）；实测升级
 * 用户的存量库会因此长期只有向量单通道——FTS 零行，混合检索的关键词路静默
 * 失效。v018 在迁移期一次性把缺失的存量分片按 fts-tokenize 归一化后补入：
 * - 仅补 chunks_fts 中不存在的 chunk_id（v017 后新摄取的分片已由摄取链路写入，
 *   绝不重复灌）；
 * - 纯文本处理、无模型调用，事务内完成，幂等可重入；
 * - 页/段坐标（page_no/paragraph_no）无法从纯文本重建，保持 NULL，待重传/
 *   重新索引补齐（摄取期才有 PDF 页码归属信息）。
 */
export function migrateV018(db: Database): void {
  const missing = db
    .prepare(
      `SELECT c.id AS chunkId, d.knowledge_base_id AS kbId, c.content AS content
       FROM document_chunks c
       JOIN documents d ON d.id = c.document_id
       WHERE NOT EXISTS (SELECT 1 FROM chunks_fts WHERE chunk_id = c.id)`,
    )
    .all() as Array<{ chunkId: number; kbId: string; content: string }>;

  const insert = db.prepare(
    `INSERT INTO chunks_fts(content, chunk_id, kb_id) VALUES(?, ?, ?)`,
  );
  for (const row of missing) {
    insert.run(normalizeForFtsIndex(row.content), row.chunkId, row.kbId);
  }
}
