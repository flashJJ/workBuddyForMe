import type { DatabaseInstance } from '../client';
import type { DocumentRecord, DocumentStatus } from '@wbfm/shared';
import { newId, nowIso, mapDocument, type DocumentRow } from './mappers';

export interface DocumentCreateFields {
  knowledgeBaseId: string;
  filename: string;
  fileType: string;
  byteSize: number;
  contentHash: string;
}

export type DocumentStatusPatch = Partial<{
  errorMessage: string | null;
  chunkCount: number;
  indexedAt: string | null;
}>;

export function createDocumentRepository(db: DatabaseInstance) {
  return {
    create(fields: DocumentCreateFields): DocumentRecord {
      const id = newId();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO documents
           (id, knowledge_base_id, filename, file_type, byte_size, content_hash,
            status, error_message, chunk_count, created_at, indexed_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, 0, ?, NULL)`,
      ).run(
        id,
        fields.knowledgeBaseId,
        fields.filename,
        fields.fileType,
        fields.byteSize,
        fields.contentHash,
        ts,
      );
      return this.findById(id)!;
    },

    findById(id: string): DocumentRecord | null {
      const row = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(id) as
        | DocumentRow
        | undefined;
      return row ? mapDocument(row) : null;
    },

    findByHash(knowledgeBaseId: string, contentHash: string): DocumentRecord | null {
      const row = db
        .prepare(
          `SELECT * FROM documents WHERE knowledge_base_id = ? AND content_hash = ?`,
        )
        .get(knowledgeBaseId, contentHash) as DocumentRow | undefined;
      return row ? mapDocument(row) : null;
    },

    listByKnowledgeBase(knowledgeBaseId: string): DocumentRecord[] {
      return (
        db
          .prepare(
            `SELECT * FROM documents WHERE knowledge_base_id = ? ORDER BY created_at DESC`,
          )
          .all(knowledgeBaseId) as DocumentRow[]
      ).map(mapDocument);
    },

    setStatus(id: string, status: DocumentStatus, patch: DocumentStatusPatch = {}): void {
      db.prepare(
        `UPDATE documents SET
           status = @status,
           error_message = COALESCE(@errorMessage, error_message),
           chunk_count = COALESCE(@chunkCount, chunk_count),
           indexed_at = COALESCE(@indexedAt, indexed_at)
         WHERE id = @id`,
      ).run({
        id,
        status,
        errorMessage: patch.errorMessage ?? null,
        chunkCount: patch.chunkCount ?? null,
        indexedAt: patch.indexedAt ?? null,
      });
    },

    delete(id: string): boolean {
      return db.prepare(`DELETE FROM documents WHERE id = ?`).run(id).changes > 0;
    },
  };
}

export type DocumentRepository = ReturnType<typeof createDocumentRepository>;
