import type { MessageKey } from '@wbfm/shared/i18n';
import type { BackupTrack } from '@wbfm/shared/backup';

/** 轨道展示元数据（键名 → 标签/描述 i18n key） */
export const BACKUP_TRACK_KEYS: Record<BackupTrack, { label: MessageKey; desc: MessageKey }> = {
  conversations: {
    label: 'settingsBackup.tracks.conversationsLabel',
    desc: 'settingsBackup.tracks.conversationsDesc',
  },
  knowledge: {
    label: 'settingsBackup.tracks.knowledgeLabel',
    desc: 'settingsBackup.tracks.knowledgeDesc',
  },
  settings: {
    label: 'settingsBackup.tracks.settingsLabel',
    desc: 'settingsBackup.tracks.settingsDesc',
  },
  attachments: {
    label: 'settingsBackup.tracks.attachmentsLabel',
    desc: 'settingsBackup.tracks.attachmentsDesc',
  },
  skills: {
    label: 'settingsBackup.tracks.skillsLabel',
    desc: 'settingsBackup.tracks.skillsDesc',
  },
  tasks: {
    label: 'settingsBackup.tracks.tasksLabel',
    desc: 'settingsBackup.tracks.tasksDesc',
  },
  emotion: {
    label: 'settingsBackup.tracks.emotionLabel',
    desc: 'settingsBackup.tracks.emotionDesc',
  },
};

/** UI 展示/默认勾选顺序 */
export const BACKUP_TRACK_ORDER: BackupTrack[] = [
  'conversations',
  'knowledge',
  'settings',
  'attachments',
  'skills',
  'tasks',
  'emotion',
];
