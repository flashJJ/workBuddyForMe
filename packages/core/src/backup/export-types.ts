import type { BackupManifest, BackupProgressEvent, BackupTrack } from '@wbfm/shared/backup';

/** 归档最大 500MB（保护用户磁盘，超限在导出前就拒绝） */
export const BACKUP_MAX_ARCHIVE_BYTES = 500 * 1024 * 1024;

export interface BackupExportOptions {
  tracks: BackupTrack[];
  /** v2.33：可选口令；提供后输出 WBFM-ENC1 加密容器（内层仍是 v8 tar.gz） */
  password?: string;
  /** 归档落盘路径（不传则返回 Buffer） */
  outputPath?: string;
  /** 外部进度回调（不传则静默） */
  onProgress?: (ev: BackupProgressEvent) => void;
}

export interface BackupExportResult {
  archive: Buffer;
  manifest: BackupManifest;
  /** 归档字节数（加密时为容器字节） */
  size: number;
  /** v2.33：本次导出是否加密 */
  encrypted: boolean;
}

/** v2.22：恢复计数字段（导入/跳过按轨统计；类型放共享模块避免主流程超行数） */
export type BackupCountKey = 'conversations' | 'messages' | 'branches' | 'branchEvents' | 'knowledgeBases' | 'documents' | 'chunks' | 'settings' | 'attachments' | 'attachmentRefs' | 'skills' | 'tasks' | 'emotion' | 'events' | 'cards' | 'agentRuns' | 'agentHandoffs';
export const emptyCounts = (): Record<BackupCountKey, number> => ({ conversations: 0, messages: 0, branches: 0, branchEvents: 0, knowledgeBases: 0, documents: 0, chunks: 0, settings: 0, attachments: 0, attachmentRefs: 0, skills: 0, tasks: 0, emotion: 0, events: 0, cards: 0, agentRuns: 0, agentHandoffs: 0 });

export interface BackupRestoreResult {
  manifest: BackupManifest;
  imported: Record<BackupCountKey, number>;
  skipped: Record<BackupCountKey, number>;
  /** 非致命提醒（如 VRM 模型文件需重新导入） */
  warnings: string[];
}
