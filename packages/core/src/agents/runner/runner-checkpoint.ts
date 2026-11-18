import type { TaskRunCheckpointRepository } from '@wbfm/database';
import type {
  AgentBudgetUsage,
  ExecutorOutcome,
  SubtaskSpec,
} from '@wbfm/shared/schemas';

export type CheckpointWriter = ReturnType<typeof createCheckpointWriter>;

/**
 * v4.7 P1：协作运行检查点写入器（从 runner 外迁守行数门禁）。
 * save 记录「当前可恢复位置」；seal 在终态把检查点标记为不可续跑。
 */
export function createCheckpointWriter(
  checkpoints: TaskRunCheckpointRepository,
  runId: string,
  getUsage: () => AgentBudgetUsage,
) {
  return {
    save(
      phase: 'planning' | 'executing' | 'reviewing',
      subtask?: SubtaskSpec | null,
      outcome?: ExecutorOutcome | null,
    ): void {
      checkpoints.upsert({
        agentRunId: runId,
        roundNo: getUsage().round,
        phase,
        ...(subtask ? { subtask } : {}),
        ...(outcome ? { outcome } : {}),
        usage: getUsage(),
      });
    },
    seal(): void {
      checkpoints.markNotResumable(runId, '运行已终态');
    },
  };
}
