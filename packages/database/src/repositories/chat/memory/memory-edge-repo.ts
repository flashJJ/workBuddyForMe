import { randomUUID } from 'node:crypto';
import type { DatabaseInstance } from '../../../client';
import { nowIso } from '../../ops/mappers';

/**
 * v2.31 P0 记忆关系边仓储：
 * - 边是派生数据，只记录可解释的来源关系（同消息 / 同回合），不猜测语义；
 * - 写入按 (from_id, to_id, relation) 幂等，重复写入保留更高权重；
 * - 查询只返回 active 且未置顶的对端记忆，归档记忆不会通过邻居回到提示词。
 */
export type MemoryEdgeRelation = 'same_source' | 'co_turn';

export interface MemoryEdgeInput {
  fromId: string;
  toId: string;
  relation: MemoryEdgeRelation;
  weight: number;
  createdAt?: string;
}

export interface MemoryEdgeNeighbor {
  /** 对端记忆 id */
  memoryId: string;
  /** 当前候选里的种子记忆 id */
  viaId: string;
  weight: number;
}

interface EdgeRow {
  memory_id: string;
  via_id: string;
  weight: number;
}

export function createMemoryEdgeRepository(db: DatabaseInstance) {
  return {
    link(edges: MemoryEdgeInput[]): number {
      if (edges.length === 0) return 0;
      const ts = nowIso();
      const stmt = db.prepare(
        `INSERT INTO memory_edges (id, from_id, to_id, relation, weight, created_at)
         VALUES (@id, @fromId, @toId, @relation, @weight, @createdAt)
         ON CONFLICT (from_id, to_id, relation)
         DO UPDATE SET weight = MAX(memory_edges.weight, excluded.weight)`,
      );
      let written = 0;
      const tx = db.transaction(() => {
        for (const edge of edges) {
          stmt.run({
            id: `e${randomUUID()}`,
            fromId: edge.fromId,
            toId: edge.toId,
            relation: edge.relation,
            weight: edge.weight,
            createdAt: edge.createdAt ?? ts,
          });
          written += 1;
        }
      });
      tx();
      return written;
    },

    /** 取一组种子记忆的对端邻居（去重交给调用方），只返回 active、未置顶、作用域可见的记忆 */
    listNeighbors(
      seedIds: string[],
      options: { assistantId?: string | null; now?: Date } = {},
    ): MemoryEdgeNeighbor[] {
      if (seedIds.length === 0) return [];
      const placeholders = seedIds.map(() => '?').join(', ');
      const now = (options.now ?? new Date()).toISOString();
      const rows = db
        .prepare(
          `SELECT CASE WHEN e.from_id IN (${placeholders}) THEN e.to_id ELSE e.from_id END AS memory_id,
                  CASE WHEN e.from_id IN (${placeholders}) THEN e.from_id ELSE e.to_id END AS via_id,
                  e.weight
             FROM memory_edges e
             JOIN memories m
               ON m.id = CAST(CASE WHEN e.from_id IN (${placeholders}) THEN e.to_id ELSE e.from_id END AS INTEGER)
            WHERE (e.from_id IN (${placeholders}) OR e.to_id IN (${placeholders}))
              AND m.status = 'active'
              AND m.pinned = 0
              AND (m.scope = 'global' OR m.assistant_id = @assistantId)
              AND (m.ttl_at IS NULL OR m.ttl_at > @now)`,
        )
        .all(...seedIds, ...seedIds, ...seedIds, ...seedIds, ...seedIds, {
          assistantId: options.assistantId ?? null,
          now,
        }) as EdgeRow[];
      return rows.map((row) => ({
        memoryId: String(row.memory_id),
        viaId: String(row.via_id),
        weight: row.weight,
      }));
    },

    deleteForMemory(memoryId: string): number {
      return db
        .prepare(`DELETE FROM memory_edges WHERE from_id = ? OR to_id = ?`)
        .run(memoryId, memoryId).changes;
    },

    deleteAll(): number {
      return db.prepare(`DELETE FROM memory_edges`).run().changes;
    },

    /** 清理端点不存在或已归档的边（派生数据，直接删除） */
    deleteDangling(): number {
      return db
        .prepare(
          `DELETE FROM memory_edges
            WHERE NOT EXISTS (
                    SELECT 1 FROM memories m
                     WHERE m.id = CAST(memory_edges.from_id AS INTEGER)
                       AND m.status = 'active')
               OR NOT EXISTS (
                    SELECT 1 FROM memories m
                     WHERE m.id = CAST(memory_edges.to_id AS INTEGER)
                       AND m.status = 'active')`,
        )
        .run().changes;
    },

    count(): number {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM memory_edges`).get() as { n: number };
      return row.n;
    },
  };
}

export type MemoryEdgeRepository = ReturnType<typeof createMemoryEdgeRepository>;
