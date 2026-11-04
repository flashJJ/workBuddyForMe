/**
 * v2.22：分支列表快照 → RunGraph 实时帧（纯函数，便于单测）。
 * 面板 5s 轮询得到新列表后，只对新增/状态变化的分支发帧；
 * 服务端投影仍是权威，前端不重复实现完整分支投影。
 */
import type { ConversationBranch } from '@wbfm/shared/types';
import type { RunGraphLiveFrameInput } from '@/features/run-graph';

const TERMINAL = new Set<string>([
  'succeeded',
  'failed',
  'cancelled',
  'interrupted',
  'budget_exceeded',
]);

function payloadOf(branch: ConversationBranch): Record<string, unknown> {
  return {
    branchId: branch.id,
    parentConversationId: branch.parentConversationId,
    childConversationId: branch.childConversationId,
    rootConversationId: branch.rootConversationId,
    title: branch.title,
    goal: branch.goal,
    depth: branch.depth,
    status: branch.status,
    statusReason: branch.statusReason,
    archivedAt: branch.archivedAt,
    evidence: branch.evidence,
    summary: branch.evidence?.summary ?? '',
  };
}

/** 比较上一轮快照，输出需要发布的帧（顺序：created → status → returned） */
export function diffBranchFrames(
  prev: ReadonlyMap<string, ConversationBranch>,
  next: readonly ConversationBranch[],
  rootId: string,
): RunGraphLiveFrameInput[] {
  const frames: RunGraphLiveFrameInput[] = [];
  for (const branch of next) {
    const last = prev.get(branch.id);
    const base = {
      rootKind: 'conversation' as const,
      rootId,
      scope: 'branch' as const,
      scopeId: branch.id,
      payload: payloadOf(branch),
    };
    if (!last) {
      frames.push({ ...base, type: 'branch_created' });
    } else if (
      last.status !== branch.status ||
      last.title !== branch.title ||
      (last.archivedAt ?? null) !== (branch.archivedAt ?? null)
    ) {
      frames.push({ ...base, type: 'branch_status' });
    }
    const becameTerminal = TERMINAL.has(branch.status) && (!last || !TERMINAL.has(last.status));
    if (becameTerminal) frames.push({ ...base, type: 'branch_returned' });
  }
  return frames;
}
