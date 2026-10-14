/**
 * v1.9 events 轨 v1.9 负载恢复（备份 schema v5；docs/plan/v1.9/03 §2/§6）：
 * stageScenes.json → meetings.json → meetingMessages.json（顺序不可换，消息外键语义依赖会议）。
 * 全部 INSERT OR IGNORE 幂等；会议成员中悬空（目标库不存在）的 assistantId 恢复时剔除，
 * 残余悬空由会场页 missing 标注兜底。消息携带 speakerName 快照，成员缺失也保留转录。
 */
import { z } from 'zod';
import {
  MEETING_MODES,
  MEETING_STATUSES,
  stageScenePayloadSchema,
} from '@wbfm/shared/schemas';
import { ApiError } from '@wbfm/shared/errors';
import type { DatabaseInstance } from '@wbfm/database';
import {
  createMeetingRepository,
  createStageSceneRepository,
} from '@wbfm/database';
import type { MeetingMessageRecord, MeetingRecord, StageSceneRecord } from '@wbfm/shared/types';

const isoSchema = z.string().datetime();

const sceneRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  isBuiltin: z.boolean().optional(),
  payload: stageScenePayloadSchema,
  createdAt: isoSchema,
  updatedAt: isoSchema,
});

const meetingRecordSchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  memberIds: z.array(z.string().min(1)),
  mode: z.enum(MEETING_MODES),
  modelId: z.string().nullable(),
  status: z.enum(MEETING_STATUSES),
  autoRounds: z.number().int().min(0),
  createdAt: isoSchema,
  finishedAt: z.string().datetime().nullable(),
});

const messageRecordSchema = z.object({
  id: z.string().min(1),
  meetingId: z.string().min(1),
  seq: z.number().int().min(1),
  speakerKind: z.enum(['user', 'assistant']),
  speakerId: z.string().nullable(),
  speakerName: z.string(),
  content: z.string(),
  emotionTag: z.string().nullable(),
  truncated: z.boolean().optional(),
  createdAt: isoSchema,
});

export interface V19TrackPayloads {
  stageScenes: unknown[];
  meetings: unknown[];
  meetingMessages: unknown[];
}

export interface V19RestoreCounts {
  stageScenes: { imported: number; skipped: number };
  meetings: { imported: number; skipped: number };
  meetingMessages: { imported: number; skipped: number };
}

/** 宽容读取：缺文件视为空（v4 及更早归档无 v1.9 负载）；文件损坏抛校验错误 */
function readArray(buf: Buffer | undefined, filename: string): unknown[] {
  if (!buf) return [];
  try {
    const parsed = JSON.parse(buf.toString('utf-8')) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new ApiError('VALIDATION_ERROR', `${filename} 解析失败，归档可能已损坏`);
  }
}

export function readV19TrackPayloads(files: Map<string, Buffer>): V19TrackPayloads {
  return {
    stageScenes: readArray(files.get('stageScenes.json'), 'stageScenes.json'),
    meetings: readArray(files.get('meetings.json'), 'meetings.json'),
    meetingMessages: readArray(files.get('meetingMessages.json'), 'meetingMessages.json'),
  };
}

/**
 * 恢复 v1.9 负载（须在 events 轨自定义助手恢复之后、同事务内调用）。
 * @returns 各类导入/跳过计数
 */
export function restoreV19TrackData(
  db: DatabaseInstance,
  payloads: V19TrackPayloads,
): V19RestoreCounts {
  const counts: V19RestoreCounts = {
    stageScenes: { imported: 0, skipped: 0 },
    meetings: { imported: 0, skipped: 0 },
    meetingMessages: { imported: 0, skipped: 0 },
  };
  const sceneRepo = createStageSceneRepository(db);
  const meetingRepo = createMeetingRepository(db);
  const assistantExists = db.prepare(`SELECT 1 FROM assistants WHERE id = ?`);

  // 1. 舞台场景（背景图片只备份引用，文件缺失回落默认背景由场景服务兜底）
  for (const raw of payloads.stageScenes) {
    const parsed = sceneRecordSchema.safeParse(raw);
    if (!parsed.success) {
      counts.stageScenes.skipped++;
      continue;
    }
    const record: StageSceneRecord = {
      id: parsed.data.id,
      name: parsed.data.name,
      isBuiltin: parsed.data.isBuiltin ?? false,
      payload: parsed.data.payload,
      createdAt: parsed.data.createdAt,
      updatedAt: parsed.data.updatedAt,
    };
    try {
      if (sceneRepo.findById(record.id)) counts.stageScenes.skipped++;
      else {
        sceneRepo.upsertIgnore(record);
        counts.stageScenes.imported++;
      }
    } catch {
      counts.stageScenes.skipped++;
    }
  }

  // 2. 会议（剔除悬空成员；同 id 已存在跳过，不覆盖本机数据）
  const restoredMeetingIds = new Set<string>();
  for (const raw of payloads.meetings) {
    const parsed = meetingRecordSchema.safeParse(raw);
    if (!parsed.success || meetingRepo.findById(parsed.data.id)) {
      counts.meetings.skipped++;
      continue;
    }
    const memberIds = parsed.data.memberIds.filter(
      (id) => Boolean(assistantExists.get(id)),
    );
    const record: MeetingRecord = { ...parsed.data, memberIds };
    try {
      meetingRepo.upsertMeetingIgnore(record);
      // INSERT OR IGNORE 可能因唯一键静默失败，回读确认是否真正导入
      if (meetingRepo.findById(record.id)) {
        counts.meetings.imported++;
        restoredMeetingIds.add(record.id);
      } else {
        counts.meetings.skipped++;
      }
    } catch {
      counts.meetings.skipped++;
    }
  }

  // 3. 会议转录（只恢复已落库会议的消息；speakerName 快照保留，发言者已删除也不丢）
  for (const raw of payloads.meetingMessages) {
    const parsed = messageRecordSchema.safeParse(raw);
    if (!parsed.success || !restoredMeetingIds.has(parsed.data.meetingId)) {
      counts.meetingMessages.skipped++;
      continue;
    }
    const d = parsed.data;
    const record: MeetingMessageRecord = {
      id: d.id,
      meetingId: d.meetingId,
      seq: d.seq,
      speakerKind: d.speakerKind,
      speakerId: d.speakerId,
      speakerName: d.speakerName,
      content: d.content,
      emotionTag: d.emotionTag,
      truncated: d.truncated ?? false,
      createdAt: d.createdAt,
    };
    try {
      meetingRepo.upsertMessageIgnore(record);
      counts.meetingMessages.imported++;
    } catch {
      counts.meetingMessages.skipped++;
    }
  }

  return counts;
}

/** events 轨进度分子：v1.9 三类负载的导入+跳过总数 */
export function v19TrackTotal(counts: V19RestoreCounts): number {
  return (
    counts.stageScenes.imported + counts.stageScenes.skipped +
    counts.meetings.imported + counts.meetings.skipped +
    counts.meetingMessages.imported + counts.meetingMessages.skipped
  );
}
