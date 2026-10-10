import type { DatabaseInstance } from '../client';

/**
 * 知识编译产物查询仓储（v1.3 M2/T2.4）。
 *
 * 读侧给「编译优先路由」提供两类候选：
 * - 实体：normalized_name 精确命中（别名在 SQL 候选后由纯函数选择器复核，
 *   避免 LIKE 跨 JSON 边界误匹配）；
 * - 摘要：key_terms/tldr 词项包含命中（JS 侧过滤，桌面规模文档数可接受）。
 * 未编译知识库查询一律返回空数组/ null，不抛错（零差异回落 chunk 检索）。
 */

export interface EntityMentionRecord {
  id: string;
  entityId: string;
  documentId: string;
  documentName: string;
  chunkId: number | null;
  pageNo: number | null;
  paragraphNo: number | null;
  context: string;
  generation: number;
}

export interface EntityRecord {
  id: string;
  knowledgeBaseId: string;
  name: string;
  normalizedName: string;
  kind: string;
  description: string;
  aliases: string[];
  mentionCount: number;
  mentions: EntityMentionRecord[];
}

export interface DocumentSummaryRecord {
  documentId: string;
  documentName: string;
  generation: number;
  tldr: string;
  bullets: string[];
  keyTerms: string[];
  extractor: 'rule' | 'llm';
  modelId: string | null;
}

function parseStringArray(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** 动态占位：better-sqlite3 不支持数组绑定，名称数量在调用方受控 */
function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(',');
}

export function createCompileQueryRepository(db: DatabaseInstance) {
  function hydrateEntity(row: EntityRow, mentionsPerEntity: number): EntityRecord {
    const mentions = db
      .prepare(
        `SELECT m.id AS id, m.entity_id AS entityId, m.document_id AS documentId,
                d.filename AS documentName, m.chunk_id AS chunkId,
                m.page_no AS pageNo, m.paragraph_no AS paragraphNo,
                m.context AS context, m.generation AS generation
         FROM knowledge_entity_mentions m
         JOIN documents d ON d.id = m.document_id
         WHERE m.entity_id = ?
         ORDER BY m.generation DESC, length(m.context) ASC
         LIMIT ?`,
      )
      .all(row.id, mentionsPerEntity) as EntityMentionRecord[];
    return {
      id: row.id,
      knowledgeBaseId: row.knowledge_base_id,
      name: row.name,
      normalizedName: row.normalized_name,
      kind: row.kind,
      description: row.description,
      aliases: parseStringArray(row.aliases),
      mentionCount: row.mention_count,
      mentions,
    };
  }

  return {
    /** 单文档摘要（未编译返回 null） */
    getDocumentSummary(documentId: string): DocumentSummaryRecord | null {
      const row = db
        .prepare(
          `SELECT s.document_id AS documentId, d.filename AS documentName,
                  s.generation AS generation, s.tldr AS tldr, s.bullets AS bullets,
                  s.key_terms AS keyTerms, s.extractor AS extractor, s.model_id AS modelId
           FROM document_summaries s JOIN documents d ON d.id = s.document_id
           WHERE s.document_id = ?`,
        )
        .get(documentId) as SummaryRow | undefined;
      return row ? mapSummary(row) : null;
    },

    /** normalized_name 精确批量命中（编译路由主入口） */
    findEntitiesByNames(
      knowledgeBaseId: string,
      normalizedNames: string[],
      mentionsPerEntity = 3,
    ): EntityRecord[] {
      const names = [...new Set(normalizedNames.filter(Boolean))];
      if (names.length === 0) return [];
      const rows = db
        .prepare(
          `SELECT * FROM knowledge_entities
           WHERE knowledge_base_id = ?
             AND normalized_name IN (${placeholders(names.length)})`,
        )
        .all(knowledgeBaseId, ...names) as EntityRow[];
      return rows.map((row) => hydrateEntity(row, mentionsPerEntity));
    },

    /**
     * 宽松候选召回：name/normalized/aliases 任一字段 LIKE 词项。
     * 仅作候选，调用方（纯函数选择器）需按归一化名/别名做精确复核。
     */
    searchEntityCandidates(
      knowledgeBaseId: string,
      terms: string[],
      limit = 8,
      mentionsPerEntity = 3,
    ): EntityRecord[] {
      const filtered = terms.filter((t) => t.trim().length >= 2).slice(0, 8);
      if (filtered.length === 0) return [];
      const where = filtered
        .map(() => `(name LIKE ? OR normalized_name LIKE ? OR aliases LIKE ?)`)
        .join(' OR ');
      const binds: string[] = [];
      for (const term of filtered) {
        const like = `%${term}%`;
        binds.push(like, like, like);
      }
      const rows = db
        .prepare(
          `SELECT * FROM knowledge_entities
           WHERE knowledge_base_id = ? AND (${where})
           ORDER BY mention_count DESC LIMIT ?`,
        )
        .all(knowledgeBaseId, ...binds, limit) as EntityRow[];
      return rows.map((row) => hydrateEntity(row, mentionsPerEntity));
    },

    /** 摘要候选：key_terms 命中或 tldr 包含词项，按命中词数排序 */
    searchSummaries(
      knowledgeBaseId: string,
      terms: string[],
      limit = 3,
    ): DocumentSummaryRecord[] {
      const filtered = terms.filter((t) => t.trim().length >= 2);
      if (filtered.length === 0) return [];
      const rows = db
        .prepare(
          `SELECT s.document_id AS documentId, d.filename AS documentName,
                  s.generation AS generation, s.tldr AS tldr, s.bullets AS bullets,
                  s.key_terms AS keyTerms, s.extractor AS extractor, s.model_id AS modelId
           FROM document_summaries s JOIN documents d ON d.id = s.document_id
           WHERE d.knowledge_base_id = ?`,
        )
        .all(knowledgeBaseId) as SummaryRow[];
      return rows
        .map((row) => {
          const summary = mapSummary(row);
          const hitCount = filtered.reduce(
            (n, term) =>
              n +
              (summary.keyTerms.some((k) => k.includes(term) || term.includes(k)) ? 1 : 0) +
              (summary.tldr.includes(term) ? 1 : 0),
            0,
          );
          return { summary, hitCount };
        })
        .filter((x) => x.hitCount > 0)
        .sort((a, b) => b.hitCount - a.hitCount)
        .slice(0, limit)
        .map((x) => x.summary);
    },
  };
}

interface EntityRow {
  id: string;
  knowledge_base_id: string;
  name: string;
  normalized_name: string;
  kind: string;
  description: string;
  aliases: string;
  mention_count: number;
}

interface SummaryRow {
  documentId: string;
  documentName: string;
  generation: number;
  tldr: string;
  bullets: string;
  keyTerms: string;
  extractor: 'rule' | 'llm';
  modelId: string | null;
}

function mapSummary(row: SummaryRow): DocumentSummaryRecord {
  return {
    documentId: row.documentId,
    documentName: row.documentName,
    generation: row.generation,
    tldr: row.tldr,
    bullets: parseStringArray(row.bullets),
    keyTerms: parseStringArray(row.keyTerms),
    extractor: row.extractor,
    modelId: row.modelId,
  };
}

export type CompileQueryRepository = ReturnType<typeof createCompileQueryRepository>;
