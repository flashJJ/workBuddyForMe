/**
 * 备份恢复预检查（从 restore.ts 抽离）：读归档清单、判兼容性、汇总各轨条数与
 * 非致命提醒。不写库。
 */
import {
  CURRENT_BACKUP_SCHEMA_VERSION,
  backupPrecheckSchema,
  type BackupManifest,
  type BackupPrecheck,
} from '@wbfm/shared/backup';
import { extractArchive } from './restore-archive';
import { hasRedactedPlaceholder } from './restore-track-select';

/**
 * 预检查：先于正式恢复调用，告知兼容性与将导入多少条目。
 * 版本不兼容时 compatible=false；settings 有 [REDACTED] 值或备份含 VRM 引用时给 warnings。
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

  // v2.0 M5：VRM 备份只带元数据引用，模型文件从不入档——预检阶段即明示
  const vrmRefCount = manifest.tracks.events?.vrmAvatarCount ?? 0;
  if (vrmRefCount > 0) {
    warnings.push(
      `备份含 ${vrmRefCount} 个 VRM 形象引用；出于版权与体积红线，.vrm 模型文件不随备份携带，恢复后需重新导入对应模型文件`,
    );
  }

  const m: BackupManifest = manifest;
  return backupPrecheckSchema.parse({
    compatible: m.backupSchemaVersion <= CURRENT_BACKUP_SCHEMA_VERSION,
    sourceVersion: m.appVersion,
    tracks: {
      conversations: m.tracks.conversations.entryCount,
      knowledgeBases: m.tracks.knowledge.knowledgeBaseCount,
      documents: m.tracks.knowledge.documentCount,
      attachments: m.tracks.attachments.entryCount,
      skills: m.tracks.skills?.entryCount ?? 0,
      tasks: m.tracks.tasks?.entryCount ?? 0,
      emotion: m.tracks.emotion?.entryCount ?? 0,
      schedules: m.tracks.events?.scheduleCount ?? 0,
      eventUsage: m.tracks.events?.usageCount ?? 0,
      cards: m.tracks.events?.cardCount ?? 0,
      stageScenes: m.tracks.events?.stageSceneCount ?? 0,
      meetings: m.tracks.events?.meetingCount ?? 0,
      meetingMessages: m.tracks.events?.meetingMessageCount ?? 0,
      relationshipMilestones: m.tracks.events?.relationshipMilestoneCount ?? 0,
      modInstalls: m.tracks.events?.modInstallCount ?? 0,
      vrmAvatars: m.tracks.events?.vrmAvatarCount ?? 0,
      memories: m.tracks.events?.memoryCount ?? 0,
      meetingConclusions: m.tracks.events?.meetingConclusionCount ?? 0,
      meetingActionItems: m.tracks.events?.meetingActionItemCount ?? 0,
    },
    warnings,
  });
}
