import type { WorkflowRunRepository } from '@wbfm/database';

export const RECOVERY_REASON_PROCESS_RESTART = 'process_restart';

export interface RecoveryResult {
  /** 原 queued 且无执行者：重新入队的 runId */
  requeued: string[];
  /** v4.23：原在途且判定可续跑：已置回 queued 的 runId */
  resumed: string[];
  /** 原 running/waiting_human 且无执行者：已收敛 interrupted 的 runId */
  interrupted: string[];
}

/** 判定单个在途运行：resume=交给调用方写续跑参数；interrupt=保持人工介入 */
export type RecoveryDecision = 'resume' | 'interrupt';

/**
 * 启动恢复扫描：
 * - queued 残留 → 重新入队；
 * - running/waiting_human 残留 → 先交给 decide 判定：
 *   resume 置回 queued 并返回；interrupt 收敛 interrupted；
 * - activeIds 为当前进程仍持有执行者的 run（正常为启动后的空集；测试注入用）。
 */
export function recoverInterruptedRuns(
  runs: WorkflowRunRepository,
  activeIds: ReadonlySet<string> = new Set(),
  decide: (runId: string) => RecoveryDecision = () => 'interrupt',
): RecoveryResult {
  const recoverable = runs.findRecoverableRuns(activeIds);
  const resumed: string[] = [];
  const interrupted: string[] = [];
  for (const runId of recoverable.interrupted) {
    const decision = decide(runId);
    // 先收敛为 interrupted（校验原状态），再按需改回 queued
    const marked = runs.markInterrupted(runId, RECOVERY_REASON_PROCESS_RESTART);
    if (!marked) continue;
    if (decision === 'resume' && runs.requeueInterrupted(runId)) {
      resumed.push(runId);
      continue;
    }
    interrupted.push(runId);
  }
  return { requeued: recoverable.queued, resumed, interrupted };
}
