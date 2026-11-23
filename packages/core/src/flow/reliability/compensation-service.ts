import {
  FLOW_COMPENSATION_BACKOFF_MS,
  FLOW_COMPENSATION_MAX_ATTEMPTS,
} from '@wbfm/shared/schemas';
import {
  isUnattendedFlowTrigger,
  type FlowRunCompensationView,
  type WorkflowRunView,
} from '@wbfm/shared/types';
import type {
  FlowRunCompensationRepository,
  WorkflowRepository,
  WorkflowRunRepository,
} from '@wbfm/database';
import type { AuditService } from '../../governance/audit';
import { classifyFlowRunError } from './failure-classifier';
import type { FlowRunReplayService } from './run-replay-service';

/**
 * v5.0 失败补偿队列：
 * - 仅无人值守 failed + 可重试错误；
 * - 原运行 + 最多 3 次重试（30s/2m/10m）；
 * - 补偿重放走 run-replay-service 的快照模式；
 * - 同流程有在途运行时顺延 60s，不消耗尝试次数。
 */

export interface FlowCompensationDeps {
  runs: WorkflowRunRepository;
  compensations: FlowRunCompensationRepository;
  workflows: WorkflowRepository;
  replay: FlowRunReplayService;
  audit?: AuditService;
  now?: () => Date;
}

export interface FlowCompensationService {
  onRunTerminal(run: WorkflowRunView): void;
  sweep(now?: Date): { claimed: number; started: number; deferred: number; cancelled: number };
  list(workflowId: string): FlowRunCompensationView[];
  lastSweepAt(): string | null;
}

export function createFlowCompensationService(
  deps: FlowCompensationDeps,
): FlowCompensationService {
  const now = deps.now ?? (() => new Date());
  let lastSweep: string | null = null;

  function onRunTerminal(run: WorkflowRunView): void {
    const existing = deps.compensations.getByLastRun(run.id);
    if (existing) {
      handleRetryResult(existing, run);
      return;
    }
    if (run.status !== 'failed' || run.parentRunId) return;
    if (!isUnattendedFlowTrigger(run.trigger)) return;
    if (deps.compensations.getByRootRun(run.id)) return;
    const workflow = deps.workflows.getWorkflow(run.workflowId);
    if (!workflow || workflow.status === 'disabled') return;
    const error = classifyFlowRunError(run.error ?? { code: 'flow/run-failed', message: '未知错误' });
    if (!error.retryable) return;

    const nextRetryAt = new Date(now().getTime() + FLOW_COMPENSATION_BACKOFF_MS[0]).toISOString();
    deps.compensations.create({
      rootRunId: run.id,
      workflowId: run.workflowId,
      attempt: 1,
      nextRetryAt,
      lastErrorJson: JSON.stringify(error),
    });
    appendAudit('flow_compensation_scheduled', run, {
      rootRunId: run.id,
      workflowId: run.workflowId,
      attempt: 1,
      nextRetryAt,
    });
  }

  function handleRetryResult(item: FlowRunCompensationView, run: WorkflowRunView): void {
    if (item.state !== 'retrying') return;
    if (run.status === 'succeeded') {
      deps.compensations.markRecovered(item.id);
      return;
    }
    if (run.status === 'cancelled') {
      deps.compensations.markCancelled(item.id);
      return;
    }
    if (run.status !== 'failed') return;
    const error = classifyFlowRunError(run.error ?? { code: 'flow/run-failed', message: '未知错误' });
    if (error.retryable && item.attempt < FLOW_COMPENSATION_MAX_ATTEMPTS) {
      const nextAttempt = item.attempt + 1;
      const delay = FLOW_COMPENSATION_BACKOFF_MS[nextAttempt - 1] ?? FLOW_COMPENSATION_BACKOFF_MS[2];
      deps.compensations.markPending(
        item.id,
        nextAttempt,
        new Date(now().getTime() + delay).toISOString(),
        JSON.stringify(error),
      );
      return;
    }
    const errorJson = JSON.stringify(error);
    deps.compensations.markExhausted(item.id, errorJson);
    appendAudit('flow_compensation_exhausted', run, {
      rootRunId: item.rootRunId,
      workflowId: item.workflowId,
      attempt: item.attempt,
      lastRunId: run.id,
    });
  }

  function sweep(at = now()) {
    const result = { claimed: 0, started: 0, deferred: 0, cancelled: 0 };
    const due = deps.compensations.listDue(at.toISOString(), 100);
    for (const item of due) {
      const workflow = deps.workflows.getWorkflow(item.workflowId);
      if (!workflow || workflow.status === 'disabled') {
        deps.compensations.markCancelled(item.id);
        result.cancelled += 1;
        continue;
      }
      if (item.attempt > FLOW_COMPENSATION_MAX_ATTEMPTS) {
        deps.compensations.markExhausted(
          item.id,
          JSON.stringify(item.lastError ?? { code: 'flow/compensation-exhausted', message: '补偿次数已用尽' }),
        );
        continue;
      }
      const expected = item.nextRetryAt;
      if (!expected || !deps.compensations.claim(item.id, expected)) continue;
      result.claimed += 1;
      if (deps.runs.hasActiveRun(item.workflowId)) {
        deps.compensations.markPending(
          item.id,
          item.attempt,
          new Date(at.getTime() + 60_000).toISOString(),
          JSON.stringify(item.lastError ?? { code: 'flow/compensation-deferred', message: '流程在途，顺延补偿' }),
        );
        result.deferred += 1;
        continue;
      }
      try {
        const replay = deps.replay.replayOne({
          runId: item.lastRunId ?? item.rootRunId,
          mode: 'snapshot',
          nodeMode: 'failed_node',
        });
        deps.compensations.markRetrying(item.id, replay.runId);
        result.started += 1;
      } catch (error) {
        deps.compensations.markExhausted(
          item.id,
          JSON.stringify({
            code: 'flow/compensation-replay-failed',
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
    lastSweep = at.toISOString();
    return result;
  }

  function appendAudit(
    kind: 'flow_compensation_scheduled' | 'flow_compensation_exhausted',
    run: WorkflowRunView,
    payload: Record<string, unknown>,
  ): void {
    deps.audit?.safeAppend({
      kind,
      actor: 'system',
      runId: run.id,
      reasonCode: kind,
      outcome: JSON.stringify(payload),
    });
  }

  return {
    onRunTerminal,
    sweep,
    list: (workflowId) => deps.compensations.listByWorkflow(workflowId),
    lastSweepAt: () => lastSweep,
  };
}
