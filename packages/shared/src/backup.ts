import { z } from 'zod';

/**
 * WorkBuddy 备份归档格式（.wbfm-backup，实际是 tar.gz）。
 * 归档根目录包含 manifest.json（下述 schema） + 四轨道 JSON 文件 + 可选附件二进制。
 *
 * 版本演进：backup_schema_version 单调递增；恢复端按版本探测走迁移适配器链。
 * 当前版本：7（v2.6 events 轨加法负载：memories.json 长期记忆（含来源消息/召回次数）、
 * meetingConclusions.json 会议结论、meetingActionItems.json 行动项；manifest.events
 * 对应三个 optional 计数；v6 及更早归档缺文件按 0 降级）。
 * v6：relationshipMilestones.json、modInstalls.json、vrmAvatars.json（仅元数据）。
 * v5：stageScenes.json + meetings.json/meetingMessages.json。
 * v1–v4 旧归档仍可恢复，缺文件/缺键按 0 处理。
 */

export const CURRENT_BACKUP_SCHEMA_VERSION = 7 as const;

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
        /** v1.7 M5：自定义短语触发器（同轨加法字段；v3 早期归档缺省 0） */
        triggerCount: z.number().int().min(0).optional(),
        /** v1.8：角色卡条数（负载文件 characterCards.json；v3 归档缺省 0） */
        cardCount: z.number().int().min(0).optional(),
        /** v1.9 M1：舞台场景条数（stageScenes.json；v4 及更早归档缺省 0） */
        stageSceneCount: z.number().int().min(0).optional(),
        /** v1.9 M3：会议与会议消息条数（meetings.json/meetingMessages.json；缺省 0） */
        meetingCount: z.number().int().min(0).optional(),
        meetingMessageCount: z.number().int().min(0).optional(),
        /** v2.0 M2：共同里程碑条数（relationshipMilestones.json；v5 及更早缺省 0） */
        relationshipMilestoneCount: z.number().int().min(0).optional(),
        /** v2.0 M5：mod 包安装记录条数（modInstalls.json；v5 及更早缺省 0） */
        modInstallCount: z.number().int().min(0).optional(),
        /** v2.0 M5：VRM 形象引用条数（vrmAvatars.json，仅元数据不带二进制；缺省 0） */
        vrmAvatarCount: z.number().int().min(0).optional(),
        /** v2.6：长期记忆条数（memories.json；v6 及更早缺省 0） */
        memoryCount: z.number().int().min(0).optional(),
        /** v2.6：会议结论条数（meetingConclusions.json；v6 及更早缺省 0） */
        meetingConclusionCount: z.number().int().min(0).optional(),
        /** v2.6：会议行动项条数（meetingActionItems.json；v6 及更早缺省 0） */
        meetingActionItemCount: z.number().int().min(0).optional(),
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
    /** v1.8：角色卡条数（随 events 轨） */
    cards: z.number().int().min(0),
    /** v1.9：舞台场景/会议/会议消息条数（随 events 轨；v4 及更早归档为 0） */
    stageScenes: z.number().int().min(0),
    meetings: z.number().int().min(0),
    meetingMessages: z.number().int().min(0),
    /** v2.0 M2：共同里程碑条数（随 events 轨；v5 及更早归档为 0） */
    relationshipMilestones: z.number().int().min(0),
    /** v2.0 M5：mod 包安装记录条数（随 events 轨；v5 及更早归档为 0） */
    modInstalls: z.number().int().min(0),
    /** v2.0 M5：VRM 形象引用条数（随 events 轨，仅元数据；v5 及更早归档为 0） */
    vrmAvatars: z.number().int().min(0),
    /** v2.6：长期记忆/会议结论/行动项条数（随 events 轨；v6 及更早为 0） */
    memories: z.number().int().min(0),
    meetingConclusions: z.number().int().min(0),
    meetingActionItems: z.number().int().min(0),
  }),
  warnings: z.array(z.string()),
});
export type BackupPrecheck = z.infer<typeof backupPrecheckSchema>;
