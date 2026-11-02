import type { DatabaseInstance } from '../../client';
import { newId, nowIso } from '../ops/mappers';

/** v2.19 M5：实体关系读取（图检索多跳；关系必须有来源文档/分片才可引用） */

export interface RelationRecord {
  id: string;
  fromEntityId: string;
  fromEntityName: string;
  toEntityId: string;
  toEntityName: string;
  relation: string;
  description: string;
  sourceDocumentId: string | null;
  sourceDocumentName: string | null;
  sourceChunkId: number | null;
  pageNo: number | null;
  paragraphNo: number | null;
  confidence: number;
}

interface RelationRow {
  id: string;
  fromEntityId: string;
  fromEntityName: string;
  toEntityId: string;
  toEntityName: string;
  relation: string;
  description: string;
  sourceDocumentId: string | null;
  sourceDocumentName: string | null;
  sourceChunkId: number | null;
  pageNo: number | null;
  paragraphNo: number | null;
  confidence: number;
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(',');
}

const SELECT = `
  SELECT r.id AS id,
         r.from_entity_id AS fromEntityId, f.name AS fromEntityName,
         r.to_entity_id AS toEntityId, t.name AS toEntityName,
         r.relation AS relation, r.description AS description,
         r.source_document_id AS sourceDocumentId, d.filename AS sourceDocumentName,
         r.source_chunk_id AS sourceChunkId,
         c.page_no AS pageNo, c.paragraph_no AS paragraphNo,
         r.confidence AS confidence
  FROM knowledge_relations r
  JOIN knowledge_entities f ON f.id = r.from_entity_id
  JOIN knowledge_entities t ON t.id = r.to_entity_id
  LEFT JOIN documents d ON d.id = r.source_document_id
  LEFT JOIN document_chunks c ON c.id = r.source_chunk_id`;

/** v2.19 M5：关系写入 seed（编译输入的最小子形状，避免仓储反向依赖编译器） */
export interface RelationWriteSeed {
  fromNormalized: string;
  toNormalized: string;
  relation: string;
  description: string;
  chunkId: number | null;
  confidence: number;
}

/**
 * 整批替换某文档的关系边（在编译事务内调用，本函数不自开事务）：
 * 旧边先删；只写入两端实体均已解析到 id 的边；返回实际写入条数。
 */
export function replaceDocumentRelations(
  db: DatabaseInstance,
  input: {
    knowledgeBaseId: string;
    documentId: string;
    entityIdByNormalized: ReadonlyMap<string, string>;
    relations: readonly RelationWriteSeed[];
  },
): number {
  deleteDocumentRelations(db, input.documentId);
  const insert = db.prepare(
    `INSERT INTO knowledge_relations
       (id, knowledge_base_id, from_entity_id, to_entity_id, relation, description,
        source_document_id, source_chunk_id, confidence, created_at)
     VALUES (@id, @kbId, @fromEntityId, @toEntityId, @relation, @description,
        @documentId, @chunkId, @confidence, @ts)`,
  );
  const ts = nowIso();
  let count = 0;
  for (const relation of input.relations) {
    const fromEntityId = input.entityIdByNormalized.get(relation.fromNormalized);
    const toEntityId = input.entityIdByNormalized.get(relation.toNormalized);
    if (!fromEntityId || !toEntityId || fromEntityId === toEntityId) continue;
    insert.run({
      id: newId(),
      kbId: input.knowledgeBaseId,
      fromEntityId,
      toEntityId,
      relation: relation.relation.slice(0, 40),
      description: relation.description.slice(0, 300),
      documentId: input.documentId,
      chunkId: relation.chunkId,
      confidence: Math.max(0, Math.min(1, relation.confidence)),
      ts,
    });
    count += 1;
  }
  return count;
}

export function deleteDocumentRelations(db: DatabaseInstance, documentId: string): void {
  db.prepare(`DELETE FROM knowledge_relations WHERE source_document_id = ?`).run(documentId);
}

export function createRelationRepository(db: DatabaseInstance) {
  return {
    /** 多跳扩展：取与给定实体集合相连的边（按置信度降序），调用方负责 BFS 上限 */
    listForEntities(
      knowledgeBaseId: string,
      entityIds: readonly string[],
      limit = 24,
    ): RelationRecord[] {
      const ids = [...new Set(entityIds.filter(Boolean))];
      if (ids.length === 0) return [];
      const inQuery = placeholders(ids.length);
      const rows = db
        .prepare(
          `${SELECT}
           WHERE r.knowledge_base_id = ?
             AND (r.from_entity_id IN (${inQuery}) OR r.to_entity_id IN (${inQuery}))
           ORDER BY r.confidence DESC, r.created_at DESC
           LIMIT ?`,
        )
        .all(knowledgeBaseId, ...ids, ...ids, limit) as RelationRow[];
      return rows;
    },

    /** 文档的全部关系（测试/治理观测用） */
    listByDocument(documentId: string, limit = 200): RelationRecord[] {
      const rows = db
        .prepare(
          `${SELECT}
           WHERE r.source_document_id = ?
           ORDER BY r.confidence DESC, r.created_at DESC
           LIMIT ?`,
        )
        .all(documentId, limit) as RelationRow[];
      return rows;
    },
  };
}

export type RelationRepository = ReturnType<typeof createRelationRepository>;
