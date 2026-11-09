/** @域 barrel 备份与恢复（v1.1 M2 域子路径化） */
export {
  exportBackup,
  sanitizeSettings,
  BACKUP_MAX_ARCHIVE_BYTES,
  type BackupExportOptions,
  type BackupExportResult,
} from './export';
export {
  restoreBackup,
  precheckBackup,
  type BackupRestoreOptions,
  type BackupRestoreResult,
} from './restore';
export { packEntries, packTarGz, type TarPayloadEntry } from './export-archive';
export {
  exportArtifactsBatch,
  ARTIFACT_BATCH_MAX_BYTES,
  ARTIFACT_BATCH_MAX_COUNT,
  type ArtifactBatchManifest,
  type ArtifactBatchResult,
} from './export-artifacts';
