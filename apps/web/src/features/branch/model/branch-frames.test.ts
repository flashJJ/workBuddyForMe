import { describe, expect, it } from 'vitest';
import type { ConversationBranch } from '@wbfm/shared/types';
import { diffBranchFrames } from './branch-frames';

function branch(overrides: Partial<ConversationBranch> = {}): ConversationBranch {
  return {
    id: 'b1',
    parentConversationId: 'p1',
    childConversationId: 'c2',
    rootConversationId: 'p1',
    title: '分支一',
    goal: '整理竞品',
    depth: 1,
    status: 'queued',
    statusReason: null,
    archivedAt: null,
    reservedTokens: 0,
    evidence: null,
    createdAt: '2026-11-04T00:00:00.000Z',
    updatedAt: '2026-11-04T00:00:00.000Z',
    endedAt: null,
    ...overrides,
  } as ConversationBranch;
}

describe('v2.22 分支实时帧', () => {
  it('首次出现发布 branch_created；已终态再补 branch_returned', () => {
    const frames = diffBranchFrames(new Map(), [branch({ status: 'succeeded' })], 'p1');
    expect(frames.map((frame) => frame.type)).toEqual(['branch_created', 'branch_returned']);
    expect(frames[0]?.scope).toBe('branch');
    expect(frames[0]?.rootId).toBe('p1');
    expect(frames[1]?.payload).toMatchObject({ branchId: 'b1', status: 'succeeded' });
  });

  it('状态推进发布 branch_status，进入终态补 branch_returned', () => {
    const prev = new Map([['b1', branch({ status: 'running' })]]);
    const frames = diffBranchFrames(prev, [branch({ status: 'succeeded' })], 'p1');
    expect(frames.map((frame) => frame.type)).toEqual(['branch_status', 'branch_returned']);
  });

  it('重命名与归档发布 branch_status', () => {
    const prev = new Map([['b1', branch({ title: '旧标题' })]]);
    const renamed = diffBranchFrames(prev, [branch({ title: '新标题' })], 'p1');
    expect(renamed.map((frame) => frame.type)).toEqual(['branch_status']);
    expect(renamed[0]?.payload).toMatchObject({ title: '新标题' });

    const archived = diffBranchFrames(
      new Map([['b1', branch()]]),
      [branch({ archivedAt: '2026-11-04T01:00:00.000Z' })],
      'p1',
    );
    expect(archived[0]?.payload).toMatchObject({ archivedAt: '2026-11-04T01:00:00.000Z' });
  });

  it('无变化不发帧', () => {
    const prev = new Map([['b1', branch({ status: 'succeeded' })]]);
    expect(diffBranchFrames(prev, [branch({ status: 'succeeded' })], 'p1')).toEqual([]);
  });
});
