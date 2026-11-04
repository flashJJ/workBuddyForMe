/**
 * v2.21 M4：进程启动收敛。
 * 只处理 running/waiting：改写为 interrupted、释放预留并补 branch_status + branch_returned。
 */
import type { ConversationBranchRepository } from '@wbfm/database';
import type { BranchEvidence } from '@wbfm/shared/types';
import type { BranchEventRecorder } from './branch-events';

export function recoverInterruptedBranches(
  branchRepo: ConversationBranchRepository,
  events: BranchEventRecorder,
  reason: string,
  now = new Date().toISOString(),
): number {
  const active = branchRepo.listActive();
  for (const branch of active) {
    // v2.22：无运行结果的终态也写回传，父会话可区分中断与失败
    const evidence: BranchEvidence = {
      branchId: branch.id,
      parentConversationId: branch.parentConversationId,
      childConversationId: branch.childConversationId,
      rootConversationId: branch.rootConversationId,
      status: 'interrupted',
      summary: '',
      artifacts: [],
      usage: null,
      needsReview: true,
      createdAt: now,
    };
    const updated = branchRepo.patch(branch.id, {
      status: 'interrupted',
      statusReason: reason,
      evidence,
      reservedTokens: 0,
      endedAt: now,
    });
    if (updated) {
      events.status(updated, 'interrupted', reason);
      events.returned(updated, 'interrupted', evidence, reason);
    }
  }
  if (active.length > 0) {
    console.info(`[recovery] 已收敛中断分支：${active.length} 个`);
  }
  return active.length;
}
