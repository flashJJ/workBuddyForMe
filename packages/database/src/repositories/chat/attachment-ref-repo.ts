import type { ContentPart } from '@wbfm/shared/types';
import type { DatabaseInstance } from '../../client';
import { nowIso } from '../../utils/time';

export type AttachmentOwnerType = 'message' | 'artifact';

/** 引用行（备份 refs.json 与核对报告共用） */
export interface AttachmentRef {
  attachmentId: string;
  ownerType: AttachmentOwnerType;
  ownerId: string;
  createdAt: string;
}

interface AttachmentRefRow {
  attachment_id: string;
  owner_type: AttachmentOwnerType;
  owner_id: string;
  created_at: string;
}

function mapRef(row: AttachmentRefRow): AttachmentRef {
  return {
    attachmentId: row.attachment_id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    createdAt: row.created_at,
  };
}

/** 从 content_parts 提取图片附件 id（文本片段忽略） */
export function imageAttachmentIds(parts: ContentPart[] | undefined): string[] {
  if (!parts?.length) return [];
  return parts
    .filter((part): part is Extract<ContentPart, { type: 'image' }> => part.type === 'image')
    .map((part) => part.attachmentId);
}

/**
 * v2.33：消息写入时登记图片引用（INSERT OR IGNORE，重复调用不产生重复行）。
 * 消息更新没有内容片段写入路径，删除侧由 messages 触发器兜底清理。
 */
export function registerMessageAttachmentRefs(
  db: DatabaseInstance,
  messageId: string,
  parts: ContentPart[] | undefined,
  createdAt = nowIso(),
): void {
  const ids = imageAttachmentIds(parts);
  if (ids.length === 0) return;
  // 附件行不存在时静默跳过（避免历史悬空 id 让消息写入失败）
  const insert = db.prepare(
    `INSERT OR IGNORE INTO attachment_refs
       (attachment_id, owner_type, owner_id, created_at)
     SELECT ?, 'message', ?, ?
     WHERE EXISTS (SELECT 1 FROM attachments WHERE id = ?)`,
  );
  for (const attachmentId of ids) insert.run(attachmentId, messageId, createdAt, attachmentId);
}

export function createAttachmentRefRepository(db: DatabaseInstance) {
  return {
    add(ref: AttachmentRef): void {
      db.prepare(
        `INSERT OR IGNORE INTO attachment_refs
           (attachment_id, owner_type, owner_id, created_at)
         VALUES (?, ?, ?, ?)`,
      ).run(ref.attachmentId, ref.ownerType, ref.ownerId, ref.createdAt);
    },

    /** 批量登记（恢复 refs.json 与启动回填），返回实际新增行数 */
    addMany(refs: AttachmentRef[]): number {
      const insert = db.prepare(
        `INSERT OR IGNORE INTO attachment_refs
           (attachment_id, owner_type, owner_id, created_at)
         VALUES (?, ?, ?, ?)`,
      );
      let inserted = 0;
      const run = db.transaction((items: AttachmentRef[]) => {
        for (const ref of items) inserted += insert.run(
          ref.attachmentId,
          ref.ownerType,
          ref.ownerId,
          ref.createdAt,
        ).changes;
      });
      run(refs);
      return inserted;
    },

    list(): AttachmentRef[] {
      const rows = db.prepare(
        `SELECT attachment_id, owner_type, owner_id, created_at
           FROM attachment_refs ORDER BY created_at ASC, attachment_id ASC`,
      ).all() as AttachmentRefRow[];
      return rows.map(mapRef);
    },

    listByOwner(ownerType: AttachmentOwnerType, ownerId: string): AttachmentRef[] {
      const rows = db.prepare(
        `SELECT attachment_id, owner_type, owner_id, created_at
           FROM attachment_refs WHERE owner_type = ? AND owner_id = ?
         ORDER BY created_at ASC, attachment_id ASC`,
      ).all(ownerType, ownerId) as AttachmentRefRow[];
      return rows.map(mapRef);
    },
  };
}

export type AttachmentRefRepository = ReturnType<typeof createAttachmentRefRepository>;
