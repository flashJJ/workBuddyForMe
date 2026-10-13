/**
 * v1.7 角色化提醒契约（scheduled_tasks；见 docs/plan/v1.7/03 §2）。
 *
 * 用户编辑本地墙钟 hour/minute（+weekday/atDate），timezone 创建时固化 IANA；
 * nextRunAt 为服务端按 computeNextRunMs 换算的 UTC ISO，tick 只比较它。
 */
import { z } from 'zod';

export const SCHEDULE_KINDS = ['once', 'daily', 'weekly'] as const;
export const DEFAULT_SCHEDULE_TIMEZONE = 'Asia/Shanghai';
export const SCHEDULE_TEXT_MAX = 200;

const hourSchema = z.number().int().min(0).max(23);
const minuteSchema = z.number().int().min(0).max(59);

export const scheduledTaskCreateSchema = z
  .object({
    assistantId: z.string().trim().min(1),
    kind: z.enum(SCHEDULE_KINDS),
    hour: hourSchema,
    minute: minuteSchema,
    /** weekly 必填 0..6（0=周日，JS getDay 口径）；其余省略 */
    weekday: z.number().int().min(0).max(6).nullable().optional(),
    /** once 必填 YYYY-MM-DD；其余省略 */
    atDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    /** 本版固化 Asia/Shanghai（默认即此值，不提供 UI 修改） */
    timezone: z.string().min(1).max(64).default(DEFAULT_SCHEDULE_TIMEZONE),
    text: z.string().trim().min(1, '提醒内容不能为空').max(SCHEDULE_TEXT_MAX),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'weekly' && (value.weekday === undefined || value.weekday === null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '每周提醒必须选择星期', path: ['weekday'] });
    }
    if (value.kind === 'once' && !value.atDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '单次提醒必须选择日期', path: ['atDate'] });
    }
  });
export type ScheduledTaskCreateInput = z.infer<typeof scheduledTaskCreateSchema>;

/** 列表查询：可按助手过滤；不传返回全部（管理面板用） */
export const scheduledTaskListQuerySchema = z.object({
  assistantId: z.string().trim().min(1).optional(),
});
export type ScheduledTaskListQuery = z.infer<typeof scheduledTaskListQuerySchema>;

export const scheduledTaskUpdateSchema = z
  .object({
    hour: hourSchema.optional(),
    minute: minuteSchema.optional(),
    weekday: z.number().int().min(0).max(6).nullable().optional(),
    atDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    text: z.string().trim().min(1).max(SCHEDULE_TEXT_MAX).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, '至少提供一个更新字段');
export type ScheduledTaskUpdateInput = z.infer<typeof scheduledTaskUpdateSchema>;

/** 列表/返回视图（全部 ISO/本地字段直读） */
export const scheduledTaskViewSchema = z.object({
  id: z.string(),
  assistantId: z.string(),
  kind: z.enum(SCHEDULE_KINDS),
  hour: hourSchema,
  minute: minuteSchema,
  weekday: z.number().int().min(0).max(6).nullable(),
  atDate: z.string().nullable(),
  timezone: z.string(),
  text: z.string(),
  enabled: z.boolean(),
  nextRunAt: z.string().datetime(),
  lastFiredAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ScheduledTaskView = z.infer<typeof scheduledTaskViewSchema>;
