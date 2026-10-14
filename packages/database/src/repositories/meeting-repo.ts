import type { MeetingMode, MeetingStatus } from '@wbfm/shared/schemas';
import type { MeetingMessageRecord, MeetingRecord } from '@wbfm/shared/types';
import type { DatabaseInstance } from '../client';
import { newId, nowIso } from './mappers';

interface MeetingRow {
  id: string;
  topic: string;
  member_ids: string;
  mode: string;
  model_id: string | null;
  status: string;
  auto_rounds: number;
  created_at: string;
  finished_at: string | null;
}

interface MeetingMessageRow {
  id: string;
  meeting_id: string;
  seq: number;
  speaker_kind: string;
  speaker_id: string | null;
  speaker_name: string;
  content: string;
  emotion_tag: string | null;
  truncated: number;
  created_at: string;
}

function mapMeeting(row: MeetingRow): MeetingRecord {
  let memberIds: string[] = [];
  try {
    const parsed = JSON.parse(row.member_ids) as unknown;
    if (Array.isArray(parsed)) memberIds = parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    throw new Error(`meetings.member_ids 损坏：${row.id}`);
  }
  return {
    id: row.id,
    topic: row.topic,
    memberIds,
    mode: row.mode as MeetingMode,
    modelId: row.model_id,
    status: row.status as MeetingStatus,
    autoRounds: row.auto_rounds,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

function mapMessage(row: MeetingMessageRow): MeetingMessageRecord {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    seq: row.seq,
    speakerKind: row.speaker_kind as MeetingMessageRecord['speakerKind'],
    speakerId: row.speaker_id,
    speakerName: row.speaker_name,
    content: row.content,
    emotionTag: row.emotion_tag,
    truncated: row.truncated === 1,
    createdAt: row.created_at,
  };
}

export interface MeetingCreateFields {
  id?: string;
  topic: string;
  memberIds: string[];
  mode: MeetingMode;
  modelId: string | null;
  createdAt?: string;
}

export interface MeetingMessageInsert {
  id?: string;
  meetingId: string;
  speakerKind: 'user' | 'assistant';
  speakerId: string | null;
  speakerName: string;
  content: string;
  emotionTag?: string | null;
  truncated?: boolean;
  createdAt?: string;
}

export interface MeetingRepository {
  create(fields: MeetingCreateFields): MeetingRecord;
  findById(id: string): MeetingRecord | null;
  list(): MeetingRecord[];
  updateMode(id: string, mode: MeetingMode): void;
  addAutoRound(id: string): MeetingRecord | null;
  finalize(id: string, status: Exclude<MeetingStatus, 'active'>): void;
  appendMessage(fields: MeetingMessageInsert): MeetingMessageRecord;
  listMessages(meetingId: string): MeetingMessageRecord[];
  /** 恢复用：INSERT OR IGNORE 幂等 */
  upsertMeetingIgnore(record: MeetingRecord): void;
  upsertMessageIgnore(record: MeetingMessageRecord): void;
}

export function createMeetingRepository(db: DatabaseInstance): MeetingRepository {
  return {
    create(fields) {
      const id = fields.id ?? newId();
      const ts = fields.createdAt ?? nowIso();
      db.prepare(
        `INSERT INTO meetings(id,topic,member_ids,mode,model_id,status,auto_rounds,created_at,finished_at)
         VALUES (@id,@topic,@memberIds,@mode,@modelId,'active',0,@createdAt,NULL)`,
      ).run({
        id,
        topic: fields.topic,
        memberIds: JSON.stringify(fields.memberIds),
        mode: fields.mode,
        modelId: fields.modelId,
        createdAt: ts,
      });
      return this.findById(id)!;
    },

    findById(id) {
      const row = db.prepare(`SELECT * FROM meetings WHERE id = ?`).get(id) as
        | MeetingRow
        | undefined;
      return row ? mapMeeting(row) : null;
    },

    list() {
      const rows = db
        .prepare(`SELECT * FROM meetings ORDER BY created_at DESC`)
        .all() as MeetingRow[];
      return rows.map(mapMeeting);
    },

    updateMode(id, mode) {
      db.prepare(`UPDATE meetings SET mode = ? WHERE id = ?`).run(mode, id);
    },

    addAutoRound(id) {
      db.prepare(`UPDATE meetings SET auto_rounds = auto_rounds + 1 WHERE id = ?`).run(id);
      return this.findById(id);
    },

    finalize(id, status) {
      db.prepare(
        `UPDATE meetings SET status = @status, finished_at = COALESCE(finished_at, @ts) WHERE id = @id`,
      ).run({ status, ts: nowIso(), id });
    },

    appendMessage(fields) {
      const id = fields.id ?? newId();
      const ts = fields.createdAt ?? nowIso();
      // seq 单会议严格递增：事务内取 max+1，单 AbortController 串行写入天然无并发
      const tx = db.transaction(() => {
        const maxRow = db
          .prepare(`SELECT COALESCE(MAX(seq), 0) AS s FROM meeting_messages WHERE meeting_id = ?`)
          .get(fields.meetingId) as { s: number };
        db.prepare(
          `INSERT INTO meeting_messages(id,meeting_id,seq,speaker_kind,speaker_id,speaker_name,content,emotion_tag,truncated,created_at)
           VALUES (@id,@meetingId,@seq,@speakerKind,@speakerId,@speakerName,@content,@emotionTag,@truncated,@createdAt)`,
        ).run({
          id,
          meetingId: fields.meetingId,
          seq: maxRow.s + 1,
          speakerKind: fields.speakerKind,
          speakerId: fields.speakerId,
          speakerName: fields.speakerName,
          content: fields.content,
          emotionTag: fields.emotionTag ?? null,
          truncated: fields.truncated ? 1 : 0,
          createdAt: ts,
        });
      });
      tx();
      const row = db
        .prepare(`SELECT * FROM meeting_messages WHERE id = ?`)
        .get(id) as MeetingMessageRow;
      return mapMessage(row);
    },

    listMessages(meetingId) {
      const rows = db
        .prepare(`SELECT * FROM meeting_messages WHERE meeting_id = ? ORDER BY seq ASC`)
        .all(meetingId) as MeetingMessageRow[];
      return rows.map(mapMessage);
    },

    upsertMeetingIgnore(record) {
      db.prepare(
        `INSERT OR IGNORE INTO meetings(id,topic,member_ids,mode,model_id,status,auto_rounds,created_at,finished_at)
         VALUES (@id,@topic,@memberIds,@mode,@modelId,@status,@autoRounds,@createdAt,@finishedAt)`,
      ).run({
        id: record.id,
        topic: record.topic,
        memberIds: JSON.stringify(record.memberIds),
        mode: record.mode,
        modelId: record.modelId,
        status: record.status,
        autoRounds: record.autoRounds,
        createdAt: record.createdAt,
        finishedAt: record.finishedAt,
      });
    },

    upsertMessageIgnore(record) {
      db.prepare(
        `INSERT OR IGNORE INTO meeting_messages(id,meeting_id,seq,speaker_kind,speaker_id,speaker_name,content,emotion_tag,truncated,created_at)
         VALUES (@id,@meetingId,@seq,@speakerKind,@speakerId,@speakerName,@content,@emotionTag,@truncated,@createdAt)`,
      ).run({
        id: record.id,
        meetingId: record.meetingId,
        seq: record.seq,
        speakerKind: record.speakerKind,
        speakerId: record.speakerId,
        speakerName: record.speakerName,
        content: record.content,
        emotionTag: record.emotionTag,
        truncated: record.truncated ? 1 : 0,
        createdAt: record.createdAt,
      });
    },
  };
}
