import type { DatabaseInstance } from './client';
import { normalizeVector } from './vector';

/**
 * v0.5 长期记忆向量存储，与知识库 chunks_vec 同构但独立：
 * 记忆可能使用与文档不同维度的嵌入模型，故虚表与维度标记单独维护。
 * L2 归一化语义同 vector.ts（单位向量下 L2 ≈ 余弦）。
 */
export const MEMORY_VECTOR_DIM_META_KEY = 'memory_vector_dimension';
const MEMORY_VECTOR_TABLE = 'memories_vec';

export interface MemoryVectorRow {
  /** 与 memories.id 相同的整数 rowid */
  id: number;
  vector: number[];
}

export interface MemorySearchResult {
  memoryId: number;
  kind: string;
  content: string;
  importance: number;
  status: string;
  distance: number;
}

/** 读取记忆向量表维度；未建表返回 null */
export function getMemoryVectorDimension(db: DatabaseInstance): number | null {
  const row = db
    .prepare(`SELECT value FROM meta WHERE key = ?`)
    .get(MEMORY_VECTOR_DIM_META_KEY) as { value: string } | undefined;
  return row ? Number(row.value) : null;
}

/** 首次写入时按维度创建 vec0 虚表；维度不一致直接拒绝 */
export function ensureMemoryVectorTable(db: DatabaseInstance, dimension: number): void {
  if (!Number.isInteger(dimension) || dimension <= 0) {
    throw new Error(`非法记忆向量维度：${dimension}`);
  }
  const existing = getMemoryVectorDimension(db);
  if (existing !== null) {
    if (existing !== dimension) {
      throw new Error(`记忆向量维度冲突：表为 ${existing}，当前模型为 ${dimension}`);
    }
    return;
  }
  const create = db.transaction(() => {
    db.exec(`CREATE VIRTUAL TABLE ${MEMORY_VECTOR_TABLE} USING vec0(embedding float[${dimension}])`);
    db.prepare(`INSERT INTO meta(key, value) VALUES(?, ?)`).run(
      MEMORY_VECTOR_DIM_META_KEY,
      String(dimension),
    );
  });
  create();
}

/** 写入/覆盖单条记忆向量（自动归一化） */
export function upsertMemoryVector(db: DatabaseInstance, row: MemoryVectorRow): void {
  db.prepare(`DELETE FROM ${MEMORY_VECTOR_TABLE} WHERE rowid = ?`).run(BigInt(row.id));
  db.prepare(
    `INSERT INTO ${MEMORY_VECTOR_TABLE}(rowid, embedding) VALUES (?, json(?))`,
  ).run(BigInt(row.id), JSON.stringify(normalizeVector(row.vector)));
}

export function deleteMemoryVector(db: DatabaseInstance, id: number): void {
  db.prepare(`DELETE FROM ${MEMORY_VECTOR_TABLE} WHERE rowid = ?`).run(BigInt(id));
}

/** 清空全部记忆向量（清空记忆库时与主表同事务调用） */
export function deleteAllMemoryVectors(db: DatabaseInstance): void {
  db.exec(`DELETE FROM ${MEMORY_VECTOR_TABLE}`);
}

/** 在 active 记忆中做 top-k 相似度检索（距离阈值由调用方过滤） */
export function searchMemoryVectors(
  db: DatabaseInstance,
  params: { vector: number[]; k: number },
): MemorySearchResult[] {
  const dimension = getMemoryVectorDimension(db);
  if (dimension === null) return [];
  const normalized = normalizeVector(params.vector);
  if (normalized.length !== dimension) {
    throw new Error(`查询向量维度 ${normalized.length} 与记忆表维度 ${dimension} 不一致`);
  }
  return db
    .prepare(
      `SELECT
         m.id AS memoryId, m.kind AS kind, m.content AS content,
         m.importance AS importance, m.status AS status, v.distance AS distance
       FROM ${MEMORY_VECTOR_TABLE} v
       JOIN memories m ON m.id = v.rowid
       WHERE m.status = 'active' AND v.embedding MATCH json(@vec) AND k = @k
       ORDER BY v.distance`,
    )
    .all({ vec: JSON.stringify(normalized), k: params.k }) as MemorySearchResult[];
}
