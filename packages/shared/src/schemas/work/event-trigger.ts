import { z } from 'zod';

/**
 * v1.7 M5 自定义短语触发器契约（event_triggers；M0 §6 冻结形状）。
 * 全部匹配仅本地完成：lowercase+trim+包含匹配，不做正则、不外发。
 */

/** 单条短语长度（去空白后）与单助手规则条数上限（防膨胀，双层校验） */
export const EVENT_TRIGGER_PHRASE_MAX = 24;
export const EVENT_TRIGGER_PHRASES_MAX = 30;
export const EVENT_TRIGGER_TEXT_MAX = 80;

const phraseSchema = z
  .string()
  .trim()
  .min(1, '触发短语不能为空')
  .max(EVENT_TRIGGER_PHRASE_MAX, `单条短语最长 ${EVENT_TRIGGER_PHRASE_MAX} 字`);

const phrasesSchema = z
  .array(phraseSchema)
  .min(1, '至少填写一条触发短语')
  .max(EVENT_TRIGGER_PHRASES_MAX, `最多 ${EVENT_TRIGGER_PHRASES_MAX} 条短语`)
  // 去重（大小写不敏感），避免同义短语重复占名额
  .superRefine((phrases, ctx) => {
    const seen = new Set<string>();
    phrases.forEach((phrase, index) => {
      const key = phrase.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index], message: '短语重复' });
      }
      seen.add(key);
    });
  });

const eventIdSchema = z
  .string()
  .min(3)
  .max(80)
  .regex(/^(ev|usr)\.[a-z0-9]+(?:\.[a-z0-9]+)*$/, '只能绑定内置或自建剧本');

const hourSchema = z.number().int().min(0).max(23);
const cooldownSchema = z.number().int().min(0).max(7 * 24 * 3600_000);
const maxPerDaySchema = z.number().int().min(1).max(50);
const intimacySchema = z.number().min(0).max(100);

export const eventTriggerCreateSchema = z.object({
  assistantId: z.string().trim().min(1),
  eventId: eventIdSchema,
  phrases: phrasesSchema,
  cooldownMs: cooldownSchema.default(30 * 60_000),
  /** 有效时段（含跨夜：start>end 表示跨 24:00） */
  startHour: hourSchema.default(0),
  endHour: hourSchema.default(23),
  maxPerDay: maxPerDaySchema.default(3),
  /** 最低亲密度门槛（0..100；未达到不触发） */
  minIntimacy: intimacySchema.default(0),
  enabled: z.boolean().default(true),
});
export type EventTriggerCreateInput = z.infer<typeof eventTriggerCreateSchema>;

export const eventTriggerUpdateSchema = z
  .object({
    eventId: eventIdSchema.optional(),
    phrases: phrasesSchema.optional(),
    cooldownMs: cooldownSchema.optional(),
    startHour: hourSchema.optional(),
    endHour: hourSchema.optional(),
    maxPerDay: maxPerDaySchema.optional(),
    minIntimacy: intimacySchema.optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, '至少提供一个更新字段');
export type EventTriggerUpdateInput = z.infer<typeof eventTriggerUpdateSchema>;

/** 对外视图（蛇形列已转换；phrases 为数组） */
export const eventTriggerViewSchema = z.object({
  id: z.string(),
  assistantId: z.string(),
  eventId: z.string(),
  phrases: z.array(z.string()),
  cooldownMs: z.number().int(),
  startHour: z.number().int(),
  endHour: z.number().int(),
  maxPerDay: z.number().int(),
  minIntimacy: z.number(),
  enabled: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type EventTriggerView = z.infer<typeof eventTriggerViewSchema>;

export const eventTriggerListQuerySchema = z.object({
  assistantId: z.string().trim().min(1).optional(),
});
export type EventTriggerListQuery = z.infer<typeof eventTriggerListQuerySchema>;
