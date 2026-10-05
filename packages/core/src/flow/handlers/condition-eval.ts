/**
 * 条件节点规则求值（纯函数、确定性，不调用模型）。
 * 左值/右值在引擎执行前已完成引用解析，这里只做运行时比较。
 */

export const CONDITION_OPS = [
  '==',
  '!=',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  '>',
  '<',
  'isEmpty',
] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

export interface ConditionRule {
  left: unknown;
  op: ConditionOp;
  /** isEmpty 不需要右值 */
  right?: unknown;
}

export type ConditionMatch = 'all' | 'any';

function asComparableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return false;
}

export function evalRule(rule: ConditionRule): boolean {
  const { left, op, right } = rule;
  switch (op) {
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    case 'contains':
    case 'notContains': {
      if (typeof right !== 'string' || right === '') return false;
      const hit =
        typeof left === 'string'
          ? left.includes(right)
          : Array.isArray(left)
            ? left.includes(right)
            : false;
      return op === 'contains' ? hit : !hit;
    }
    case 'startsWith':
      return typeof left === 'string' && typeof right === 'string' && left.startsWith(right);
    case 'endsWith':
      return typeof left === 'string' && typeof right === 'string' && left.endsWith(right);
    case '>':
    case '<': {
      const l = asComparableNumber(left);
      const r = asComparableNumber(right);
      if (l === null || r === null) return false;
      return op === '>' ? l > r : l < r;
    }
    case 'isEmpty':
      return isEmptyValue(left);
    default:
      return false;
  }
}

/**
 * 按规则集求值：
 * - 空规则集恒为 false（无明确成立条件 → 走 false 分支）；
 * - all=每条都成立（默认）；any=任一条成立。
 */
export function evaluateCondition(rules: ConditionRule[], match: ConditionMatch = 'all'): boolean {
  if (rules.length === 0) return false;
  return match === 'any' ? rules.some(evalRule) : rules.every(evalRule);
}
