import type { DatabaseInstance } from './client';

/**
 * sqlite-vec 向量存储。
 * sqlite-vec 0.1.x 仅支持 L2 距离，因此存储/检索前统一做 L2 归一化，
 * 单位向量下 L2 排序与余弦相似度等价（||a-b||^2 = 2 - 2cos）。
 */
export const VECTOR_DIM_META_KEY = 'vector_dimension';
const VECTOR_TABLE = 'chunks_vec';

export interface ChunkVectorRow {
  /** 与 document_chunks.id 相同的整数 rowid */
  id: number;
  vector: number[];
}

export interface ChunkSearchResult {
  chunkId: number;
  documentId: string;
  documentName: string;
  ordinal: number;
  content: string;
  charStart: number;
  charEnd: number;
  distance: number;
}

export function normalizeVector(values: number[]): number[] {
  if (values.length === 0) throw new Error('向量不能为空');
  let norm = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) throw new Error('向量包含非有限数值');
    norm += v * v;
  }
  norm = Math.sqrt(norm);
  if (norm === 0) throw new Error('零向量无法归一化');
  return values.map((v) => v / norm);
}

/** 读取已建表的向量维度；未建表返回 null */
export function getVectorDimension(db: DatabaseInstance): number | null {
  const row = db
    .prepare(`SELECT value FROM meta WHERE key = ?`)
    .get(VECTOR_DIM_META_KEY) as { value: string } | undefined;
  return row ? Number(row.value) : null;
}

/** 首次写入时按维度创建 vec0 虚表；维度不一致直接拒绝（需重建索引） */
export function ensureVectorTable(db: DatabaseInstance, dimension: number): void {
  if (!Number.isInteger(dimension) || dimension <= 0) {
    throw new Error(`非法向量维度：${dimension}`);
  }
  const existing = getVectorDimension(db);
  if (existing !== null) {
    if (existing !== dimension) {
      throw new Error(`向量维度冲突：表为 ${existing}，当前模型为 ${dimension}，请重建知识库索引`);
    }
    return;
  }
  const create = db.transaction(() => {
    db.exec(`CREATE VIRTUAL TABLE ${VECTOR_TABLE} USING vec0(embedding float[${dimension}])`);
    db.prepare(`INSERT INTO meta(key, value) VALUES(?, ?)`).run(
      VECTOR_DIM_META_KEY,
      String(dimension),
    );
  });
  create();
}

/** 批量写入分片向量（同事务，自动归一化） */
export function insertChunkVectors(db: DatabaseInstance, rows: ChunkVectorRow[]): void {
  if (rows.length === 0) return;
  const stmt = db.prepare(
    `INSERT INTO ${VECTOR_TABLE}(rowid, embedding) VALUES (?, json(?))`,
  );
  const insertMany = db.transaction((items: ChunkVectorRow[]) => {
    for (const row of items) {
      stmt.run(BigInt(row.id), JSON.stringify(normalizeVector(row.vector)));
    }
  });
  insertMany(rows);
}

/** 删除某文档的全部分片向量（分片行本身由外键级联删除） */
export function deleteVectorsByDocument(db: DatabaseInstance, documentId: string): void {
  db.prepare(
    `DELETE FROM ${VECTOR_TABLE} WHERE rowid IN (
       SELECT id FROM document_chunks WHERE document_id = ?
     )`,
  ).run(documentId);
}

/** 按知识库做 top-k 相似度检索 */
export function searchChunks(
  db: DatabaseInstance,
  params: { knowledgeBaseId: string; vector: number[]; k: number },
): ChunkSearchResult[] {
  const dimension = getVectorDimension(db);
  if (dimension === null) return [];
  const normalized = normalizeVector(params.vector);
  if (normalized.length !== dimension) {
    throw new Error(`查询向量维度 ${normalized.length} 与表维度 ${dimension} 不一致`);
  }
  return db
    .prepare(
      `SELECT
         c.id AS chunkId, c.document_id AS documentId, d.filename AS documentName,
         c.ordinal AS ordinal, c.content AS content,
         c.char_start AS charStart, c.char_end AS charEnd, v.distance AS distance
       FROM ${VECTOR_TABLE} v
       JOIN document_chunks c ON c.id = v.rowid
       JOIN documents d ON d.id = c.document_id
       WHERE d.knowledge_base_id = @kbId AND v.embedding MATCH json(@vec) AND k = @k
       ORDER BY v.distance`,
    )
    .all({
      kbId: params.knowledgeBaseId,
      vec: JSON.stringify(normalized),
      k: params.k,
    }) as ChunkSearchResult[];
}
