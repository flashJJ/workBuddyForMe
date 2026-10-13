/**
 * v1.7 条件白名单求值（纯函数，无表达式引擎）。
 *
 * 安全模型：path 只允许指向 ConditionContext 的固定数值叶子；
 * 未知 path / 值非有限数 / op 不识别一律按 false 处理并回调 onInvalid，
 * 绝不抛错——弱数据环境下剧本走默认支线，演出不中断。
 */
import type { ConditionContext } from './types';
import type { EventCondition, ConditionOp } from '@wbfm/shared/schemas';

const MOOD_KEYS = new Set(['happiness', 'anger', 'sadness']);
const RELATION_KEYS = new Set(['intimacy', 'trust']);
const PERSONALITY_KEYS = new Set(['frankness', 'tsundere', 'shy', 'tolerance']);
const TIME_KEYS = new Set(['hour', 'lastInteractionMin']);
// 计数器名与 emotionState.counters 既有键对齐：小驼峰（touchStreak）/下划线均可，
// 首字符必须小写，禁止数字开头与连字符等路径歧义字符
const COUNTER_SLUG = /^[a-z][a-zA-Z0-9_]{0,23}$/;

/** path 是否在白名单内（不取值，只做结构判定） */
export function isValidConditionPath(path: string): boolean {
  const parts = path.split('.');
  if (parts.length < 2) return false;
  const [root, leaf] = [parts[0]!, parts[1]!];
  switch (root) {
    case 'mood':
      return parts.length === 2 && MOOD_KEYS.has(leaf);
    case 'relation':
      return parts.length === 2 && RELATION_KEYS.has(leaf);
    case 'personality':
      return parts.length === 2 && PERSONALITY_KEYS.has(leaf);
    case 'time':
      return parts.length === 2 && TIME_KEYS.has(leaf);
    case 'counters':
      return parts.length === 2 && COUNTER_SLUG.test(leaf);
    default:
      return false;
  }
}

/** 取白名单叶子值；非有限数返回 null */
export function readConditionValue(ctx: ConditionContext, path: string): number | null {
  if (!isValidConditionPath(path)) return null;
  const [root, leaf] = path.split('.') as [string, string];
  const raw: unknown =
    root === 'counters'
      ? ctx.counters[leaf]
      : (ctx as unknown as Record<string, Record<string, unknown>>)[root]?.[leaf];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

const COMPARATORS: Record<ConditionOp, (actual: number, expected: number) => boolean> = {
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  eq: (a, b) => a === b,
};

/** 单条件求值；非法 path/值/op 一律 false */
export function evaluateEventCondition(
  ctx: ConditionContext,
  cond: EventCondition,
  onInvalid?: (path: string) => void,
): boolean {
  if (!(cond.op in COMPARATORS)) {
    onInvalid?.(cond.path);
    return false;
  }
  const actual = readConditionValue(ctx, cond.path);
  if (actual === null) {
    if (!isValidConditionPath(cond.path)) onInvalid?.(cond.path);
    return false;
  }
  return COMPARATORS[cond.op](actual, cond.value);
}

/** AND 语义；空数组恒真（用于 branch 无条件汇合跳转） */
export function evaluateEventConditions(
  ctx: ConditionContext,
  conditions: readonly EventCondition[],
  onInvalid?: (path: string) => void,
): boolean {
  return conditions.every((cond) => evaluateEventCondition(ctx, cond, onInvalid));
}
