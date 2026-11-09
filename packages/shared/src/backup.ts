import { z } from 'zod';

/**
 * WorkBuddy 备份归档格式（.wbfm-backup，实际是 tar.gz）。
 * 归档根目录包含 manifest.json（下述 schema） + 四轨道 JSON 文件 + 可选附件二进制。
 *
 * 版本演进：backup_schema_version 单调递增；恢复端按版本探测走迁移适配器链。
 * 当前版本：8（v2.32 tasks 轨加法负载：agentRuns.json 协作运行、agentHandoffs.json
 * 角色交接；manifest.tasks 对应两个 optional 计数；v7 及更早归档缺文件按 0 降级）。
 * v7（v2.6）：memories.json 长期记忆（含来源消息/召回次数）、meetingConclusions.json
 * 会议结论、meetingActionItems.json 行动项。
 * v2.20 阶段计划为 v7 内可选字段（conversations 条目 stagePlan/modelId、助手/卡片 stagePlan），
 * 不升版；旧归档缺字段按 null 恢复。
 * v2.21 分支为 v7 内可选负载（conversations 轨 branches.json + 可选 branchCount），不升版；
 * 旧归档缺文件按空数组，运行中状态恢复为 interrupted。
 * v2.22 分支事件为 v7 内可选负载（branch-events.json + 可选 branchEventCount/branchEventsTruncated），
 * 不升版；旧归档缺文件按 0，恢复后图车道不回填（与 v2.21 行为一致）。
 * v6：relationshipMilestones.json、modInstalls.json、vrmAvatars.json（仅元数据）。
 * v5：stageScenes.json + meetings.json/meetingMessages.json。
 * v1–v4 旧归档仍可恢复，缺文件/缺键按 0 处理。
 */

export const CURRENT_BACKUP_SCHEMA_VERSION = 8 as const;

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
    conversations: z.object({
      files: z.string(),
      entryCount: z.number().int().min(0),
      /** v2.21：分支关联条数（branches.json；v2.20 及更早缺省 0） */
      branchCount: z.number().int().min(0).optional(),
      /** v2.22：分支事件条数（branch-events.json；v2.21 及更早缺省 0） */
      branchEventCount: z.number().int().min(0).optional(),
      /** v2.22：分支事件是否因单分支 200 条上限被截断 */
      branchEventsTruncated: z.boolean().optional(),
    }),
    knowledge: z.object({ files: z.string(), knowledgeBaseCount: z.number().int().min(0), documentCount: z.number().int().min(0) }),
    settings: z.object({ files: z.string() }),
    attachments: z.object({
      files: z.string(),
      entryCount: z.number().int().min(0),
      totalBytes: z.number().int().min(0),
      /** v2.33：引用条数（refs.json；v8 及更早归档缺省 0，恢复后由回填补齐） */
      refCount: z.number().int().min(0).optional(),
    }),
    /** v0.6 新增；旧归档（v0.4/v0.5）无此键，故 optional 保持向前兼容 */
    skills: z.object({ files: z.string(), entryCount: z.number().int().min(0) }).optional(),
    /** v0.7 新增；旧归档无此键，故 optional 保持向前兼容 */
    tasks: z
      .object({
        files: z.string(),
        entryCount: z.number().int().min(0),
        /** v2.32：协作运行条数（agentRuns.json；v7 及更早缺省 0） */
        agentRunCount: z.number().int().min(0).optional(),
        /** v2.32：角色交接条数（agentHandoffs.json；v7 及更早缺省 0） */
        agentHandoffCount: z.number().int().min(0).optional(),
      })
      .optional(),
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

/** v2.33：归档密码长度约束（导出/预检/恢复共用） */
export const backupPasswordSchema = z.string().min(8).max(128);

/** 导出请求体（设置页选择轨道后提交；password 可选，提供即加密归档） */
export const backupExportRequestSchema = z.object({
  tracks: z.array(backupTrackSchema).min(1),
  password: backupPasswordSchema.optional(),
});
export type BackupExportRequest = z.infer<typeof backupExportRequestSchema>;

/** v2.33：导出核对报告的单轨条目（条目数 / 负载字节 / 该轨耗时） */
export const backupExportReportTrackSchema = z.object({
  track: backupTrackSchema,
  entryCount: z.number().int().min(0),
  bytes: z.number().int().min(0),
  elapsedMs: z.number().int().min(0),
});
export type BackupExportReportTrack = z.infer<typeof backupExportReportTrackSchema>;

/** v2.33：导出核对报告（frontend 从响应头读取，只做展示） */
export const backupExportReportSchema = z.object({
  tracks: z.array(backupExportReportTrackSchema),
  /** 最终归档字节数（加密时为容器字节） */
  totalBytes: z.number().int().min(0),
  elapsedMs: z.number().int().min(0),
  encrypted: z.boolean(),
});
export type BackupExportReport = z.infer<typeof backupExportReportSchema>;

/** v2.33：最近一次导出摘要（设置项 backup.lastExport，不含路径与密码） */
export const backupLastExportSchema = z.object({
  at: z.string().datetime(),
  encrypted: z.boolean(),
  totalBytes: z.number().int().min(0),
  trackCount: z.number().int().min(0),
});
export type BackupLastExport = z.infer<typeof backupLastExportSchema>;

/** 每轨计数（声明/写入/跳过共用同一结构，口径见 restore-verification） */
const backupTrackCountsSchema = z.object({
  conversations: z.number().int().min(0),
  knowledge: z.number().int().min(0),
  settings: z.number().int().min(0),
  attachments: z.number().int().min(0),
  skills: z.number().int().min(0),
  tasks: z.number().int().min(0),
  emotion: z.number().int().min(0),
  events: z.number().int().min(0),
});

/** v2.33：恢复核对（manifest 声明 vs 实际写入/跳过 + 附件与引用缺失） */
export const backupVerificationSchema = z.object({
  declared: z.array(
    z.object({ track: backupTrackSchema, entries: z.number().int().min(0) }),
  ),
  written: backupTrackCountsSchema,
  skipped: backupTrackCountsSchema,
  /** manifest 登记但归档内没有二进制文件的附件（按 storagePath 展示） */
  missingAttachments: z.array(z.string()),
  /** 恢复后仍无引用的非产物附件数（只读统计，不阻断恢复） */
  unreferencedAttachments: z.number().int().min(0),
});
export type BackupVerification = z.infer<typeof backupVerificationSchema>;

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
    /** v2.21：分支关联条数（随 conversations 轨；v2.20 及更早为 0） */
    branches: z.number().int().min(0),
    /** v2.22：分支事件条数（随 conversations 轨；v2.21 及更早为 0） */
    branchEvents: z.number().int().min(0),
    /** v2.32：协作运行/交接条数（随 tasks 轨；v7 及更早为 0） */
    agentRuns: z.number().int().min(0),
    agentHandoffs: z.number().int().min(0),
  }),
  warnings: z.array(z.string()),
  /** v2.33：只读核对（预检阶段写入/跳过均为 0，附件缺失已可提示） */
  verification: backupVerificationSchema,
});
export type BackupPrecheck = z.infer<typeof backupPrecheckSchema>;
