import type { WorkflowRunRepository } from '@wbfm/database';

export const RECOVERY_REASON_PROCESS_RESTART = 'process_restart';

export interface RecoveryResult {
  /** 原 queued 且无执行者：重新入队的 runId */
  requeued: string[];
  /** 原 running/waiting_human 且无执行者：已收敛 interrupted 的 runId */
  interrupted: string[];
}

/**
 * v0.9 启动恢复扫描：
 * - queued 残留（从未被拾取/进程在拾取前死亡）→ 重新入队；
 * - running/waiting_human 残留（内存协程与 waiters 随进程消失）→ interrupted 终态；
 * - activeIds 为当前进程仍持有执行者的 run（正常为启动后的空集；测试注入用）。
 *
 * 不尝试跨进程复活挂起协程：调用方在恢复完成后启动队列拾取 requeued。
 */
export function recoverInterruptedRuns(
  runs: WorkflowRunRepository,
  activeIds: ReadonlySet<string> = new Set(),
): RecoveryResult {
  const recoverable = runs.findRecoverableRuns(activeIds);
  const interrupted: string[] = [];
  for (const runId of recoverable.interrupted) {
    const view = runs.markInterrupted(runId, RECOVERY_REASON_PROCESS_RESTART);
    if (view) interrupted.push(runId);
  }
  return { requeued: recoverable.queued, interrupted };
}
