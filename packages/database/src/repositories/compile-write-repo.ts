import type { DatabaseInstance } from '../client';
import { newId, nowIso } from './mappers';

/**
 * 知识编译产物写入仓储（v1.3 M2/T2.3）。
 *
 * 世代契约：单文档重编译在**一个事务**内完成「删该文档旧 mention →
 * upsert 摘要（世代+1）→ 实体归并/插 mention → 重算 mention_count →
 * 清扫零 mention 实体 → 更新 documents 编译态」，读侧永远只见完整世代，
 * 事务中途抛错整体回滚，chunk/向量等既有数据不受影响。
 */

export type CompileExtractor = 'rule' | 'llm';
export type CompileStatus = 'skipped' | 'queued' | 'running' | 'ready' | 'failed';

export interface CompileMentionInput {
  /** 出现处原句（可回指，禁止生成文本） */
  context: string;
  chunkId: number | null;
  pageNo: number | null;
  paragraphNo: number | null;
}

export interface CompileEntityInput {
  name: string;
  normalizedName: string;
  kind: string;
  aliases: string[];
  /** 最具代表性原句（可为空串，仓储只在旧值为空时补写） */
  description?: string;
  mentions: CompileMentionInput[];
}

export interface CompileSummaryInput {
  tldr: string;
  bullets: string[];
  keyTerms: string[];
  extractor: CompileExtractor;
  modelId?: string | null;
}

export interface CompilationInput {
  knowledgeBaseId: string;
  documentId: string;
  summary: CompileSummaryInput;
  entities: CompileEntityInput[];
}

export interface CompilationResult {
  generation: number;
  entityCount: number;
  mentionCount: number;
}

interface EntityRow {
  id: string;
  name: string;
  kind: string;
  description: string;
  aliases: string;
}

function parseStringArray(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function createCompileWriteRepository(db: DatabaseInstance) {
  const findEntity = db.prepare(
    `SELECT id, name, kind, description, aliases FROM knowledge_entities
     WHERE knowledge_base_id = @kbId AND normalized_name = @normalized`,
  );
  const insertEntity = db.prepare(
    `INSERT INTO knowledge_entities
       (id, knowledge_base_id, name, normalized_name, kind, description, aliases,
        mention_count, created_at)
     VALUES (@id, @kbId, @name, @normalized, @kind, @description, @aliases, 0, @ts)`,
  );
  const updateEntityMeta = db.prepare(
    `UPDATE knowledge_entities SET aliases = @aliases, description = @description WHERE id = @id`,
  );
  const insertMention = db.prepare(
    `INSERT INTO knowledge_entity_mentions
       (id, entity_id, document_id, chunk_id, page_no, paragraph_no, context,
        generation, created_at)
     VALUES (@id, @entityId, @documentId, @chunkId, @pageNo, @paragraphNo, @context,
        @generation, @ts)`,
  );
  const deleteDocMentions = db.prepare(
    `DELETE FROM knowledge_entity_mentions WHERE document_id = ?`,
  );
  const recountEntity = db.prepare(
    `UPDATE knowledge_entities SET mention_count =
       (SELECT COUNT(*) FROM knowledge_entity_mentions WHERE entity_id = @id)
     WHERE id = @id`,
  );
  const gcEntities = db.prepare(
    `DELETE FROM knowledge_entities
     WHERE knowledge_base_id = @kbId
       AND id NOT IN (SELECT DISTINCT entity_id FROM knowledge_entity_mentions)`,
  );
  const upsertSummary = db.prepare(
    `INSERT INTO document_summaries
       (document_id, generation, tldr, bullets, key_terms, extractor, model_id, created_at)
     VALUES (@documentId, @generation, @tldr, @bullets, @keyTerms, @extractor, @modelId, @ts)
     ON CONFLICT(document_id) DO UPDATE SET
       generation = excluded.generation, tldr = excluded.tldr,
       bullets = excluded.bullets, key_terms = excluded.key_terms,
       extractor = excluded.extractor, model_id = excluded.model_id,
       created_at = excluded.created_at`,
  );
  const touchDocument = db.prepare(
    `UPDATE documents SET compile_generation = @generation, compiled_at = @ts,
       compile_status = 'ready', compile_error = NULL WHERE id = @documentId`,
  );

  return {
    /**
     * 保存单文档编译产物（原子）。新世代 = documents.compile_generation + 1。
     * 实体按 (kb, normalized_name) 归并：首见名保持不变，别名取并集，
     * mention_count 以实际 mention 行数重算（跨文档/重编译都正确）。
     */
    saveCompilation(input: CompilationInput): CompilationResult {
      const doSave = db.transaction((data: CompilationInput): CompilationResult => {
        const doc = db
          .prepare(`SELECT compile_generation AS gen FROM documents WHERE id = ?`)
          .get(data.documentId) as { gen: number } | undefined;
        if (!doc) throw new Error(`document not found: ${data.documentId}`);
        const generation = doc.gen + 1;
        const ts = nowIso();
        const { summary } = data;

        upsertSummary.run({
          documentId: data.documentId,
          generation,
          tldr: summary.tldr,
          bullets: JSON.stringify(summary.bullets),
          keyTerms: JSON.stringify(summary.keyTerms),
          extractor: summary.extractor,
          modelId: summary.modelId ?? null,
          ts,
        });

        // 旧世代 mention 先删（同事务内读侧不可见中间态），再写新世代。
        // 删除前记录本文档触及过的实体：本次未再产出的旧实体也要重算
        // mention_count（否则计数悬空偏大），随后由 GC 清扫零提及实体。
        const affectedRows = db
          .prepare(
            `SELECT DISTINCT entity_id AS id FROM knowledge_entity_mentions
             WHERE document_id = ?`,
          )
          .all(data.documentId) as Array<{ id: string }>;
        const touchedEntities = new Set(affectedRows.map((r) => r.id));
        deleteDocMentions.run(data.documentId);

        let mentionCount = 0;
        for (const entity of data.entities) {
          const existing = findEntity.get({
            kbId: data.knowledgeBaseId,
            normalized: entity.normalizedName,
          }) as EntityRow | undefined;

          let entityId: string;
          if (existing) {
            entityId = existing.id;
            const aliases = new Set(parseStringArray(existing.aliases));
            for (const alias of entity.aliases) {
              if (alias !== existing.name) aliases.add(alias);
            }
            aliases.delete(existing.name);
            const description = existing.description || entity.description || '';
            updateEntityMeta.run({
              id: entityId,
              aliases: JSON.stringify([...aliases]),
              description,
            });
          } else {
            entityId = newId();
            insertEntity.run({
              id: entityId,
              kbId: data.knowledgeBaseId,
              name: entity.name,
              normalized: entity.normalizedName,
              kind: entity.kind,
              description: entity.description ?? '',
              aliases: JSON.stringify(entity.aliases),
              ts,
            });
          }

          for (const mention of entity.mentions) {
            insertMention.run({
              id: newId(),
              entityId,
              documentId: data.documentId,
              chunkId: mention.chunkId,
              pageNo: mention.pageNo,
              paragraphNo: mention.paragraphNo,
              context: mention.context,
              generation,
              ts,
            });
            mentionCount += 1;
          }
          touchedEntities.add(entityId);
        }

        for (const id of touchedEntities) recountEntity.run({ id });
        gcEntities.run({ kbId: data.knowledgeBaseId });
        touchDocument.run({ documentId: data.documentId, generation, ts });

        return { generation, entityCount: data.entities.length, mentionCount };
      });
      return doSave(input);
    },

    /**
     * 重摄取/替换时清理旧编译产物（必须在摄取三索引事务内调用，本方法
     * 不自开事务）：删该文档 mention 与摘要、清扫零提及实体、世代归零、
     * 状态置 queued。提交后读侧只见「无编译层」，静态路由零差异回落 chunk。
     */
    purgeForReingest(documentId: string): void {
      const affected = db
        .prepare(`SELECT DISTINCT entity_id AS id FROM knowledge_entity_mentions WHERE document_id = ?`)
        .all(documentId) as Array<{ id: string }>;
      deleteDocMentions.run(documentId);
      db.prepare(`DELETE FROM document_summaries WHERE document_id = ?`).run(documentId);
      for (const { id } of affected) recountEntity.run({ id });
      const kb = db
        .prepare(`SELECT knowledge_base_id AS kbId FROM documents WHERE id = ?`)
        .get(documentId) as { kbId: string } | undefined;
      if (kb) gcEntities.run({ kbId: kb.kbId });
      db.prepare(
        `UPDATE documents SET compile_status = 'queued', compile_generation = 0,
           compiled_at = NULL, compile_error = NULL WHERE id = ?`,
      ).run(documentId);
    },

    /** 编译状态机流转（queued/running/failed 等由调度层驱动，M4） */
    updateCompileStatus(documentId: string, status: CompileStatus, patch: { error?: string | null } = {}): void {
      db.prepare(`UPDATE documents SET compile_status = @status, compile_error = @error WHERE id = @id`).run({
        id: documentId,
        status,
        error: patch.error === undefined ? null : patch.error,
      });
    },
  };
}

export type CompileWriteRepository = ReturnType<typeof createCompileWriteRepository>;
