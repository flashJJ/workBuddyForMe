import type { WorkSignal } from '@wbfm/shared';
import type { SubagentRunView } from '@wbfm/shared/schemas';
import { createSubagentRunRepository } from '@wbfm/database';
import { isTerminalSubagentRun, subagentWorkSignal } from './subagent-signal';

/** 仓储类型（database 包未导出该别名，这里从工厂推导） */
type SubagentRunRepo = ReturnType<typeof createSubagentRunRepository>;

export interface InternalFailureDeps {
  repo: SubagentRunRepo;
  pending: Map<string, unknown>;
  notifySettled(run: SubagentRunView): void;
  workSignals: { ingestSubagent(signal: WorkSignal): void };
  completions: { completeSubagent(run: SubagentRunView): void };
}

/**
 * 执行链未捕获异常（审批/审计/证据写入抛错）的兜底：
 * 必须把运行收敛到终态并释放 pending，否则 UI 永久停在 queued/running，
 * 且外层 `void execute(...)` 会变成未处理拒绝。
 */
export function finalizeInternalFailure(
  deps: InternalFailureDeps,
  run: SubagentRunView,
  error: unknown,
): void {
  deps.pending.delete(run.id);
  const message = error instanceof Error ? error.message : String(error);
  try {
    const latest = deps.repo.get(run.id);
    if (latest && isTerminalSubagentRun(latest.status)) {
      deps.notifySettled(latest);
      return;
    }
    const failed = deps.repo.finish(run.id, {
      status: 'failed',
      summary: '',
      errorCode: 'subagent_internal_error',
      errorMessage: message,
      outputBytes: 0,
    });
    if (!failed) return;
    deps.notifySettled(failed);
    // 证据/回投属旁路：失败只忽略，不得再抛
    try {
      deps.workSignals.ingestSubagent(
        subagentWorkSignal(failed, 'failed', null, failed.errorMessage, failed.endedAt),
      );
      deps.completions.completeSubagent(failed);
    } catch {
      /* 旁路失败不影响终态 */
    }
  } catch {
    /* 终态落账也失败：已释放 pending，至少不产生未处理拒绝 */
  }
}
