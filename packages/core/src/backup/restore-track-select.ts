/**
 * v1.7 恢复轨选择与占位探测（从 restore.ts 抽出守 300 行门禁）。
 * 未显式指定 tracks 时：恢复归档中实际存在且有条目的轨道。
 */
import type { BackupManifest, BackupTrack } from '@wbfm/shared/backup';

export function determineTracks(manifest: BackupManifest, files: ReadonlyMap<string, unknown>): BackupTrack[] {
  const tracks: BackupTrack[] = [];
  if (files.has('conversations.json') && manifest.tracks.conversations.entryCount > 0) tracks.push('conversations');
  if (files.has('knowledge.json') && manifest.tracks.knowledge.knowledgeBaseCount > 0) tracks.push('knowledge');
  if (files.has('settings.json')) tracks.push('settings');
  if (files.has('attachments.json') && manifest.tracks.attachments.entryCount > 0) tracks.push('attachments');
  if (files.has('skills.json') && (manifest.tracks.skills?.entryCount ?? 0) > 0) tracks.push('skills');
  if (files.has('tasks.json') && (manifest.tracks.tasks?.entryCount ?? 0) > 0) tracks.push('tasks');
  if (files.has('emotion.json') && (manifest.tracks.emotion?.entryCount ?? 0) > 0) tracks.push('emotion');
  if (
    files.has('events.json') &&
    ((manifest.tracks.events?.scheduleCount ?? 0) > 0 ||
      (manifest.tracks.events?.usageCount ?? 0) > 0 ||
      (manifest.tracks.events?.assistantCount ?? 0) > 0)
  ) {
    tracks.push('events');
  }
  return tracks;
}

/** settings.json 是否含 [REDACTED] 脱敏占位（precheck 警告用） */
export function hasRedactedPlaceholder(value: unknown): boolean {
  if (value === '[REDACTED]') return true;
  if (value === null || value === undefined || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasRedactedPlaceholder);
  return Object.values(value as Record<string, unknown>).some(hasRedactedPlaceholder);
}
