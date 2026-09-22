import { z } from 'zod';

/**
 * WorkBuddy 备份归档格式（.wbfm-backup，实际是 tar.gz）。
 * 归档根目录包含 manifest.json（下述 schema） + 四轨道 JSON 文件 + 可选附件二进制。
 *
 * 版本演进：backup_schema_version 单调递增；恢复端按版本探测走迁移适配器链。
 * 当前版本：1（v0.4 首发）。
 */

export const CURRENT_BACKUP_SCHEMA_VERSION = 1 as const;

export const backupTrackSchema = z.enum([
  'conversations',
  'knowledge',
  'settings',
  'attachments',
]);
export type BackupTrack = z.infer<typeof backupTrackSchema>;

export const backupProgressEventSchema = z.object({
  track: backupTrackSchema,
  processed: z.number().int().min(0),
  total: z.number().int().min(0),
  bytesSoFar: z.number().int().min(0).optional(),
});
export type BackupProgressEvent = z.infer<typeof backupProgressEventSchema>;

export const backupManifestSchema = z.object({
  backupSchemaVersion: z.number().int().positive(),
  appVersion: z.string().describe('源应用 package.json version 字段'),
  createdAt: z.string().datetime(),
  /** 源数据根路径（仅做参考，恢复不依赖） */
  sourceDataRoot: z.string().optional(),
  tracks: z.object({
    conversations: z.object({ files: z.string(), entryCount: z.number().int().min(0) }),
    knowledge: z.object({ files: z.string(), knowledgeBaseCount: z.number().int().min(0), documentCount: z.number().int().min(0) }),
    settings: z.object({ files: z.string() }),
    attachments: z.object({ files: z.string(), entryCount: z.number().int().min(0), totalBytes: z.number().int().min(0) }),
  }),
  /** 归档整体 SHA-256 摘要（可选，快速校验用） */
  archiveSha256: z.string().optional(),
});
export type BackupManifest = z.infer<typeof backupManifestSchema>;

/** 导出请求体（设置页选择轨道后提交） */
export const backupExportRequestSchema = z.object({
  tracks: z.array(backupTrackSchema).min(1),
});
export type BackupExportRequest = z.infer<typeof backupExportRequestSchema>;

/** 恢复预检查结果（先于正式恢复调用，告知将导入多少条目） */
export const backupPrecheckSchema = z.object({
  compatible: z.boolean(),
  sourceVersion: z.string(),
  tracks: z.object({
    conversations: z.number().int().min(0),
    knowledgeBases: z.number().int().min(0),
    documents: z.number().int().min(0),
    attachments: z.number().int().min(0),
  }),
  warnings: z.array(z.string()),
});
export type BackupPrecheck = z.infer<typeof backupPrecheckSchema>;
