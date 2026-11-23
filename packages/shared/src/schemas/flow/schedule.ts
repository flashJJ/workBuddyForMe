import { z } from 'zod';

/**
 * v4.24 定时触发：5 字段 cron 的解析、匹配与下次时间计算。
 * 纯函数、系统本地时区、不引入时区库。
 */

export class CronError extends Error {}

export interface CronSpec {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  /** 0–6，0=周日（输入中的 7 已归一为 0） */
  daysOfWeek: Set<number>;
  /** 日字段是否被限制（用于日/周 OR 语义） */
  domRestricted: boolean;
  dowRestricted: boolean;
}

const FIELD_BOUNDS: ReadonlyArray<readonly [number, number, string]> = [
  [0, 59, '分钟'],
  [0, 23, '小时'],
  [1, 31, '日'],
  [1, 12, '月'],
  [0, 7, '星期'],
];

function parseField(raw: string, index: number): Set<number> {
  const [min, max, label] = FIELD_BOUNDS[index]!;
  const values = new Set<number>();
  for (const chunk of raw.split(',')) {
    const part = chunk.trim();
    if (!part) throw new CronError(`${label}字段存在空项`);
    const slash = part.split('/');
    if (slash.length > 2) throw new CronError(`${label}字段步长格式错误：${part}`);
    const step = slash.length === 2 ? Number(slash[1]) : 1;
    if (!Number.isInteger(step) || step < 1) throw new CronError(`${label}字段步长必须是正整数：${part}`);
    const range = slash[0]!.trim();
    let start: number;
    let end: number;
    if (range === '*') {
      start = min;
      end = max;
    } else if (range.includes('-')) {
      const [a, b] = range.split('-');
      start = Number(a);
      end = Number(b);
    } else {
      start = Number(range);
      end = step > 1 ? max : start;
    }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
      throw new CronError(`${label}字段范围无效：${part}`);
    }
    if (start < min || end > max) {
      throw new CronError(`${label}字段超出范围 ${min}–${max}：${part}`);
    }
    for (let value = start; value <= end; value += step) values.add(value);
  }
  if (values.size === 0) throw new CronError(`${label}字段没有有效取值`);
  return values;
}

/** 解析 5 字段 cron；非法表达式抛 CronError */
export function parseCron(expression: string): CronSpec {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new CronError('cron 需要 5 个字段：分 时 日 月 周');
  const dowRaw = fields[4]!;
  const daysOfWeekRaw = parseField(dowRaw, 4);
  const daysOfWeek = new Set([...daysOfWeekRaw].map((day) => (day === 7 ? 0 : day)));
  return {
    minutes: parseField(fields[0]!, 0),
    hours: parseField(fields[1]!, 1),
    daysOfMonth: parseField(fields[2]!, 2),
    months: parseField(fields[3]!, 3),
    daysOfWeek,
    domRestricted: fields[2]!.trim() !== '*',
    dowRestricted: dowRaw.trim() !== '*',
  };
}

function dayMatches(spec: CronSpec, date: Date): boolean {
  const dom = spec.daysOfMonth.has(date.getDate());
  const dow = spec.daysOfWeek.has(date.getDay());
  if (spec.domRestricted && spec.dowRestricted) return dom || dow;
  if (spec.domRestricted) return dom;
  if (spec.dowRestricted) return dow;
  return true;
}

/** 给定时刻是否恰好命中（秒被忽略，按分钟粒度） */
export function cronMatches(spec: CronSpec, date: Date): boolean {
  return (
    spec.months.has(date.getMonth() + 1) &&
    dayMatches(spec, date) &&
    spec.hours.has(date.getHours()) &&
    spec.minutes.has(date.getMinutes())
  );
}

const MAX_SEARCH_YEARS = 5;

/** 返回严格晚于 from 的最近匹配时间；5 年内无解抛 CronError */
export function nextCronTime(spec: CronSpec, from: Date): Date {
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);
  const limit = from.getTime() + MAX_SEARCH_YEARS * 366 * 24 * 3600 * 1000;

  while (cursor.getTime() <= limit) {
    if (!spec.months.has(cursor.getMonth() + 1)) {
      cursor.setMonth(cursor.getMonth() + 1, 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }
    if (!dayMatches(spec, cursor)) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }
    if (!spec.hours.has(cursor.getHours())) {
      cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (!spec.minutes.has(cursor.getMinutes())) {
      cursor.setMinutes(cursor.getMinutes() + 1, 0, 0);
      continue;
    }
    return cursor;
  }
  throw new CronError('未来 5 年内没有匹配的执行时间');
}

/** 保存/接口入口：校验表达式并返回规范化字符串 */
export function validateCron(expression: string): string {
  parseCron(expression);
  return expression.trim().replace(/\s+/g, ' ');
}

export const flowScheduleUpsertSchema = z
  .object({
    cron: z.string().trim().min(1, 'cron 不能为空').max(120),
    enabled: z.boolean().default(true),
    input: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, ctx) => {
    try {
      validateCron(value.cron);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : 'cron 表达式不合法',
        path: ['cron'],
      });
    }
  });

export type FlowScheduleUpsertInput = z.infer<typeof flowScheduleUpsertSchema>;
