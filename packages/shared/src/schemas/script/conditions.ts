/**
 * v3.0 剧本引擎：条件（纯数据 + 纯函数求值）。
 *
 * 条件只做「当前状态是否允许」的判断，不承载业务逻辑；
 * 需要更复杂的判断时新增白名单 predicate，不接受任意脚本表达式。
 * 条件树可嵌套实现 all / any / not，求值不产生副作用。
 */

import { z } from 'zod';
import { levelAtLeast, type RelationshipLevel } from '../chat/relationship-level';
import { isHourInWindow } from '../interaction/interaction-graph';
import { MOTION_MOODS, type MotionMood } from '../media/motion-asset';

/** 可被条件直接引用的状态位（与 ConditionContext 的布尔字段一一对应） */
export const CONDITION_FLAGS = [
  'sleeping',
  'faceAway',
  'busy',
  'linesEnabled',
  'emotionEnabled',
] as const;
export type ConditionFlag = (typeof CONDITION_FLAGS)[number];

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { level: { min: 'acquaintance' | 'partner' } }
  | { hour: { from: number; to: number } }
  | { mood: MotionMood[] }
  | { flag: ConditionFlag };

const hourSchema = z.number().int().min(0).max(23);

/** 条件树 zod 校验（递归用 lazy；空 all/any 在 schema 层拒绝） */
export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(conditionSchema).min(1) }),
    z.object({ any: z.array(conditionSchema).min(1) }),
    z.object({ not: conditionSchema }),
    z.object({ level: z.object({ min: z.enum(['acquaintance', 'partner']) }) }),
    z.object({ hour: z.object({ from: hourSchema, to: hourSchema }) }),
    z.object({ mood: z.array(z.enum(MOTION_MOODS)).min(1) }),
    z.object({ flag: z.enum(CONDITION_FLAGS) }),
  ]),
);

/** 求值上下文：由 Director 每帧/每次 play 组装，字段与 09 文档 §4.1 对齐 */
export interface ConditionContext {
  /** 当前小时 0–23（本地时区） */
  hour: number;
  relationshipLevel: RelationshipLevel;
  mood: MotionMood;
  sleeping: boolean;
  faceAway: boolean;
  busy: boolean;
  linesEnabled: boolean;
  emotionEnabled: boolean;
}

/** 条件求值纯函数；未知结构按 false 处理（schema 已先行拦截） */
export function evaluateCondition(condition: Condition, ctx: ConditionContext): boolean {
  if ('all' in condition) return condition.all.every((child) => evaluateCondition(child, ctx));
  if ('any' in condition) return condition.any.some((child) => evaluateCondition(child, ctx));
  if ('not' in condition) return !evaluateCondition(condition.not, ctx);
  if ('level' in condition) return levelAtLeast(ctx.relationshipLevel, condition.level.min);
  if ('hour' in condition) return isHourInWindow(ctx.hour, condition.hour.from, condition.hour.to);
  if ('mood' in condition) return condition.mood.includes(ctx.mood);
  return ctx[condition.flag];
}
