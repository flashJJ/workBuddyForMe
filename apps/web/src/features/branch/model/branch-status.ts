/** v2.21：分支状态到展示值的映射（语气色沿用 Badge 变体） */
import type { BranchStatus, ConversationBranch } from '@wbfm/shared/types';

export type BranchTone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline';

export const ACTIVE_BRANCH_STATUSES: BranchStatus[] = ['queued', 'running', 'waiting'];

export const BRANCH_STATUS_TONE: Record<BranchStatus, BranchTone> = {
  queued: 'outline',
  running: 'info',
  waiting: 'warning',
  succeeded: 'success',
  failed: 'danger',
  cancelled: 'outline',
  interrupted: 'warning',
  budget_exceeded: 'danger',
};

export function statusLabelKey(status: BranchStatus): `runGraph.outcome.${BranchStatus}` {
  return `runGraph.outcome.${status}`;
}

export function isActiveBranch(branch: ConversationBranch): boolean {
  return ACTIVE_BRANCH_STATUSES.includes(branch.status);
}

export function branchTotalTokens(branch: ConversationBranch): number | null {
  return branch.evidence?.usage?.totalTokens ?? null;
}
