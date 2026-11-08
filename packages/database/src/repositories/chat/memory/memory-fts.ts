import type { DatabaseInstance } from '../../../client';
import { buildFtsQuery, normalizeForFtsIndex } from '../../../fts-tokenize';
import type { MemoryScopeFilter } from './memory-repo-types';

/**
 * v2.26 记忆关键词通道：memories_fts 与主表同 id 关联（memory_id UNINDEXED）。
 * 写入前统一 uni-gram 归一化，使 2 字中文词/中英混合型号也能召回。
 */

export interface MemoryFtsHit {
  memoryId: number;
  /** bm25 原始分（越小越相关，仅供排序，不对外展示） */
  rank: number;
}

export function upsertMemoryFts(
  db: DatabaseInstance,
  row: { id: number; content: string },
): void {
  deleteMemoryFts(db, row.id);
  db.prepare(`INSERT INTO memories_fts(content, memory_id) VALUES (?, ?)`).run(
    normalizeForFtsIndex(row.content),
    row.id,
  );
}

export function deleteMemoryFts(db: DatabaseInstance, id: number): void {
  db.prepare(`DELETE FROM memories_fts WHERE memory_id = ?`).run(id);
}

export function deleteAllMemoryFts(db: DatabaseInstance): void {
  db.exec(`DELETE FROM memories_fts`);
}

/** 关键词召回：只返回 active 且作用域可见的候选，按 bm25 排序 */
export function searchMemoryFts(
  db: DatabaseInstance,
  params: {
    query: string;
    limit: number;
    scope?: MemoryScopeFilter;
    now?: string;
  },
): MemoryFtsHit[] {
  const match = buildFtsQuery(params.query);
  if (!match) return [];
  const where = [
    `memories_fts MATCH @match`,
    `m.status = 'active'`,
    `(m.ttl_at IS NULL OR m.ttl_at > @now)`,
  ];
  const bind: Record<string, unknown> = {
    match,
    limit: params.limit,
    now: params.now ?? new Date().toISOString(),
  };
  if (params.scope) {
    const clauses = [`m.scope = 'global'`];
    if (params.scope.assistantId) {
      clauses.push(`(m.scope = 'assistant' AND m.assistant_id = @scopeAssistantId)`);
      bind.scopeAssistantId = params.scope.assistantId;
    }
    if (params.scope.conversationId) {
      clauses.push(
        `(m.scope = 'conversation' AND m.source_conversation_id = @scopeConversationId)`,
      );
      bind.scopeConversationId = params.scope.conversationId;
    }
    where.push(`(${clauses.join(' OR ')})`);
  }
  return db
    .prepare(
      `SELECT f.memory_id AS memoryId, bm25(memories_fts) AS rank
       FROM memories_fts f
       JOIN memories m ON m.id = f.memory_id
       WHERE ${where.join(' AND ')}
       ORDER BY rank LIMIT @limit`,
    )
    .all(bind) as MemoryFtsHit[];
}
