import { describe, expect, it } from 'vitest';
import { evaluateBranchAdmission, reserveBranchTokens, type BranchAdmissionSnapshot } from './branch-limits';

const base: BranchAdmissionSnapshot = {
  ancestorIds: ['root', 'parent'],
  childConversationId: 'child-new',
  depth: 2,
  activeCount: 0,
  childCount: 0,
  usedTokens: 0,
  reservedTokens: 0,
};

describe('v2.21 分支准入纯函数', () => {
  it('默认上限：并发 3 / 深度 2 / 子节点 6 / 树 200k 内通过', () => {
    expect(evaluateBranchAdmission(base).ok).toBe(true);
  });

  it('环检测优先于其他上限', () => {
    expect(
      evaluateBranchAdmission({
        ...base,
        childConversationId: 'root',
        depth: 99,
        childCount: 99,
      }),
    ).toEqual({ ok: false, code: 'BRANCH_CYCLE' });
  });

  it('深度、子节点、并发、预算依次拒绝', () => {
    expect(evaluateBranchAdmission({ ...base, depth: 3 })).toEqual({
      ok: false,
      code: 'BRANCH_DEPTH_EXCEEDED',
    });
    expect(evaluateBranchAdmission({ ...base, childCount: 6 })).toEqual({
      ok: false,
      code: 'BRANCH_CHILDREN_EXCEEDED',
    });
    expect(evaluateBranchAdmission({ ...base, activeCount: 3 })).toEqual({
      ok: false,
      code: 'BRANCH_CONCURRENCY_EXCEEDED',
    });
    expect(
      evaluateBranchAdmission({ ...base, usedTokens: 150_000, reservedTokens: 50_000 }),
    ).toEqual({ ok: false, code: 'BRANCH_BUDGET_EXCEEDED' });
  });

  it('预留 Token 不超过剩余预算，触顶返回 0', () => {
    expect(reserveBranchTokens(10_000)).toBe(10_000);
    expect(reserveBranchTokens(10_000, undefined, 195_000, 0)).toBe(5_000);
    expect(reserveBranchTokens(10_000, undefined, 200_000, 0)).toBe(0);
  });
});
