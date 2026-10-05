import { describe, expect, it } from 'vitest';
import { evalRule, evaluateCondition, type ConditionRule } from './condition-eval';

const rule = (partial: Partial<ConditionRule> & Pick<ConditionRule, 'op'>): ConditionRule => ({
  left: partial.left,
  op: partial.op,
  ...(partial.right !== undefined ? { right: partial.right } : {}),
});

describe('evalRule：逐操作符', () => {
  it('== / != 严格相等', () => {
    expect(evalRule(rule({ op: '==', left: 'a', right: 'a' }))).toBe(true);
    expect(evalRule(rule({ op: '==', left: 1, right: 1 }))).toBe(true);
    expect(evalRule(rule({ op: '==', left: 1, right: '1' }))).toBe(false);
    expect(evalRule(rule({ op: '!=', left: 1, right: '1' }))).toBe(true);
  });

  it('contains / notContains：字符串子串与数组包含', () => {
    expect(evalRule(rule({ op: 'contains', left: 'hello world', right: 'world' }))).toBe(true);
    expect(evalRule(rule({ op: 'contains', left: ['a', 'b'], right: 'b' }))).toBe(true);
    expect(evalRule(rule({ op: 'notContains', left: 'hello', right: 'x' }))).toBe(true);
    expect(evalRule(rule({ op: 'contains', left: 'hello', right: '' }))).toBe(false);
  });

  it('startsWith / endsWith', () => {
    expect(evalRule(rule({ op: 'startsWith', left: 'flow:abc', right: 'flow:' }))).toBe(true);
    expect(evalRule(rule({ op: 'endsWith', left: 'a.md', right: '.md' }))).toBe(true);
    expect(evalRule(rule({ op: 'endsWith', left: 123 as unknown, right: '.md' }))).toBe(false);
  });

  it('> / < 数字比较（数字字符串可转换）', () => {
    expect(evalRule(rule({ op: '>', left: 3, right: 2 }))).toBe(true);
    expect(evalRule(rule({ op: '<', left: '3', right: '10' }))).toBe(true);
    expect(evalRule(rule({ op: '>', left: 'x', right: 1 }))).toBe(false);
    expect(evalRule(rule({ op: '<', left: 5, right: 2 }))).toBe(false);
  });

  it('isEmpty：null/undefined/空串/空数组/空对象', () => {
    expect(evalRule(rule({ op: 'isEmpty', left: null }))).toBe(true);
    expect(evalRule(rule({ op: 'isEmpty', left: '   ' }))).toBe(true);
    expect(evalRule(rule({ op: 'isEmpty', left: [] }))).toBe(true);
    expect(evalRule(rule({ op: 'isEmpty', left: {} }))).toBe(true);
    expect(evalRule(rule({ op: 'isEmpty', left: 0 }))).toBe(false);
    expect(evalRule(rule({ op: 'isEmpty', left: 'x' }))).toBe(false);
  });
});

describe('evaluateCondition：规则集组合', () => {
  const r1 = rule({ op: '>', left: 3, right: 1 });
  const r2 = rule({ op: 'contains', left: 'hello', right: 'ell' });
  const bad = rule({ op: '==', left: 1, right: 2 });

  it('空规则集恒 false（走 false 分支）', () => {
    expect(evaluateCondition([])).toBe(false);
  });

  it('all（默认）：全真才真，一假即假', () => {
    expect(evaluateCondition([r1, r2], 'all')).toBe(true);
    expect(evaluateCondition([r1, bad], 'all')).toBe(false);
  });

  it('any：一真即真', () => {
    expect(evaluateCondition([bad, r2], 'any')).toBe(true);
    expect(evaluateCondition([bad], 'any')).toBe(false);
  });
});
