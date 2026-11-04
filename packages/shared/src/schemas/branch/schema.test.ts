import { describe, expect, it } from 'vitest';
import { BRANCH_LIMITS, BRANCH_STATUSES } from '../../types/branch';
import {
  branchCreateSchema,
  branchEvidenceSchema,
  branchLimitsSchema,
  branchStatusSchema,
} from './schema';

const evidence = {
  branchId: 'b1',
  parentConversationId: 'p1',
  childConversationId: 'c1',
  rootConversationId: 'p1',
  status: 'succeeded' as const,
  summary: '完成调研',
  artifacts: [],
  usage: null,
  needsReview: true as const,
  createdAt: '2026-11-04T00:00:00.000Z',
};

describe('v2.21 分支 Schema', () => {
  it('创建输入：目标必填、标题可选、autoStart 布尔', () => {
    expect(branchCreateSchema.parse({ goal: '调研竞品' })).toMatchObject({ goal: '调研竞品' });
    expect(branchCreateSchema.safeParse({ goal: '   ' }).success).toBe(false);
    expect(branchCreateSchema.safeParse({ goal: 'x', title: 'x'.repeat(41) }).success).toBe(false);
  });

  it('状态枚举覆盖八态', () => {
    expect(BRANCH_STATUSES).toHaveLength(8);
    expect(branchStatusSchema.safeParse('budget_exceeded').success).toBe(true);
    expect(branchStatusSchema.safeParse('done').success).toBe(false);
  });

  it('evidence 必带 needsReview，产物与 usage 可空', () => {
    expect(branchEvidenceSchema.parse(evidence).needsReview).toBe(true);
    expect(
      branchEvidenceSchema.safeParse({ ...evidence, needsReview: false }).success,
    ).toBe(false);
    expect(branchEvidenceSchema.parse({ ...evidence, summary: '', usage: null }).summary).toBe('');
  });

  it('四项上限在范围内且默认值合法', () => {
    expect(branchLimitsSchema.parse(BRANCH_LIMITS)).toEqual(BRANCH_LIMITS);
    expect(branchLimitsSchema.safeParse({ ...BRANCH_LIMITS, maxDepth: 5 }).success).toBe(false);
    expect(branchLimitsSchema.safeParse({ ...BRANCH_LIMITS, maxTreeTokens: 5000 }).success).toBe(false);
  });
});
