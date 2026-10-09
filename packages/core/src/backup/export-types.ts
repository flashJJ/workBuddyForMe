import type { BackupManifest, BackupProgressEvent, BackupTrack } from '@wbfm/shared/backup';

/** 归档最大 500MB（保护用户磁盘，超限在导出前就拒绝） */
export const BACKUP_MAX_ARCHIVE_BYTES = 500 * 1024 * 1024;

export interface BackupExportOptions {
  tracks: BackupTrack[];
  /** 归档落盘路径（不传则返回 Buffer） */
  outputPath?: string;
  /** 外部进度回调（不传则静默） */
  onProgress?: (ev: BackupProgressEvent) => void;
}

export interface BackupExportResult {
  archive: Buffer;
  manifest: BackupManifest;
  /** 归档字节数 */
  size: number;
}
