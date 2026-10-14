import fs from 'node:fs';
import path from 'node:path';
import {
  CURRENT_BACKUP_SCHEMA_VERSION,
  backupPrecheckSchema,
  type BackupManifest,
  type BackupPrecheck,
  type BackupTrack,
  type BackupProgressEvent,
} from '@wbfm/shared/backup';
import type { ServiceDeps } from '../services/deps';
import { getDataRoot } from '@wbfm/config';
import { ApiError } from '@wbfm/shared/errors';
import { restoreSettings, restoreKnowledge, restoreConversations, restoreAttachmentsMeta, restoreSkillsState, restoreTasks, type SkillStateEntry, type TaskTrackEntry } from './restore-ops';
import { restoreEmotionStates, readEmotionTrackPayload } from './restore-emotion';
import { restoreEventsTrack, readEventsTrackPayload } from './restore-events';
import { readV19TrackPayloads, restoreV19TrackData, v19TrackTotal } from './restore-meetings';
import {
  nullifyDanglingCardRefs,
  readCardsTrackPayload,
  restoreCharacterCards,
} from './restore-cards';
import { determineTracks, hasRedactedPlaceholder } from './restore-track-select';
import { extractArchive, extractArchiveFull } from './restore-archive';
import { createScheduledTaskRepository } from '@wbfm/database';
import { computeNextRunMs } from '../scheduler/next-run';
import { ensureSeedData, migrateLegacySystemPrompts } from '../services/seed';

export interface BackupRestoreOptions {
  /** 指定恢复轨道；不传则恢复 manifest 中有数据的全部轨道 */
  tracks?: BackupTrack[];
  /** 外部进度回调 */
  onProgress?: (ev: BackupProgressEvent) => void;
}

export interface BackupRestoreResult {
  manifest: BackupManifest;
  imported: { conversations: number; messages: number; knowledgeBases: number; documents: number; chunks: number; settings: number; attachments: number; skills: number; tasks: number; emotion: number; events: number; cards: number };
  skipped: { conversations: number; knowledgeBases: number; documents: number; attachments: number; skills: number; tasks: number; emotion: number; events: number; cards: number };
}

/** 技能轨归档负载：skills_state 行 + 各技能文件夹的 skill.json 原文 */
interface SkillsTrackPayload {
  states?: SkillStateEntry[];
  skills?: Array<{ name: string; skillJson: string }>;
}

/**
 * 预检查：先于正式恢复调用，告知兼容性与将导入多少条目。
 * 版本不兼容时 compatible=false；settings 有 [REDACTED] 值时 warnings 提示敏感字段需重填。
 */
export async function precheckBackup(archiveBuffer: Buffer): Promise<BackupPrecheck> {
  const { manifest, files } = await extractArchive(archiveBuffer);
  const warnings: string[] = [];

  if (manifest.backupSchemaVersion > CURRENT_BACKUP_SCHEMA_VERSION) {
    warnings.push(`备份 schema 版本 ${manifest.backupSchemaVersion} 高于当前支持的 ${CURRENT_BACKUP_SCHEMA_VERSION}，请升级应用后再恢复`);
  }

  if (files.has('settings.json')) {
    try {
      const parsed = JSON.parse(files.get('settings.json')!.toString('utf-8'));
      if (hasRedactedPlaceholder(parsed)) warnings.push('检测到敏感字段已被脱敏（[REDACTED]），恢复后需手动重新填写凭证');
    } catch { /* settings 可能为空 */ }
  }

  return backupPrecheckSchema.parse({
    compatible: manifest.backupSchemaVersion <= CURRENT_BACKUP_SCHEMA_VERSION,
    sourceVersion: manifest.appVersion,
    tracks: {
      conversations: manifest.tracks.conversations.entryCount,
      knowledgeBases: manifest.tracks.knowledge.knowledgeBaseCount,
      documents: manifest.tracks.knowledge.documentCount,
      attachments: manifest.tracks.attachments.entryCount,
      skills: manifest.tracks.skills?.entryCount ?? 0,
      tasks: manifest.tracks.tasks?.entryCount ?? 0,
      emotion: manifest.tracks.emotion?.entryCount ?? 0,
      schedules: manifest.tracks.events?.scheduleCount ?? 0,
      eventUsage: manifest.tracks.events?.usageCount ?? 0,
      cards: manifest.tracks.events?.cardCount ?? 0,
      stageScenes: manifest.tracks.events?.stageSceneCount ?? 0,
      meetings: manifest.tracks.events?.meetingCount ?? 0,
      meetingMessages: manifest.tracks.events?.meetingMessageCount ?? 0,
    },
    warnings,
  });
}

/** 正式恢复：事务包裹 DB 写入，附件二进制在事务外落盘 */
export async function restoreBackup(
  deps: ServiceDeps,
  archiveBuffer: Buffer,
  options: BackupRestoreOptions = {},
): Promise<BackupRestoreResult> {
  const { manifest, files, binaries } = await extractArchiveFull(archiveBuffer);

  if (manifest.backupSchemaVersion > CURRENT_BACKUP_SCHEMA_VERSION) {
    throw new ApiError('VALIDATION_ERROR', `备份 schema 版本 ${manifest.backupSchemaVersion} 高于当前支持的 ${CURRENT_BACKUP_SCHEMA_VERSION}，请升级应用后再恢复`);
  }

  // 恢复前先确保目标库有内置助手（conversations 依赖 assistants 的 FK）
  ensureSeedData(deps.db);

  const { tracks, onProgress } = options;
  const tracksToRestore = tracks ?? determineTracks(manifest, files);

  // 技能轨负载在事务外解析一次：状态行进事务，文件夹落盘在事务后
  let skillsPayload: SkillsTrackPayload | null = null;
  if (tracksToRestore.includes('skills') && files.has('skills.json')) {
    try {
      skillsPayload = JSON.parse(files.get('skills.json')!.toString('utf-8')) as SkillsTrackPayload;
    } catch {
      throw new ApiError('VALIDATION_ERROR', 'skills.json 解析失败，归档可能已损坏');
    }
  }

  // v1.8：角色卡负载（随 events 轨；v3 旧档无此文件视为空）
  let cardRows: unknown[] = [];
  if (tracksToRestore.includes('events') && files.has('characterCards.json')) {
    cardRows = readCardsTrackPayload(files.get('characterCards.json')!);
  }

  // v1.9：舞台场景 + 多助手会议/转录（同 events 轨；缺文件视为空，v4 及更早归档兼容）
  const v19Payloads = tracksToRestore.includes('events')
    ? readV19TrackPayloads(files)
    : null;

  // --- 事务内：DB 写入 ---
  const txResult = deps.db.transaction(() => {
    const result: Omit<BackupRestoreResult, 'manifest'> = {
      imported: { conversations: 0, messages: 0, knowledgeBases: 0, documents: 0, chunks: 0, settings: 0, attachments: 0, skills: 0, tasks: 0, emotion: 0, events: 0, cards: 0 },
      skipped: { conversations: 0, knowledgeBases: 0, documents: 0, attachments: 0, skills: 0, tasks: 0, emotion: 0, events: 0, cards: 0 },
    };

    // v1.8：卡先于助手机行恢复，使 card_id 引用恢复后即对上
    if (cardRows.length > 0) {
      const cardCounts = restoreCharacterCards(deps.db, cardRows);
      result.imported.cards = cardCounts.imported;
      result.skipped.cards = cardCounts.skipped;
    }

    if (tracksToRestore.includes('settings') && files.has('settings.json')) {
      restoreSettings(deps.db, files.get('settings.json')!);
      result.imported.settings = 1;
      onProgress?.({ track: 'settings', processed: 1, total: 1 });
    }

    if (tracksToRestore.includes('knowledge') && files.has('knowledge.json')) {
      const { kb, doc, chunk } = restoreKnowledge(deps.db, files.get('knowledge.json')!);
      result.imported.knowledgeBases = kb.imported; result.skipped.knowledgeBases = kb.skipped;
      result.imported.documents = doc.imported; result.skipped.documents = doc.skipped;
      result.imported.chunks = chunk;
      onProgress?.({ track: 'knowledge', processed: kb.imported + doc.imported, total: manifest.tracks.knowledge.knowledgeBaseCount + manifest.tracks.knowledge.documentCount });
    }

    if (tracksToRestore.includes('conversations') && files.has('conversations.json')) {
      const { convs, msgs } = restoreConversations(deps.db, files.get('conversations.json')!);
      result.imported.conversations = convs.imported; result.skipped.conversations = convs.skipped;
      result.imported.messages = msgs;
      onProgress?.({ track: 'conversations', processed: convs.imported, total: manifest.tracks.conversations.entryCount });
    }

    if (tracksToRestore.includes('attachments') && files.has('attachments.json')) {
      const { imported, skipped } = restoreAttachmentsMeta(deps.db, files.get('attachments.json')!);
      result.imported.attachments = imported; result.skipped.attachments = skipped;
      onProgress?.({ track: 'attachments', processed: imported, total: manifest.tracks.attachments.entryCount });
    }

    if (tracksToRestore.includes('skills') && skillsPayload?.states?.length) {
      // 启停偏好按 name upsert（含内置技能）；计数不入 result，imported.skills 以文件夹落盘数为准
      restoreSkillsState(deps.db, skillsPayload.states);
    }

    if (tracksToRestore.includes('tasks') && files.has('tasks.json')) {
      let taskPayload: TaskTrackEntry[];
      try {
        taskPayload = JSON.parse(files.get('tasks.json')!.toString('utf-8')) as TaskTrackEntry[];
      } catch {
        throw new ApiError('VALIDATION_ERROR', 'tasks.json 解析失败，归档可能已损坏');
      }
      const { imported, skipped } = restoreTasks(deps.db, taskPayload);
      result.imported.tasks = imported;
      result.skipped.tasks = skipped;
      onProgress?.({ track: 'tasks', processed: imported + skipped, total: manifest.tracks.tasks?.entryCount ?? taskPayload.length });
    }

    if (tracksToRestore.includes('emotion') && files.has('emotion.json')) {
      const emotionPayload = readEmotionTrackPayload(files.get('emotion.json')!);
      const { imported, skipped } = restoreEmotionStates(deps.db, emotionPayload);
      result.imported.emotion = imported;
      result.skipped.emotion = skipped;
      onProgress?.({ track: 'emotion', processed: imported + skipped, total: manifest.tracks.emotion?.entryCount ?? emotionPayload.length });
    }

    if (tracksToRestore.includes('events') && files.has('events.json')) {
      // 顺序：自定义助手 → 提醒 → 流水 → 触发器（后三类外键依赖助手；全部 INSERT OR IGNORE）
      const eventsPayload = readEventsTrackPayload(files.get('events.json')!);
      const counts = restoreEventsTrack(deps.db, eventsPayload);
      // 用户可见计数：提醒 + 自定义触发器（助手/流水为附属数据，不单列）
      result.imported.events = counts.schedules.imported + counts.triggers.imported;
      result.skipped.events = counts.schedules.skipped + counts.triggers.skipped;
      // v1.8：助手机行恢复后清理悬挂 card_id（卡未随档恢复/旧档残缺 → 回落默认卡）
      nullifyDanglingCardRefs(deps.db);
      // v1.9：舞台场景/会议/转录（助手行已落库，悬空成员在恢复函数内剔除）
      const v19Counts = v19Payloads ? restoreV19TrackData(deps.db, v19Payloads) : null;
      const eventsTotal =
        counts.assistants.imported + counts.assistants.skipped +
        counts.schedules.imported + counts.schedules.skipped +
        counts.usage.imported + counts.usage.skipped +
        counts.triggers.imported + counts.triggers.skipped +
        result.imported.cards + result.skipped.cards +
        (v19Counts ? v19TrackTotal(v19Counts) : 0);
      onProgress?.({
        track: 'events',
        processed: eventsTotal,
        total:
          (manifest.tracks.events?.assistantCount ?? 0) +
          (manifest.tracks.events?.scheduleCount ?? 0) +
          (manifest.tracks.events?.usageCount ?? 0) +
          (manifest.tracks.events?.triggerCount ?? 0) +
          (manifest.tracks.events?.cardCount ?? 0) +
          (manifest.tracks.events?.stageSceneCount ?? 0) +
          (manifest.tracks.events?.meetingCount ?? 0) +
          (manifest.tracks.events?.meetingMessageCount ?? 0),
      });
    }

    return result;
  }).immediate();

  // v1.8：旧档（无 card_id 的助手行）恢复后补跑提示词迁移；已选卡助手天然跳过
  migrateLegacySystemPrompts(deps.db, { force: true });

  // --- 事务外：附件二进制落盘 ---
  if (tracksToRestore.includes('attachments') && binaries.length > 0) {
    const attDir = path.join(getDataRoot(), 'attachments');
    fs.mkdirSync(attDir, { recursive: true });
    for (const bin of binaries) {
      const destPath = path.join(attDir, bin.name.replace(/^attachments\//, ''));
      fs.writeFileSync(destPath, bin.data);
    }
  }

  // --- 事务外：技能文件夹 skill.json 落盘（同名文件夹已存在则保留本机版本） ---
  if (tracksToRestore.includes('skills') && skillsPayload?.skills?.length) {
    const skillsDir = path.join(getDataRoot(), 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    const total = manifest.tracks.skills?.entryCount ?? skillsPayload.skills.length;
    for (const sk of skillsPayload.skills) {
      const folder = path.join(skillsDir, sk.name);
      if (fs.existsSync(folder)) {
        // 不覆盖：避免备份旧版本回滚用户对技能的修改
        txResult.skipped.skills++;
      } else {
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(path.join(folder, 'skill.json'), sk.skillJson);
        txResult.imported.skills++;
      }
      onProgress?.({ track: 'skills', processed: txResult.imported.skills + txResult.skipped.skills, total });
    }
  }

  // --- 事务外：events 轨恢复后统一重排启用提醒（防备份时刻过期/未来漂移） ---
  if (tracksToRestore.includes('events') && files.has('events.json')) {
    try {
      createScheduledTaskRepository(deps.db, { computeNextRunMs }).recomputeEnabled();
    } catch (error) {
      // 重排失败不判定恢复失败：提醒行已入库，下条编辑/tick 会自然纠偏
      console.warn('[backup] 提醒时刻重排失败', error);
    }
  }

  return { manifest, ...txResult };
}
