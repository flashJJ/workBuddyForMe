import type { BackupPrecheck, BackupTrack } from '@wbfm/shared/backup';
import type { BackupRestoreResult } from '@wbfm/core/backup';
import type { MessageKey, MessageVars } from '@wbfm/shared/i18n';

type Translate = (key: MessageKey, vars?: MessageVars) => string;

/** 单轨在预检结果中的可恢复条目数（用于展示与默认勾选） */
export function trackCount(precheck: BackupPrecheck, track: BackupTrack): number {
  const c = precheck.tracks;
  switch (track) {
    case 'conversations':
      return c.conversations + c.branches + c.branchEvents;
    case 'knowledge':
      return c.knowledgeBases + c.documents;
    case 'settings':
      return 1;
    case 'attachments':
      return c.attachments;
    case 'skills':
      return c.skills;
    case 'tasks':
      return c.tasks + c.agentRuns + c.agentHandoffs;
    case 'emotion':
      return c.emotion;
    case 'events':
      return (
        c.schedules +
        c.eventUsage +
        c.cards +
        c.stageScenes +
        c.meetings +
        c.meetingMessages +
        c.relationshipMilestones +
        c.modInstalls +
        c.vrmAvatars +
        c.memories +
        c.meetingConclusions +
        c.meetingActionItems
      );
    default:
      return 0;
  }
}

/** 默认勾选：有数据的轨道 + settings（无计数但恢复为 upsert） */
export function defaultRestoreTracks(precheck: BackupPrecheck): BackupTrack[] {
  return (['conversations', 'knowledge', 'settings', 'attachments', 'skills', 'tasks', 'emotion', 'events'] as BackupTrack[])
    .filter((track) => track === 'settings' || trackCount(precheck, track) > 0);
}

interface CountRow {
  label: MessageKey;
  count: number;
}

/** 预检面板中的分项计数（只展示非零项） */
export function precheckCountRows(precheck: BackupPrecheck): CountRow[] {
  const c = precheck.tracks;
  const rows: CountRow[] = [
    { label: 'settingsBackup.imported.conversations', count: c.conversations },
    { label: 'settingsBackup.imported.documents', count: c.documents },
    { label: 'settingsBackup.imported.attachments', count: c.attachments },
    { label: 'settingsBackup.imported.skills', count: c.skills },
    { label: 'settingsBackup.imported.tasks', count: c.tasks },
    { label: 'settingsBackup.imported.emotion', count: c.emotion },
    { label: 'settingsBackup.imported.events', count: c.schedules },
    { label: 'settingsBackup.imported.branches', count: c.branches },
    { label: 'settingsBackup.imported.agentRuns', count: c.agentRuns },
    { label: 'settingsBackup.imported.agentHandoffs', count: c.agentHandoffs },
  ];
  return rows.filter((row) => row.count > 0);
}

/** 恢复完成提示（导入项 + 跳过项拼接） */
export function summarizeRestore(result: BackupRestoreResult, t: Translate): string {
  const parts: string[] = [];
  const add = (key: MessageKey, count: number) => {
    if (count > 0) parts.push(t(key, { count }));
  };
  add('settingsBackup.imported.conversations', result.imported.conversations);
  add('settingsBackup.imported.messages', result.imported.messages);
  add('settingsBackup.imported.knowledgeBases', result.imported.knowledgeBases);
  add('settingsBackup.imported.documents', result.imported.documents);
  if (result.imported.settings) parts.push(t('settingsBackup.imported.settings'));
  add('settingsBackup.imported.attachments', result.imported.attachments);
  add('settingsBackup.imported.skills', result.imported.skills);
  add('settingsBackup.imported.tasks', result.imported.tasks);
  add('settingsBackup.imported.emotion', result.imported.emotion);
  add('settingsBackup.imported.events', result.imported.events);
  add('settingsBackup.imported.branches', result.imported.branches);
  add('settingsBackup.imported.branchEvents', result.imported.branchEvents);
  add('settingsBackup.imported.agentRuns', result.imported.agentRuns);
  add('settingsBackup.imported.agentHandoffs', result.imported.agentHandoffs);

  const skipped: string[] = [];
  const addSkipped = (key: MessageKey, count: number) => {
    if (count > 0) skipped.push(t(key, { count }));
  };
  addSkipped('settingsBackup.skipped.conversations', result.skipped.conversations);
  addSkipped('settingsBackup.skipped.documents', result.skipped.documents);
  addSkipped('settingsBackup.skipped.skills', result.skipped.skills);
  addSkipped('settingsBackup.skipped.tasks', result.skipped.tasks);
  addSkipped('settingsBackup.skipped.emotion', result.skipped.emotion);
  addSkipped('settingsBackup.skipped.events', result.skipped.events);
  addSkipped('settingsBackup.skipped.branches', result.skipped.branches);
  addSkipped('settingsBackup.skipped.branchEvents', result.skipped.branchEvents);
  addSkipped('settingsBackup.skipped.agentRuns', result.skipped.agentRuns);
  addSkipped('settingsBackup.skipped.agentHandoffs', result.skipped.agentHandoffs);

  let message = t('settingsBackup.restoreDone', {
    items: parts.join('、') || t('common.words.none'),
  });
  if (skipped.length) message += t('settingsBackup.restoreSkipped', { items: skipped.join('、') });
  return message;
}

/** v2.34：多选归档的预检条目（file 与只读预检结果成对保存） */
export interface ArchivePrecheckEntry {
  file: File;
  precheck: BackupPrecheck;
}

/** 按链序号排序（同序号保持原顺序） */
export function sortArchiveEntries(entries: ArchivePrecheckEntry[]): ArchivePrecheckEntry[] {
  return [...entries].sort(
    (a, b) => a.precheck.chain.sequence - b.precheck.chain.sequence,
  );
}

/** 链连续性校验：返回 i18n 错误 key，null 表示通过 */
export function validateArchiveChain(entries: ArchivePrecheckEntry[]): MessageKey | null {
  if (entries.length <= 1) return null;
  const sorted = sortArchiveEntries(entries);
  if (new Set(sorted.map((item) => item.precheck.chain.chainId)).size !== 1) {
    return 'settingsBackup.chain.mismatch';
  }
  const base = sorted[0]!.precheck.chain;
  if (base.kind !== 'full' || base.sequence !== 0) return 'settingsBackup.chain.incomplete';
  if (sorted.filter((item) => item.precheck.chain.kind === 'full').length !== 1) {
    return 'settingsBackup.chain.mismatch';
  }
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]!.precheck.chain;
    const current = sorted[i]!.precheck.chain;
    if (current.sequence !== prev.sequence + 1 || current.parentArchiveId !== prev.archiveId) {
      return 'settingsBackup.chain.mismatch';
    }
  }
  return null;
}

/** 多段都必须兼容当前版本 */
export function archiveChainCompatible(entries: ArchivePrecheckEntry[]): boolean {
  return entries.length > 0 && entries.every((item) => item.precheck.compatible);
}

/** v2.34：备份历史与摘要共用的字节格式化 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
