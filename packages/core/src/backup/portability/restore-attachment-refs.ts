import {
  createAttachmentRefRepository,
  createAttachmentRepository,
  type AttachmentRef,
  type AttachmentOwnerType,
  type DatabaseInstance,
} from '@wbfm/database';
import { ApiError } from '@wbfm/shared/errors';

const OWNER_TYPES: readonly AttachmentOwnerType[] = ['message', 'artifact'];

/** v2.33：解析 refs.json（可选负载；文件存在但损坏视为归档损坏） */
export function readAttachmentRefsPayload(raw: Buffer): AttachmentRef[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf-8'));
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'refs.json 解析失败，归档可能已损坏');
  }
  if (!Array.isArray(parsed)) return [];

  const refs: AttachmentRef[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Partial<AttachmentRef>;
    if (typeof row.attachmentId !== 'string' || !row.attachmentId) continue;
    if (typeof row.ownerId !== 'string' || !row.ownerId) continue;
    if (!row.ownerType || !OWNER_TYPES.includes(row.ownerType)) continue;
    refs.push({
      attachmentId: row.attachmentId,
      ownerType: row.ownerType,
      ownerId: row.ownerId,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
    });
  }
  return refs;
}

/** 恢复 refs.json：只登记附件行仍存在的引用，其余计入 skipped */
export function restoreAttachmentRefs(
  db: DatabaseInstance,
  refs: AttachmentRef[],
): { imported: number; skipped: number } {
  if (refs.length === 0) return { imported: 0, skipped: 0 };
  const existing = new Set(createAttachmentRepository(db).list().map((row) => row.id));
  const valid = refs.filter((ref) => existing.has(ref.attachmentId));
  const imported = createAttachmentRefRepository(db).addMany(valid);
  return { imported, skipped: refs.length - imported };
}
