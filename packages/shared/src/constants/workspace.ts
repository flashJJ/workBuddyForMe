/**
 * v5.1 文件边界与快照常量（schema、服务与 UI 共用，禁止各自写数字）。
 */

/** 用户可追加的授权根上限（默认根另计） */
export const WORKSPACE_ROOTS_MAX = 8;

/** 单文件内容快照上限：20 MiB */
export const FILE_SNAPSHOT_MAX_BYTES = 20 * 1024 * 1024;

/** 快照库总配额：512 MiB */
export const FILE_SNAPSHOT_QUOTA_BYTES = 512 * 1024 * 1024;

/** 快照保留天数 */
export const FILE_SNAPSHOT_RETENTION_DAYS = 30;

/** 一次回滚最多处理的文件数 */
export const FILE_ROLLBACK_PATHS_MAX = 200;

/** 快照清理批大小 */
export const FILE_SNAPSHOT_CLEANUP_BATCH = 200;

/** 快照设置默认值（设置页与 schema 共用） */
export const FILE_SNAPSHOT_DEFAULTS = {
  enabled: true,
  maxBytes: FILE_SNAPSHOT_MAX_BYTES,
  quotaBytes: FILE_SNAPSHOT_QUOTA_BYTES,
  retentionDays: FILE_SNAPSHOT_RETENTION_DAYS,
} as const;
