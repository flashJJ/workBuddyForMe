/**
 * v2.21 M4：进程启动收敛。
 * 只处理 running/waiting：改写为 interrupted、释放预留并补一条 branch_status 事件。
 */
import type { ConversationBranchRepository } from '@wbfm/database';
import type { BranchEventRecorder } from './branch-events';

export function recoverInterruptedBranches(
  branchRepo: ConversationBranchRepository,
  events: BranchEventRecorder,
  reason: string,
  now = new Date().toISOString(),
): number {
  const active = branchRepo.listActive();
  for (const branch of active) {
    const updated = branchRepo.patch(branch.id, {
      status: 'interrupted',
      statusReason: reason,
      reservedTokens: 0,
      endedAt: now,
    });
    if (updated) events.status(updated, 'interrupted', reason);
  }
  if (active.length > 0) {
    console.info(`[recovery] 已收敛中断分支：${active.length} 个`);
  }
  return active.length;
}
