/**
 * 备份 events 轨序列化（v1.7 起；v2.0/v2.6 加法负载）：
 * assistants / schedules / usage / triggers / characterCards / stageScenes /
 * meetings / meetingMessages / relationshipMilestones / modInstalls / vrmAvatars /
 * memories / meetingConclusions / meetingActionItems（v2.6）。
 *
 * v2.0 M5 红线：vrmAvatars.json 只含元数据引用（id/name/fileRef/byteLength/meta/
 * createdAt），绝不打包 .vrm 二进制——恢复后引用可能悬空，由 restore 端给 warning
 * 提示用户重新导入 VRM（05 §3.2 / G5）。
 */
import {
  createAssistantRepository,
  createCharacterCardRepository,
  createEventTriggerRepository,
  createEventUsageRepository,
  createMeetingConclusionRepository,
  createMeetingRepository,
  createMemoryRepository,
  createModInstallRepository,
  createRelationshipMilestoneRepository,
  createScheduledTaskRepository,
  createStageSceneRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import type { BackupManifest } from '@wbfm/shared/backup';
import { computeNextRunMs } from '../scheduler/next-run';

type EventsTrackManifest = BackupManifest['tracks']['events'];

interface RawVrmRow {
  id: string;
  name: string;
  file_ref: string;
  byte_length: number;
  meta_json: string;
  created_at: string;
}

/** vrmAvatars 备份条目：元数据引用形态（与 VrmAvatar 同形，不带字节） */
export interface BackupVrmAvatarEntry {
  id: string;
  name: string;
  fileRef: string;
  byteLength: number;
  meta: unknown;
  createdAt: string;
}

export interface EventsTrackPayload {
  files: Record<string, string>;
  manifest: EventsTrackManifest;
  total: number;
}

function readVrmAvatarRefs(db: DatabaseInstance): BackupVrmAvatarEntry[] {
  // vrm_avatars 无独立仓储（v030 起服务直连 SQL）；备份内联只读 SELECT，
  // 不经过 VrmAvatarService（其构造会 mkdir 数据目录）。
  const rows = db
    .prepare(
      `SELECT id, name, file_ref, byte_length, meta_json, created_at
         FROM vrm_avatars ORDER BY created_at DESC`,
    )
    .all() as RawVrmRow[];
  return rows.map((row) => {
    let meta: unknown = {};
    try {
      meta = JSON.parse(row.meta_json || '{}');
    } catch {
      meta = {};
    }
    return {
      id: row.id,
      name: row.name,
      fileRef: row.file_ref,
      byteLength: row.byte_length,
      meta,
      createdAt: row.created_at,
    };
  });
}

export function serializeEventsTrack(db: DatabaseInstance): EventsTrackPayload {
  const assistantsRepo = createAssistantRepository(db);
  const scheduledTaskRepo = createScheduledTaskRepository(db, { computeNextRunMs });
  const usageRepo = createEventUsageRepository(db);
  const triggerRepo = createEventTriggerRepository(db);
  const cardsRepo = createCharacterCardRepository(db);
  const stageScenesRepo = createStageSceneRepository(db);
  const meetingRepo = createMeetingRepository(db);
  const conclusionRepo = createMeetingConclusionRepository(db);
  const memoryRepo = createMemoryRepository(db);
  const milestoneRepo = createRelationshipMilestoneRepository(db);
  const modInstallRepo = createModInstallRepository(db);

  const customAssistants = assistantsRepo.list().filter((assistant) => !assistant.isBuiltin);
  const schedules = scheduledTaskRepo.listAll();
  const usage = usageRepo.listAll({ sinceMs: Date.now() - 90 * 24 * 3600_000 });
  const triggers = triggerRepo.list();
  const cards = cardsRepo.list();
  const stageScenes = stageScenesRepo.list();
  const meetings = meetingRepo.list();
  const meetingMessages = meetings.flatMap((meeting) => meetingRepo.listMessages(meeting.id));
  // v2.6：会议结论/行动项随会议归档；行动项保留回链 id（目标库缺提醒/Flow run 时不阻断）
  const meetingConclusions = meetings
    .map((meeting) => conclusionRepo.getConclusion(meeting.id))
    .filter((item) => item !== null);
  const meetingActionItems = meetings.flatMap((meeting) =>
    conclusionRepo.listActionItems(meeting.id),
  );
  // v2.6：长期记忆含来源消息与召回次数；向量不入档（恢复后按需重新嵌入）
  const memories = memoryRepo.list({ limit: 100_000 });
  const milestones = milestoneRepo.listAll();
  const modInstalls = modInstallRepo.listAll();
  const vrmAvatars = readVrmAvatarRefs(db);

  const files: Record<string, string> = {
    'events.json': JSON.stringify(
      { assistants: customAssistants, schedules, usage, triggers },
      null,
      2,
    ),
    'characterCards.json': JSON.stringify(cards, null, 2),
    'stageScenes.json': JSON.stringify(stageScenes, null, 2),
    'meetings.json': JSON.stringify(meetings, null, 2),
    'meetingMessages.json': JSON.stringify(meetingMessages, null, 2),
    'relationshipMilestones.json': JSON.stringify(milestones, null, 2),
    'modInstalls.json': JSON.stringify(modInstalls, null, 2),
    'vrmAvatars.json': JSON.stringify(vrmAvatars, null, 2),
    'memories.json': JSON.stringify(memories, null, 2),
    'meetingConclusions.json': JSON.stringify(meetingConclusions, null, 2),
    'meetingActionItems.json': JSON.stringify(meetingActionItems, null, 2),
  };

  const manifest: EventsTrackManifest = {
    files: 'events.json',
    scheduleCount: schedules.length,
    usageCount: usage.length,
    assistantCount: customAssistants.length,
    triggerCount: triggers.length,
    cardCount: cards.length,
    stageSceneCount: stageScenes.length,
    meetingCount: meetings.length,
    meetingMessageCount: meetingMessages.length,
    relationshipMilestoneCount: milestones.length,
    modInstallCount: modInstalls.length,
    vrmAvatarCount: vrmAvatars.length,
    memoryCount: memories.length,
    meetingConclusionCount: meetingConclusions.length,
    meetingActionItemCount: meetingActionItems.length,
  };

  const total =
    customAssistants.length +
    schedules.length +
    usage.length +
    triggers.length +
    cards.length +
    stageScenes.length +
    meetings.length +
    meetingMessages.length +
    milestones.length +
    modInstalls.length +
    vrmAvatars.length +
    memories.length +
    meetingConclusions.length +
    meetingActionItems.length;

  return { files, manifest, total };
}
