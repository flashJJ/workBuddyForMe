import type { DatabaseInstance } from '../../client';
import { nowIso } from '../../utils/time';

export type DocumentBlockKind = 'heading' | 'paragraph' | 'list' | 'table' | 'figure';

export interface DocumentTableData {
  tableNo: number;
  header: string[];
  rows: string[][];
  caption?: string;
  pageNo?: number | null;
}

export interface DocumentBlockInput {
  kind: DocumentBlockKind;
  pageNo: number | null;
  sectionPath: string[];
  content: string;
  charStart: number;
  charEnd: number;
  table?: DocumentTableData;
}

export interface StoredDocumentBlock extends DocumentBlockInput {
  id: number;
  documentId: string;
  ordinal: number;
}

interface DocumentBlockRow {
  id: number;
  document_id: string;
  ordinal: number;
  kind: DocumentBlockKind;
  page_no: number | null;
  section_path: string;
  content: string;
  char_start: number;
  char_end: number;
  table_json: string | null;
}

function parseSectionPath(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function parseTable(raw: string | null): DocumentTableData | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as DocumentTableData;
  } catch {
    return undefined;
  }
}

function mapRow(row: DocumentBlockRow): StoredDocumentBlock {
  return {
    id: row.id,
    documentId: row.document_id,
    ordinal: row.ordinal,
    kind: row.kind,
    pageNo: row.page_no,
    sectionPath: parseSectionPath(row.section_path),
    content: row.content,
    charStart: row.char_start,
    charEnd: row.char_end,
    table: parseTable(row.table_json),
  };
}

export function createDocumentBlockRepository(db: DatabaseInstance) {
  return {
    /** 重建索引时整批替换：先删旧块，再按顺序写入新块 */
    bulkInsert(documentId: string, blocks: DocumentBlockInput[]): StoredDocumentBlock[] {
      const ts = nowIso();
      const stmt = db.prepare(
        `INSERT INTO document_blocks
           (document_id, ordinal, kind, page_no, section_path, content,
            char_start, char_end, table_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertAll = db.transaction((items: DocumentBlockInput[]): StoredDocumentBlock[] =>
        items.map((block, ordinal) => {
          const result = stmt.run(
            documentId,
            ordinal,
            block.kind,
            block.pageNo ?? null,
            JSON.stringify(block.sectionPath),
            block.content,
            block.charStart,
            block.charEnd,
            block.table ? JSON.stringify(block.table) : null,
            ts,
          );
          return {
            ...block,
            id: Number(result.lastInsertRowid),
            documentId,
            ordinal,
          };
        }),
      );
      return insertAll(blocks);
    },

    listByDocument(documentId: string): StoredDocumentBlock[] {
      return (
        db
          .prepare(
            `SELECT id, document_id, ordinal, kind, page_no, section_path, content,
                    char_start, char_end, table_json
             FROM document_blocks WHERE document_id = ? ORDER BY ordinal ASC`,
          )
          .all(documentId) as DocumentBlockRow[]
      ).map(mapRow);
    },

    countByDocument(documentId: string): number {
      return (
        db
          .prepare(`SELECT COUNT(*) AS n FROM document_blocks WHERE document_id = ?`)
          .get(documentId) as { n: number }
      ).n;
    },

    deleteByDocument(documentId: string): number {
      return db.prepare(`DELETE FROM document_blocks WHERE document_id = ?`).run(documentId)
        .changes;
    },
  };
}

export type DocumentBlockRepository = ReturnType<typeof createDocumentBlockRepository>;
