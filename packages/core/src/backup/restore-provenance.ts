/**
 * v2.6 M5：events 轨新增负载恢复（备份 schema v7）。
 *
 * 文件：memories.json / meetingConclusions.json / meetingActionItems.json。
 * - 旧档（v6 及更早）缺文件视为空数组；
 * - 全部 INSERT OR IGNORE 幂等，不覆盖目标库已有行；
 * - 会议结论/行动项仅在其会议已存在时恢复；记忆的来源会话/消息可悬空（无外键），
 *   UI 会以「来源会话/消息已删除」降级，不阻断记忆本身。
 * - 记忆向量不入档；恢复后语义召回需重新嵌入（与知识库恢复口径一致）。
 */
import { z } from 'zod';
import {
  MEMORY_KINDS,
  MEMORY_STATUSES,
  type MemoryKind,
  type MemoryStatus,
} from '@wbfm/shared/types';
import {
  MEETING_ACTION_ITEM_SOURCES,
  MEETING_ACTION_ITEM_STATUSES,
} from '@wbfm/shared/schemas';
import { ApiError } from '@wbfm/shared/errors';
import type { DatabaseInstance } from '@wbfm/database';

const memorySchema = z.object({
  id: z.string().regex(/^\d+$/),
  kind: z.enum([...MEMORY_KINDS] as [MemoryKind, ...MemoryKind[]]),
  content: z.string().min(1),
  importance: z.number().min(0).max(1),
  sourceConversationId: z.string().nullable().optional(),
  sourceMessageId: z.string().nullable().optional(),
  recallCount: z.number().int().min(0).optional(),
  status: z.enum([...MEMORY_STATUSES] as [MemoryStatus, ...MemoryStatus[]]).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  lastAccessedAt: z.string().nullable().optional(),
});

const conclusionSchema = z.object({
  meetingId: z.string().min(1),
  summary: z.string(),
  decisions: z.array(z.string()),
  openQuestions: z.array(z.string()),
  modelId: z.string().nullable().optional(),
  generatedAt: z.string().min(1),
  editedAt: z.string().nullable().optional(),
});

const actionItemSchema = z.object({
  id: z.string().min(1),
  meetingId: z.string().min(1),
  content: z.string().min(1),
  ownerLabel: z.string().optional(),
  ownerMemberId: z.string().nullable().optional(),
  dueAt: z.string().nullable().optional(),
  status: z.enum(MEETING_ACTION_ITEM_STATUSES),
  source: z.enum(MEETING_ACTION_ITEM_SOURCES),
  sourceTurnId: z.string().nullable().optional(),
  linkedReminderId: z.string().nullable().optional(),
  linkedFlowRunId: z.string().nullable().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export interface ProvenanceTrackPayloads {
  memories: unknown[];
  meetingConclusions: unknown[];
  meetingActionItems: unknown[];
}

export interface ProvenanceRestoreCounts {
  memories: { imported: number; skipped: number };
  meetingConclusions: { imported: number; skipped: number };
  meetingActionItems: { imported: number; skipped: number };
}

function readArray(buf: Buffer | undefined, filename: string): unknown[] {
  if (!buf) return [];
  try {
    const parsed = JSON.parse(buf.toString('utf-8')) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new ApiError('VALIDATION_ERROR', `${filename} 解析失败，归档可能已损坏`);
  }
}

export function readProvenancePayloads(files: ReadonlyMap<string, Buffer>): ProvenanceTrackPayloads {
  return {
    memories: readArray(files.get('memories.json'), 'memories.json'),
    meetingConclusions: readArray(files.get('meetingConclusions.json'), 'meetingConclusions.json'),
    meetingActionItems: readArray(files.get('meetingActionItems.json'), 'meetingActionItems.json'),
  };
}

/** 恢复 v2.6 负载（须在会议恢复之后、同事务内调用） */
export function restoreProvenance(
  db: DatabaseInstance,
  payloads: ProvenanceTrackPayloads,
): ProvenanceRestoreCounts {
  const counts: ProvenanceRestoreCounts = {
    memories: { imported: 0, skipped: 0 },
    meetingConclusions: { imported: 0, skipped: 0 },
    meetingActionItems: { imported: 0, skipped: 0 },
  };
  const meetingExists = db.prepare(`SELECT 1 FROM meetings WHERE id = ?`);
  const insertMemory = db.prepare(
    `INSERT OR IGNORE INTO memories(
       id, kind, content, importance, source_conversation_id, source_message_id,
       status, created_at, updated_at, last_accessed_at, recall_count)
     VALUES (
       @id, @kind, @content, @importance, @sourceConversationId, @sourceMessageId,
       @status, @createdAt, @updatedAt, @lastAccessedAt, @recallCount)`,
  );
  const insertConclusion = db.prepare(
    `INSERT OR IGNORE INTO meeting_conclusions(
       meeting_id, summary, decisions_json, open_questions_json, model_id,
       generated_at, edited_at)
     VALUES (
       @meetingId, @summary, @decisions, @openQuestions, @modelId,
       @generatedAt, @editedAt)`,
  );
  const insertActionItem = db.prepare(
    `INSERT OR IGNORE INTO meeting_action_items(
       id, meeting_id, content, owner_label, owner_member_id, due_at, status, source,
       source_turn_id, linked_reminder_id, linked_flow_run_id, created_at, updated_at)
     VALUES (
       @id, @meetingId, @content, @ownerLabel, @ownerMemberId, @dueAt, @status, @source,
       @sourceTurnId, @linkedReminderId, @linkedFlowRunId, @createdAt, @updatedAt)`,
  );

  // 1. 长期记忆：保留 id / 来源 / 召回次数；向量不入档
  for (const raw of payloads.memories) {
    const parsed = memorySchema.safeParse(raw);
    if (!parsed.success) {
      counts.memories.skipped++;
      continue;
    }
    const d = parsed.data;
    try {
      const result = insertMemory.run({
        id: Number(d.id),
        kind: d.kind,
        content: d.content,
        importance: d.importance,
        sourceConversationId: d.sourceConversationId ?? null,
        sourceMessageId: d.sourceMessageId ?? null,
        status: d.status ?? 'active',
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        lastAccessedAt: d.lastAccessedAt ?? null,
        recallCount: d.recallCount ?? 0,
      });
      if (result.changes > 0) counts.memories.imported++;
      else counts.memories.skipped++;
    } catch {
      counts.memories.skipped++;
    }
  }

  // 2. 会议结论：会议不存在则跳过（不产生悬空结论）
  for (const raw of payloads.meetingConclusions) {
    const parsed = conclusionSchema.safeParse(raw);
    if (!parsed.success || !meetingExists.get(parsed.data.meetingId)) {
      counts.meetingConclusions.skipped++;
      continue;
    }
    const d = parsed.data;
    try {
      const result = insertConclusion.run({
        meetingId: d.meetingId,
        summary: d.summary,
        decisions: JSON.stringify(d.decisions),
        openQuestions: JSON.stringify(d.openQuestions),
        modelId: d.modelId ?? null,
        generatedAt: d.generatedAt,
        editedAt: d.editedAt ?? null,
      });
      if (result.changes > 0) counts.meetingConclusions.imported++;
      else counts.meetingConclusions.skipped++;
    } catch {
      counts.meetingConclusions.skipped++;
    }
  }

  // 3. 行动项：会议不存在则跳过；保留状态/回链 id
  for (const raw of payloads.meetingActionItems) {
    const parsed = actionItemSchema.safeParse(raw);
    if (!parsed.success || !meetingExists.get(parsed.data.meetingId)) {
      counts.meetingActionItems.skipped++;
      continue;
    }
    const d = parsed.data;
    try {
      const result = insertActionItem.run({
        id: d.id,
        meetingId: d.meetingId,
        content: d.content,
        ownerLabel: d.ownerLabel ?? '',
        ownerMemberId: d.ownerMemberId ?? null,
        dueAt: d.dueAt ?? null,
        status: d.status,
        source: d.source,
        sourceTurnId: d.sourceTurnId ?? null,
        linkedReminderId: d.linkedReminderId ?? null,
        linkedFlowRunId: d.linkedFlowRunId ?? null,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      });
      if (result.changes > 0) counts.meetingActionItems.imported++;
      else counts.meetingActionItems.skipped++;
    } catch {
      counts.meetingActionItems.skipped++;
    }
  }

  return counts;
}

/** events 轨进度分子：v2.6 三类负载的导入+跳过总数 */
export function provenanceTotal(counts: ProvenanceRestoreCounts): number {
  return (
    counts.memories.imported + counts.memories.skipped +
    counts.meetingConclusions.imported + counts.meetingConclusions.skipped +
    counts.meetingActionItems.imported + counts.meetingActionItems.skipped
  );
}
