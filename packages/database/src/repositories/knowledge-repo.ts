import type { DatabaseInstance } from '../client';
import type { KnowledgeBase } from '@wbfm/shared';
import { newId, nowIso, mapKnowledgeBase, type KnowledgeBaseRow } from './mappers';

export interface KnowledgeBaseCreateFields {
  name: string;
  description?: string;
  chunkSize: number;
  chunkOverlap: number;
}

export type KnowledgeBaseUpdateFields = Partial<Pick<
  KnowledgeBaseCreateFields,
  'name' | 'description'
>>;

const SELECT_WITH_COUNT = `
  SELECT kb.*, (SELECT COUNT(*) FROM documents d WHERE d.knowledge_base_id = kb.id) AS document_count
  FROM knowledge_bases kb`;

export function createKnowledgeRepository(db: DatabaseInstance) {
  return {
    create(fields: KnowledgeBaseCreateFields): KnowledgeBase {
      const id = newId();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO knowledge_bases
           (id, name, description, chunk_size, chunk_overlap, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        fields.name,
        fields.description ?? '',
        fields.chunkSize,
        fields.chunkOverlap,
        ts,
        ts,
      );
      return this.findById(id)!;
    },

    findById(id: string): KnowledgeBase | null {
      const row = db
        .prepare(`${SELECT_WITH_COUNT} WHERE kb.id = ?`)
        .get(id) as KnowledgeBaseRow | undefined;
      return row ? mapKnowledgeBase(row) : null;
    },

    list(): KnowledgeBase[] {
      return (
        db
          .prepare(`${SELECT_WITH_COUNT} ORDER BY kb.created_at DESC`)
          .all() as KnowledgeBaseRow[]
      ).map(mapKnowledgeBase);
    },

    update(id: string, fields: KnowledgeBaseUpdateFields): KnowledgeBase | null {
      const keys = Object.keys(fields);
      if (keys.length === 0) return this.findById(id);
      const assignments = keys
        .filter((k) => k === 'name' || k === 'description')
        .map((k) => `${k === 'name' ? 'name' : 'description'} = @${k}`)
        .join(', ');
      db.prepare(
        `UPDATE knowledge_bases SET ${assignments}, updated_at = @updated_at WHERE id = @id`,
      ).run({ updated_at: nowIso(), id, ...fields });
      return this.findById(id);
    },

    delete(id: string): boolean {
      return db.prepare(`DELETE FROM knowledge_bases WHERE id = ?`).run(id).changes > 0;
    },
  };
}

export type KnowledgeRepository = ReturnType<typeof createKnowledgeRepository>;
