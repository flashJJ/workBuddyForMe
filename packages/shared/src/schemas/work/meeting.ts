import { z } from 'zod';
import { DEFAULT_SCHEDULE_TIMEZONE } from './scheduled-task';

/**
 * v1.9 M3 会议模式契约（docs/plan/v1.9/03-会议防串角协议.md）。
 * 会议是新会话、新表、新调度，与 v1.4 协作严格分账：
 * 成员为 2–4 个配置过模型的真实助手；首期不带工具/知识库/MCP/桌面；
 * 任何发言必须由用户议题或 @ 触发；auto 接龙 ≤8 轮。
 */

export const MEETING_MODES = ['manual', 'all', 'auto'] as const;
export type MeetingMode = (typeof MEETING_MODES)[number];

export const MEETING_STATUSES = ['active', 'finished', 'aborted'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const MEETING_SPEAKER_KINDS = ['user', 'assistant'] as const;
export type MeetingSpeakerKind = (typeof MEETING_SPEAKER_KINDS)[number];

/** 成本/跑偏硬限制（协议 §5） */
export const MEETING_LIMITS = {
  MEMBERS_MIN: 2,
  MEMBERS_MAX: 4,
  TOPIC_MAX: 200,
  /** auto 接龙硬上限轮次 */
  AUTO_ROUNDS_MAX: 8,
  /** 转录窗口（近 N 条进 system 段） */
  TRANSCRIPT_WINDOW: 20,
  /** 单条发言展示/口播上限（超长服务端截断） */
  SPEECH_MAX: 200,
  /** 用户单轮输入上限 */
  TURN_CONTENT_MAX: 2000,
  /** auto 建议 JSON 标记块长度上限（防灌水） */
  AUTO_MARKER_MAX: 200,
} as const;

const memberIdSchema = z.string().trim().min(1).max(80);

/** POST /api/meetings 入参 */
export const meetingCreateSchema = z.object({
  topic: z.string().trim().min(1).max(MEETING_LIMITS.TOPIC_MAX),
  memberIds: z
    .array(memberIdSchema)
    .min(MEETING_LIMITS.MEMBERS_MIN, '至少选择 2 位成员')
    .max(MEETING_LIMITS.MEMBERS_MAX, '最多 4 位成员')
    .refine((ids) => new Set(ids).size === ids.length, '成员不能重复'),
  mode: z.enum(MEETING_MODES).default('manual'),
  /** 全会议共用一份模型配置（models.id）；null=系统默认对话模型 */
  modelId: z.string().trim().max(80).nullable().optional(),
});
export type MeetingCreateInput = z.infer<typeof meetingCreateSchema>;

/**
 * POST /api/meetings/:id/turns 入参（用户发言/调度动作）。
 * 下一位发言者永远由服务端按 mode 决定：
 * manual 从 content 的 @成员名 解析；all 成员逐轮；auto 模型建议经服务端校验。
 */
export const meetingTurnSchema = z.object({
  content: z.string().trim().min(1).max(MEETING_LIMITS.TURN_CONTENT_MAX),
});
export type MeetingTurnInput = z.infer<typeof meetingTurnSchema>;

/** 模式切换（仅 active 会议；auto 超限会被服务端自动收回 manual） */
export const meetingModeUpdateSchema = z.object({
  mode: z.enum(MEETING_MODES),
});
export type MeetingModeUpdateInput = z.infer<typeof meetingModeUpdateSchema>;

// ---------------------------------------------------------------------------
// v2.6 会议结论 / 行动项
// ---------------------------------------------------------------------------

export const MEETING_ACTION_ITEM_STATUSES = ['open', 'done', 'cancelled'] as const;
export type MeetingActionItemStatus = (typeof MEETING_ACTION_ITEM_STATUSES)[number];

export const MEETING_ACTION_ITEM_SOURCES = ['generated', 'manual'] as const;
export type MeetingActionItemSource = (typeof MEETING_ACTION_ITEM_SOURCES)[number];

export const MEETING_CONCLUSION_LIMITS = {
  SUMMARY_MAX: 2000,
  DECISIONS_MAX: 20,
  OPEN_QUESTIONS_MAX: 20,
  ACTION_ITEMS_MAX: 30,
  ACTION_ITEM_CONTENT_MAX: 500,
  OWNER_LABEL_MAX: 80,
} as const;

const conclusionTextSchema = z.string().trim().min(1).max(MEETING_CONCLUSION_LIMITS.SUMMARY_MAX);
const conclusionItemSchema = z.string().trim().min(1).max(MEETING_CONCLUSION_LIMITS.SUMMARY_MAX);
const conclusionListSchema = z
  .array(conclusionItemSchema)
  .max(MEETING_CONCLUSION_LIMITS.DECISIONS_MAX)
  .default([]);
const conclusionUpdateListSchema = z
  .array(conclusionItemSchema)
  .max(MEETING_CONCLUSION_LIMITS.DECISIONS_MAX);

/** 模型结构化输出（必须通过此 schema 才落库；失败不伪造结论） */
export const meetingConclusionDraftSchema = z.object({
  summary: conclusionTextSchema,
  decisions: conclusionListSchema,
  openQuestions: z
    .array(z.string().trim().min(1).max(MEETING_CONCLUSION_LIMITS.SUMMARY_MAX))
    .max(MEETING_CONCLUSION_LIMITS.OPEN_QUESTIONS_MAX)
    .default([]),
  actionItems: z
    .array(
      z.object({
        content: z
          .string()
          .trim()
          .min(1)
          .max(MEETING_CONCLUSION_LIMITS.ACTION_ITEM_CONTENT_MAX),
        ownerLabel: z.string().trim().max(MEETING_CONCLUSION_LIMITS.OWNER_LABEL_MAX).default(''),
        ownerMemberId: z.string().trim().min(1).max(80).nullable().default(null),
        dueAt: z.string().datetime({ offset: true }).nullable().default(null),
      }),
    )
    .max(MEETING_CONCLUSION_LIMITS.ACTION_ITEMS_MAX)
    .default([]),
});
export type MeetingConclusionDraft = z.infer<typeof meetingConclusionDraftSchema>;

/** PATCH /api/meetings/:id/conclusion（只编辑结论正文，行动项走独立接口） */
export const meetingConclusionUpdateSchema = z
  .object({
    summary: conclusionTextSchema.optional(),
    decisions: conclusionUpdateListSchema.optional(),
    openQuestions: z
      .array(z.string().trim().min(1).max(MEETING_CONCLUSION_LIMITS.SUMMARY_MAX))
      .max(MEETING_CONCLUSION_LIMITS.OPEN_QUESTIONS_MAX)
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '至少修改一项结论内容');
export type MeetingConclusionUpdateInput = z.infer<typeof meetingConclusionUpdateSchema>;

/** POST /api/meetings/:id/action-items */
export const meetingActionItemCreateSchema = z.object({
  content: z.string().trim().min(1).max(MEETING_CONCLUSION_LIMITS.ACTION_ITEM_CONTENT_MAX),
  ownerLabel: z.string().trim().max(MEETING_CONCLUSION_LIMITS.OWNER_LABEL_MAX).default(''),
  ownerMemberId: z.string().trim().min(1).max(80).nullable().default(null),
  dueAt: z.string().datetime({ offset: true }).nullable().default(null),
});
export type MeetingActionItemCreateInput = z.infer<typeof meetingActionItemCreateSchema>;

/** PATCH /api/meetings/:id/action-items/:itemId（状态走同一接口） */
export const meetingActionItemUpdateSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1)
      .max(MEETING_CONCLUSION_LIMITS.ACTION_ITEM_CONTENT_MAX)
      .optional(),
    ownerLabel: z.string().trim().max(MEETING_CONCLUSION_LIMITS.OWNER_LABEL_MAX).optional(),
    ownerMemberId: z.string().trim().min(1).max(80).nullable().optional(),
    dueAt: z.string().datetime({ offset: true }).nullable().optional(),
    status: z.enum(MEETING_ACTION_ITEM_STATUSES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '至少修改一项行动项内容');
export type MeetingActionItemUpdateInput = z.infer<typeof meetingActionItemUpdateSchema>;

/** POST /api/meetings/:id/action-items/:itemId/to-reminder */
export const meetingActionItemReminderSchema = z.object({
  /** 由会议成员角色出声；必须是本会议成员 */
  assistantId: z.string().trim().min(1).max(80),
  timezone: z.string().min(1).max(64).default(DEFAULT_SCHEDULE_TIMEZONE),
});
export type MeetingActionItemReminderInput = z.infer<typeof meetingActionItemReminderSchema>;

/** POST /api/meetings/:id/action-items/:itemId/run-flow */
export const meetingActionItemRunFlowSchema = z.object({
  workflowId: z.string().trim().min(1).max(80),
  /** 不传则把行动项同时映射到 query/topic/question/actionItem */
  input: z.record(z.string(), z.unknown()).optional(),
});
export type MeetingActionItemRunFlowInput = z.infer<typeof meetingActionItemRunFlowSchema>;
