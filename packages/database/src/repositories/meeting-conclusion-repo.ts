import type {
  MeetingActionItemCreateInput,
  MeetingActionItemStatus,
  MeetingActionItemUpdateInput,
  MeetingConclusionDraft,
} from '@wbfm/shared/schemas';
import type {
  MeetingActionItemRecord,
  MeetingConclusionRecord,
} from '@wbfm/shared/types';
import type { DatabaseInstance } from '../client';
import { newId, nowIso } from './mappers';

interface ConclusionRow {
  meeting_id: string;
  summary: string;
  decisions_json: string;
  open_questions_json: string;
  model_id: string | null;
  generated_at: string;
  edited_at: string | null;
}

interface ActionItemRow {
  id: string;
  meeting_id: string;
  content: string;
  owner_label: string;
  owner_member_id: string | null;
  due_at: string | null;
  status: string;
  source: string;
  source_turn_id: string | null;
  linked_reminder_id: string | null;
  linked_flow_run_id: string | null;
  created_at: string;
  updated_at: string;
}

function parseStringArray(raw: string, field: string, meetingId: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    // fall through
  }
  throw new Error(`meeting_conclusions.${field} 损坏：${meetingId}`);
}

function mapConclusion(row: ConclusionRow): MeetingConclusionRecord {
  return {
    meetingId: row.meeting_id,
    summary: row.summary,
    decisions: parseStringArray(row.decisions_json, 'decisions_json', row.meeting_id),
    openQuestions: parseStringArray(
      row.open_questions_json,
      'open_questions_json',
      row.meeting_id,
    ),
    modelId: row.model_id,
    generatedAt: row.generated_at,
    editedAt: row.edited_at,
  };
}

function mapActionItem(row: ActionItemRow): MeetingActionItemRecord {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    content: row.content,
    ownerLabel: row.owner_label,
    ownerMemberId: row.owner_member_id,
    dueAt: row.due_at,
    status: row.status as MeetingActionItemStatus,
    source: row.source as MeetingActionItemRecord['source'],
    sourceTurnId: row.source_turn_id,
    linkedReminderId: row.linked_reminder_id,
    linkedFlowRunId: row.linked_flow_run_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface MeetingConclusionUpsertFields {
  meetingId: string;
  summary: string;
  decisions: string[];
  openQuestions: string[];
  modelId: string | null;
  generatedAt?: string;
}

export interface MeetingConclusionPatch {
  summary?: string;
  decisions?: string[];
  openQuestions?: string[];
}

export interface MeetingRepositoryForConclusion {
  getConclusion(meetingId: string): MeetingConclusionRecord | null;
  updateConclusion(meetingId: string, patch: MeetingConclusionPatch): MeetingConclusionRecord | null;
  saveGeneratedConclusion(
    fields: MeetingConclusionUpsertFields,
    items: MeetingConclusionDraft['actionItems'],
  ): MeetingConclusionRecord;
  listActionItems(meetingId: string): MeetingActionItemRecord[];
  getActionItem(meetingId: string, itemId: string): MeetingActionItemRecord | null;
  createActionItem(meetingId: string, input: MeetingActionItemCreateInput): MeetingActionItemRecord;
  updateActionItem(
    meetingId: string,
    itemId: string,
    patch: MeetingActionItemUpdateInput,
  ): MeetingActionItemRecord | null;
  /** v2.6 M3：行动项 → 提醒/Flow 运行的回链（只写对应列） */
  linkReminder(
    meetingId: string,
    itemId: string,
    reminderId: string,
  ): MeetingActionItemRecord | null;
  linkFlowRun(meetingId: string, itemId: string, runId: string): MeetingActionItemRecord | null;
}

export function createMeetingConclusionRepository(
  db: DatabaseInstance,
): MeetingRepositoryForConclusion {
  const insertActionItem = db.prepare(
    `INSERT INTO meeting_action_items(
       id,meeting_id,content,owner_label,owner_member_id,due_at,status,source,
       source_turn_id,linked_reminder_id,linked_flow_run_id,created_at,updated_at
     ) VALUES(
       @id,@meetingId,@content,@ownerLabel,@ownerMemberId,@dueAt,@status,@source,
       NULL,NULL,NULL,@createdAt,@updatedAt
     )`,
  );

  const upsertConclusion = db.prepare(
    `INSERT INTO meeting_conclusions(
       meeting_id,summary,decisions_json,open_questions_json,model_id,generated_at,edited_at
     ) VALUES(@meetingId,@summary,@decisions,@openQuestions,@modelId,@generatedAt,NULL)
     ON CONFLICT(meeting_id) DO UPDATE SET
       summary=excluded.summary,
       decisions_json=excluded.decisions_json,
       open_questions_json=excluded.open_questions_json,
       model_id=excluded.model_id,
       generated_at=excluded.generated_at,
       edited_at=NULL`,
  );

  function getConclusion(meetingId: string): MeetingConclusionRecord | null {
    const row = db
      .prepare(`SELECT * FROM meeting_conclusions WHERE meeting_id = ?`)
      .get(meetingId) as ConclusionRow | undefined;
    return row ? mapConclusion(row) : null;
  }

  function getActionItem(meetingId: string, itemId: string): MeetingActionItemRecord | null {
    const row = db
      .prepare(`SELECT * FROM meeting_action_items WHERE meeting_id = ? AND id = ?`)
      .get(meetingId, itemId) as ActionItemRow | undefined;
    return row ? mapActionItem(row) : null;
  }

  return {
    getConclusion,

    updateConclusion(meetingId, patch) {
      const existing = getConclusion(meetingId);
      if (!existing) return null;
      const summary = patch.summary ?? existing.summary;
      const decisions = patch.decisions ?? existing.decisions;
      const openQuestions = patch.openQuestions ?? existing.openQuestions;
      db.prepare(
        `UPDATE meeting_conclusions
         SET summary = @summary, decisions_json = @decisions,
             open_questions_json = @openQuestions, edited_at = @editedAt
         WHERE meeting_id = @meetingId`,
      ).run({
        meetingId,
        summary,
        decisions: JSON.stringify(decisions),
        openQuestions: JSON.stringify(openQuestions),
        editedAt: nowIso(),
      });
      return getConclusion(meetingId);
    },

    saveGeneratedConclusion(fields, items) {
      const generatedAt = fields.generatedAt ?? nowIso();
      const save = db.transaction(() => {
        upsertConclusion.run({
          meetingId: fields.meetingId,
          summary: fields.summary,
          decisions: JSON.stringify(fields.decisions),
          openQuestions: JSON.stringify(fields.openQuestions),
          modelId: fields.modelId,
          generatedAt,
        });
        // 手动行动项保留；仅替换本次自动生成项，避免覆盖用户状态。
        db.prepare(
          `DELETE FROM meeting_action_items WHERE meeting_id = ? AND source = 'generated'`,
        ).run(fields.meetingId);
        for (const item of items) {
          const ts = nowIso();
          insertActionItem.run({
            id: newId(),
            meetingId: fields.meetingId,
            content: item.content,
            ownerLabel: item.ownerLabel,
            ownerMemberId: item.ownerMemberId,
            dueAt: item.dueAt,
            status: 'open',
            source: 'generated',
            createdAt: ts,
            updatedAt: ts,
          });
        }
      });
      save();
      return getConclusion(fields.meetingId)!;
    },

    listActionItems(meetingId) {
      const rows = db
        .prepare(
          `SELECT * FROM meeting_action_items WHERE meeting_id = ? ORDER BY created_at ASC, id ASC`,
        )
        .all(meetingId) as ActionItemRow[];
      return rows.map(mapActionItem);
    },

    getActionItem,

    createActionItem(meetingId, input) {
      const ts = nowIso();
      const id = newId();
      insertActionItem.run({
        id,
        meetingId,
        content: input.content,
        ownerLabel: input.ownerLabel,
        ownerMemberId: input.ownerMemberId,
        dueAt: input.dueAt,
        status: 'open',
        source: 'manual',
        createdAt: ts,
        updatedAt: ts,
      });
      return getActionItem(meetingId, id)!;
    },

    updateActionItem(meetingId, itemId, patch) {
      const existing = getActionItem(meetingId, itemId);
      if (!existing) return null;
      const merged = {
        content: patch.content ?? existing.content,
        ownerLabel: patch.ownerLabel ?? existing.ownerLabel,
        ownerMemberId:
          'ownerMemberId' in patch ? patch.ownerMemberId ?? null : existing.ownerMemberId,
        dueAt: 'dueAt' in patch ? patch.dueAt ?? null : existing.dueAt,
        status: patch.status ?? existing.status,
      };
      db.prepare(
        `UPDATE meeting_action_items
         SET content = @content, owner_label = @ownerLabel, owner_member_id = @ownerMemberId,
             due_at = @dueAt, status = @status, updated_at = @updatedAt
         WHERE meeting_id = @meetingId AND id = @itemId`,
      ).run({
        meetingId,
        itemId,
        content: merged.content,
        ownerLabel: merged.ownerLabel,
        ownerMemberId: merged.ownerMemberId,
        dueAt: merged.dueAt,
        status: merged.status,
        updatedAt: nowIso(),
      });
      return getActionItem(meetingId, itemId);
    },

    linkReminder(meetingId, itemId, reminderId) {
      db.prepare(
        `UPDATE meeting_action_items
         SET linked_reminder_id = ?, updated_at = ?
         WHERE meeting_id = ? AND id = ?`,
      ).run(reminderId, nowIso(), meetingId, itemId);
      return getActionItem(meetingId, itemId);
    },

    linkFlowRun(meetingId, itemId, runId) {
      db.prepare(
        `UPDATE meeting_action_items
         SET linked_flow_run_id = ?, updated_at = ?
         WHERE meeting_id = ? AND id = ?`,
      ).run(runId, nowIso(), meetingId, itemId);
      return getActionItem(meetingId, itemId);
    },
  };
}
