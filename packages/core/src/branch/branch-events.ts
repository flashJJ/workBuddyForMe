/**
 * v2.21 M3：分支事件记录器。
 * 事件写 session_events（scope='branch'，scopeId=branchId）；失败只告警，不阻断分支业务。
 */
import type {
  BranchEvidence,
  BranchStatus,
  ConversationBranch,
} from '@wbfm/shared/types';
import type { SessionEventRepository } from '@wbfm/database';

type BranchEventType =
  | 'branch_created'
  | 'branch_started'
  | 'branch_status'
  | 'branch_returned';

export interface BranchEventRecorder {
  created(branch: ConversationBranch): void;
  started(branch: ConversationBranch): void;
  status(branch: ConversationBranch, status: BranchStatus, reason: string | null): void;
  returned(
    branch: ConversationBranch,
    status: BranchStatus,
    evidence: BranchEvidence,
    reason: string | null,
  ): void;
}

export function createBranchEventRecorder(
  events: Pick<SessionEventRepository, 'append'>,
): BranchEventRecorder {
  const append = (
    type: BranchEventType,
    branch: ConversationBranch,
    extra: Record<string, unknown>,
  ): void => {
    try {
      events.append({
        scope: 'branch',
        scopeId: branch.id,
        type,
        payload: {
          branchId: branch.id,
          parentConversationId: branch.parentConversationId,
          childConversationId: branch.childConversationId,
          rootConversationId: branch.rootConversationId,
          title: branch.title,
          goal: branch.goal,
          depth: branch.depth,
          archivedAt: branch.archivedAt,
          ...extra,
        },
      });
    } catch (error) {
      console.warn(`[branch] 写入事件失败：${type}`, error);
    }
  };

  return {
    created(branch) {
      append('branch_created', branch, { status: branch.status });
    },
    started(branch) {
      append('branch_started', branch, { status: 'running' });
    },
    status(branch, status, reason) {
      append('branch_status', branch, { status, statusReason: reason });
    },
    returned(branch, status, evidence, reason) {
      append('branch_returned', branch, {
        status,
        statusReason: reason,
        summary: evidence.summary,
        evidence,
      });
    },
  };
}
