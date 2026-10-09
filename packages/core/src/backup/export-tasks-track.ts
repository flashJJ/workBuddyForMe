/**
 * v0.7 M4：tasks 轨序列化辅助——从 export.ts 拆出以满足 300 行门禁。
 * 把 task_runs + task_steps 转为归档可序列化的纯对象结构。
 */
import type { TaskRunView, TaskStepView } from '@wbfm/shared/schemas';
import { createTaskRunRepository } from '@wbfm/database';
import type { DatabaseInstance } from '@wbfm/database';

/** tasks 轨归档负载条目（run + steps） */
export interface TaskTrackEntry {
  run: {
    id: string;
    conversationId: string;
    assistantId: string;
    goal: string;
    status: string;
    stepCount: number;
    failureCount: number;
    maxSteps: number;
    stopReason: string | null;
    createdAt: string;
    updatedAt: string;
    finishedAt: string | null;
  };
  steps: Array<{
    id: string;
    runId: string;
    stepIndex: number;
    kind: string;
    toolName: string | null;
    reason: string;
    argsJson: string;
    resultJson: string;
    screenshotPath: string;
    status: string;
    error: string;
    durationMs: number;
    createdAt: string;
  }>;
}

/** 序列化 task_runs（含其 task_steps）为归档负载 */
export function serializeTasksTrack(db: DatabaseInstance): TaskTrackEntry[] {
  const repo = createTaskRunRepository(db);
  const runs: TaskRunView[] = repo.listAllRuns(10_000);
  return runs.map((run) => ({
    run: {
      id: run.id,
      conversationId: run.conversationId,
      assistantId: run.assistantId,
      goal: run.goal,
      status: run.status,
      stepCount: run.stepCount,
      failureCount: run.failureCount,
      maxSteps: run.maxSteps,
      stopReason: run.stopReason,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      finishedAt: run.finishedAt,
    },
    steps: repo.listSteps(run.id).map((s: TaskStepView) => ({
      id: s.id,
      runId: s.runId,
      stepIndex: s.stepIndex,
      kind: s.kind,
      toolName: s.toolName,
      reason: s.reason,
      argsJson: s.argsJson,
      resultJson: s.resultJson,
      screenshotPath: s.screenshotPath,
      status: s.status,
      error: s.error,
      durationMs: s.durationMs,
      createdAt: s.createdAt,
    })),
  }));
}
