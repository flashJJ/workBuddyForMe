import {
  FLOW_COMPENSATION_BACKOFF_MS,
  FLOW_COMPENSATION_MAX_ATTEMPTS,
} from '@wbfm/shared/schemas';
import {
  isUnattendedFlowTrigger,
  type FlowRunCompensationView,
  type FlowRunError,
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

export interface FlowCompensationRecoverResult {
  recovered: number;
  requeued: number;
  exhausted: number;
  cancelled: number;
  skipped: number;
}

export interface FlowCompensationService {
  onRunTerminal(run: WorkflowRunView): void;
  sweep(now?: Date): { claimed: number; started: number; deferred: number; cancelled: number };
  /** v5.0：进程重启后收敛停留在 retrying 的补偿（claim 后崩溃或重放被中断） */
  recover(): FlowCompensationRecoverResult;
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
    if (run.status === 'interrupted') {
      retryOrExhaust(item, run, {
        code: 'flow/compensation-interrupted',
        message: '补偿重放运行被中断',
        retryable: true,
        hint: '补偿重放被中断；将自动重试。',
      });
      return;
    }
    if (run.status !== 'failed') return;
    retryOrExhaust(
      item,
      run,
      classifyFlowRunError(run.error ?? { code: 'flow/run-failed', message: '未知错误' }),
    );
  }

  /** 可重试且未满 3 次 → 排下一次；否则耗尽并审计 */
  function retryOrExhaust(
    item: FlowRunCompensationView,
    run: WorkflowRunView,
    error: FlowRunError,
  ): 'scheduled' | 'exhausted' {
    if (error.retryable === true && item.attempt < FLOW_COMPENSATION_MAX_ATTEMPTS) {
      const nextAttempt = item.attempt + 1;
      const delay = FLOW_COMPENSATION_BACKOFF_MS[nextAttempt - 1] ?? FLOW_COMPENSATION_BACKOFF_MS[2];
      deps.compensations.markPending(
        item.id,
        nextAttempt,
        new Date(now().getTime() + delay).toISOString(),
        JSON.stringify(error),
      );
      return 'scheduled';
    }
    deps.compensations.markExhausted(item.id, JSON.stringify(error));
    appendAudit('flow_compensation_exhausted', run, {
      rootRunId: item.rootRunId,
      workflowId: item.workflowId,
      attempt: item.attempt,
      lastRunId: run.id,
    });
    return 'exhausted';
  }

  /**
   * 进程重启恢复：retrying 记录没有 next_retry_at，listDue 不会再扫到。
   * - claim 后崩溃（无 lastRunId）→ 立即回到 pending；
   * - 重放已终态 → 按成功/失败/取消推进；
   * - 重放被重启收敛为 interrupted → 计一次尝试并排下一次；
   * - 重放仍在排队/执行 → 交给终态事件。
   */
  function recover(): FlowCompensationRecoverResult {
    const result: FlowCompensationRecoverResult = {
      recovered: 0,
      requeued: 0,
      exhausted: 0,
      cancelled: 0,
      skipped: 0,
    };
    for (const item of deps.compensations.listRetrying()) {
      const last = item.lastRunId ? deps.runs.getRun(item.lastRunId) : null;
      if (!last) {
        if (item.lastRunId) {
          deps.compensations.markExhausted(
            item.id,
            JSON.stringify({
              code: 'flow/compensation-run-missing',
              message: '补偿重放运行已被删除，无法判定结果',
            }),
          );
          result.exhausted += 1;
        } else {
          deps.compensations.markPending(
            item.id,
            item.attempt,
            now().toISOString(),
            JSON.stringify(
              item.lastError ?? { code: 'flow/compensation-recover', message: '补偿认领后进程中断' },
            ),
          );
          result.requeued += 1;
        }
        continue;
      }
      if (last.status === 'succeeded') {
        deps.compensations.markRecovered(item.id);
        result.recovered += 1;
        continue;
      }
      if (last.status === 'cancelled') {
        deps.compensations.markCancelled(item.id);
        result.cancelled += 1;
        continue;
      }
      if (last.status === 'failed') {
        const outcome = retryOrExhaust(
          item,
          last,
          classifyFlowRunError(last.error ?? { code: 'flow/run-failed', message: '未知错误' }),
        );
        if (outcome === 'scheduled') result.requeued += 1;
        else result.exhausted += 1;
        continue;
      }
      if (last.status === 'interrupted') {
        const outcome = retryOrExhaust(item, last, {
          code: 'flow/compensation-interrupted',
          message: '补偿重放在进程重启时中断',
          retryable: true,
          hint: '进程重启导致补偿中断；将自动重试。',
        });
        if (outcome === 'scheduled') result.requeued += 1;
        else result.exhausted += 1;
        continue;
      }
      result.skipped += 1;
    }
    return result;
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
        // 补偿是系统自动重试：沿用原运行的触发方式，保持无人值守策略与交互语义
        const root = deps.runs.getRun(item.rootRunId);
        const replay = deps.replay.replayOne({
          runId: item.lastRunId ?? item.rootRunId,
          mode: 'snapshot',
          nodeMode: 'failed_node',
          trigger: root?.trigger ?? 'manual',
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
    recover,
    list: (workflowId) => deps.compensations.listByWorkflow(workflowId),
    lastSweepAt: () => lastSweep,
  };
}
