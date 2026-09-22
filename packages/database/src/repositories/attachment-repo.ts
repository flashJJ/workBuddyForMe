import type { Attachment } from '@wbfm/shared';
import type { DatabaseInstance } from '../client';
import { newId, nowIso } from './mappers';

/** 仓储内部行：storage_path 不对外暴露，仅供服务层定位文件 */
export interface AttachmentRow {
  id: string;
  filename: string;
  mime_type: string;
  byte_size: number;
  storage_path: string;
  content_hash: string;
  created_at: string;
}

const MIME_EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export interface AttachmentCreateFields {
  filename: string;
  mimeType: string;
  byteSize: number;
  contentHash: string;
}

/** 存储文件名约定：<id>.<mime 对应扩展名> */
export function attachmentStorageName(id: string, mimeType: string): string {
  return `${id}.${MIME_EXTENSION[mimeType] ?? 'bin'}`;
}

export function mapAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    contentHash: row.content_hash,
    createdAt: row.created_at,
  };
}

export function createAttachmentRepository(db: DatabaseInstance) {
  return {
    create(fields: AttachmentCreateFields): AttachmentRow {
      const id = newId();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO attachments
           (id, filename, mime_type, byte_size, storage_path, content_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        fields.filename,
        fields.mimeType,
        fields.byteSize,
        attachmentStorageName(id, fields.mimeType),
        fields.contentHash,
        ts,
      );
      return this.findRowById(id)!;
    },

    findRowById(id: string): AttachmentRow | null {
      const row = db.prepare(`SELECT * FROM attachments WHERE id = ?`).get(id) as
        | AttachmentRow
        | undefined;
      return row ?? null;
    },

    findById(id: string): Attachment | null {
      const row = this.findRowById(id);
      return row ? mapAttachment(row) : null;
    },

    /** 按传入 ID 顺序批量取行（编排器组装多模态消息时保持图片顺序） */
    listRowsByIds(ids: string[]): AttachmentRow[] {
      if (ids.length === 0) return [];
      const placeholders = ids.map(() => '?').join(',');
      const rows = db
        .prepare(`SELECT * FROM attachments WHERE id IN (${placeholders})`)
        .all(...ids) as AttachmentRow[];
      const byId = new Map(rows.map((row) => [row.id, row]));
      return ids.map((id) => byId.get(id)).filter((row): row is AttachmentRow => Boolean(row));
    },

    findByHash(contentHash: string): AttachmentRow | null {
      const row = db.prepare(`SELECT * FROM attachments WHERE content_hash = ?`).get(contentHash) as
        | AttachmentRow
        | undefined;
      return row ?? null;
    },

    /** 备份导出用：列出所有附件行（含 storage_path） */
    list(): AttachmentRow[] {
      return db
        .prepare(`SELECT * FROM attachments ORDER BY created_at ASC`)
        .all() as AttachmentRow[];
    },
  };
}

export type AttachmentRepository = ReturnType<typeof createAttachmentRepository>;
