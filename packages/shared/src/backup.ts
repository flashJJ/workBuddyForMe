import { z } from 'zod';

/**
 * WorkBuddy 备份归档格式（.wbfm-backup，实际是 tar.gz）。
 * 归档根目录包含 manifest.json（下述 schema） + 四轨道 JSON 文件 + 可选附件二进制。
 *
 * 版本演进：backup_schema_version 单调递增；恢复端按版本探测走迁移适配器链。
 * 当前版本：3（v1.7 新增 events 轨：自定义助手机行+角色化提醒+90 天演出流水；
 * v1/v2 旧归档仍可恢复，缺轨按 0 处理）。
 */

export const CURRENT_BACKUP_SCHEMA_VERSION = 3 as const;

export const backupTrackSchema = z.enum([
  'conversations',
  'knowledge',
  'settings',
  'attachments',
  'skills',
  'tasks',
  'emotion',
  'events',
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
    /** v0.6 新增；旧归档（v0.4/v0.5）无此键，故 optional 保持向前兼容 */
    skills: z.object({ files: z.string(), entryCount: z.number().int().min(0) }).optional(),
    /** v0.7 新增；旧归档无此键，故 optional 保持向前兼容 */
    tasks: z.object({ files: z.string(), entryCount: z.number().int().min(0) }).optional(),
    /** v1.6 新增：助手情绪/关系状态；v1 旧归档无此键 */
    emotion: z.object({ files: z.string(), entryCount: z.number().int().min(0) }).optional(),
    /** v1.7 新增：自定义助手+提醒+演出流水；v2 及更早归档无此键 */
    events: z
      .object({
        files: z.string(),
        scheduleCount: z.number().int().min(0),
        usageCount: z.number().int().min(0),
        assistantCount: z.number().int().min(0),
      })
      .optional(),
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
    skills: z.number().int().min(0),
    tasks: z.number().int().min(0),
    emotion: z.number().int().min(0),
    /** v1.7：提醒条数与演出流水条数（自定义助手机行数在恢复日志中体现） */
    schedules: z.number().int().min(0),
    eventUsage: z.number().int().min(0),
  }),
  warnings: z.array(z.string()),
});
export type BackupPrecheck = z.infer<typeof backupPrecheckSchema>;
