import {
  createAttachmentRefRepository,
  createAttachmentRepository,
  createMessageRepository,
  createSettingsRepository,
  imageAttachmentIds,
  type AttachmentRef,
  type DatabaseInstance,
} from '@wbfm/database';
import { ARTIFACT_MIME_BY_FORMAT } from '@wbfm/shared/constants';

/** 回填完成标记（settings_kv）；值为完成时间 ISO 字符串 */
export const ATTACHMENT_REFS_BACKFILLED_KEY = 'attachmentRefs.backfilledAt';

const ARTIFACT_MIME_SET = new Set(Object.values(ARTIFACT_MIME_BY_FORMAT));

let running = false;

export interface AttachmentRefsBackfillResult {
  /** 已有标记且未强制时跳过 */
  skipped: boolean;
  inserted: number;
}

/**
 * v2.33 P1：引用计数幂等回填。
 * 扫描消息 content_parts 与产物 MIME 重建 attachment_refs，写完成标记；
 * 重复启动不重复扫描，`force` 用于恢复旧归档后立即补齐。
 */
export function backfillAttachmentRefs(
  db: DatabaseInstance,
  options: { force?: boolean } = {},
): AttachmentRefsBackfillResult {
  if (running) return { skipped: true, inserted: 0 };
  running = true;
  try {
    const settings = createSettingsRepository(db);
    if (!options.force && settings.getJson<string | null>(ATTACHMENT_REFS_BACKFILLED_KEY, null)) {
      return { skipped: true, inserted: 0 };
    }

    const attachments = createAttachmentRepository(db).list();
    const attachmentIds = new Set(attachments.map((row) => row.id));
    const pending: AttachmentRef[] = [];

    for (const message of createMessageRepository(db).listContentParts()) {
      for (const attachmentId of imageAttachmentIds(message.contentParts)) {
        if (!attachmentIds.has(attachmentId)) continue;
        pending.push({
          attachmentId,
          ownerType: 'message',
          ownerId: message.id,
          createdAt: message.createdAt,
        });
      }
    }
    for (const row of attachments) {
      if (!ARTIFACT_MIME_SET.has(row.mime_type)) continue;
      pending.push({
        attachmentId: row.id,
        ownerType: 'artifact',
        ownerId: row.id,
        createdAt: row.created_at,
      });
    }

    const inserted = createAttachmentRefRepository(db).addMany(pending);
    settings.setJson(ATTACHMENT_REFS_BACKFILLED_KEY, new Date().toISOString());
    return { skipped: false, inserted };
  } finally {
    running = false;
  }
}
