import { describe, expect, it } from 'vitest';
import { needsPlanReview, PLAN_REVIEW_BRIEF_THRESHOLD } from './plan-review';

const base = { title: '任务', brief: '简述', acceptance: ['完成'] };

describe('needsPlanReview（只对值得确认的任务弹计划卡）', () => {
  it('简单单步任务不弹', () => {
    expect(needsPlanReview(base)).toBe(false);
  });

  it('含 desktop 一律弹（会操作真实界面）', () => {
    expect(needsPlanReview({ ...base, toolScopes: ['desktop'] })).toBe(true);
  });

  it('验收标准 ≥3 条弹（多目标易偏差）', () => {
    expect(needsPlanReview({ ...base, acceptance: ['a', 'b', 'c'] })).toBe(true);
  });

  it('执行说明过长弹', () => {
    expect(needsPlanReview({ ...base, brief: '细'.repeat(PLAN_REVIEW_BRIEF_THRESHOLD) })).toBe(true);
  });
});
