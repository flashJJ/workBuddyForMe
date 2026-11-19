/**
 * v2.0 M2 events 轨 relationshipMilestones.json 恢复（备份 schema v6 追加负载）。
 * - v5 及更早归档缺文件按 0 降级；
 * - INSERT OR IGNORE 幂等（(assistant_id,milestone_key) 唯一索引兜底），不覆盖本机达成时间；
 * - 助手不存在由外键拒绝即跳过；payload 宽容未知键，记录经 zod 校验。
 */
import {
  relationshipMilestoneRecordSchema,
  type RelationshipMilestoneRecord,
} from '@wbfm/shared/schemas';
import { ApiError } from '@wbfm/shared/errors';
import type { DatabaseInstance } from '@wbfm/database';

export interface MilestoneRestoreCounts {
  imported: number;
  skipped: number;
}

/** 解析 relationshipMilestones.json（损坏归档给出与其他轨一致的校验错误） */
export function readRelationshipMilestonesPayload(buf: Buffer): unknown[] {
  try {
    const parsed: unknown = JSON.parse(buf.toString('utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new ApiError('VALIDATION_ERROR', 'relationshipMilestones.json 解析失败，归档可能已损坏');
  }
}

export function restoreRelationshipMilestones(
  db: DatabaseInstance,
  entries: unknown[],
): MilestoneRestoreCounts {
  const counts: MilestoneRestoreCounts = { imported: 0, skipped: 0 };
  const insert = db.prepare(
    `INSERT OR IGNORE INTO relationship_milestones
       (id, assistant_id, milestone_key, achieved_at, payload_json)
     VALUES (@id, @assistantId, @milestoneKey, @achievedAt, @payloadJson)`,
  );
  for (const raw of entries) {
    const parsed = relationshipMilestoneRecordSchema.safeParse(raw);
    if (!parsed.success) {
      counts.skipped++;
      continue;
    }
    const record: RelationshipMilestoneRecord = parsed.data;
    try {
      const result = insert.run({
        id: record.id,
        assistantId: record.assistantId,
        milestoneKey: record.milestoneKey,
        achievedAt: record.achievedAt,
        payloadJson: JSON.stringify(record.payload ?? {}),
      });
      if (result.changes > 0) counts.imported++;
      else counts.skipped++;
    } catch {
      // 外键（助手不存在）等约束失败：跳过该记录
      counts.skipped++;
    }
  }
  return counts;
}
