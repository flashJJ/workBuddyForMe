import { nextCronTimeInZone, parseCron } from '@wbfm/shared/schemas';
import type { WorkflowScheduleRepository, WorkflowRepository, WorkflowRunRepository } from '@wbfm/database';
import type { FlowScheduleLastStatus } from '@wbfm/shared/types';
import type { FlowScheduleRunner } from './schedule-service';

/**
 * v4.26 进程内调度器：
 * - 每 30 秒扫描到期调度，原子认领后按该条时区推进 next_run_at；
 * - 启动立即 tick 一次，覆盖应用关闭期间错过的执行（只补一次）；
 * - 同流程在途运行时跳过并记录 skipped_busy。
 */

export interface FlowScheduleSchedulerDeps {
  schedules: WorkflowScheduleRepository;
  workflows: WorkflowRepository;
  runs: WorkflowRunRepository;
  flowRunner: FlowScheduleRunner;
  now?: () => Date;
  intervalMs?: number;
  catchUpOnStart?: boolean;
}

export interface TickResult {
  due: number;
  created: number;
  skippedBusy: number;
  errored: number;
}

export interface FlowScheduleScheduler {
  start(): void;
  tick(at?: Date): Promise<TickResult>;
  dispose(): void;
}

const DEFAULT_INTERVAL_MS = 30_000;

export function createFlowScheduleScheduler(deps: FlowScheduleSchedulerDeps): FlowScheduleScheduler {
  const now = deps.now ?? (() => new Date());
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  function record(id: string, at: Date, status: FlowScheduleLastStatus, runId?: string): void {
    deps.schedules.recordOutcome(id, {
      lastRunAt: at.toISOString(),
      lastRunId: runId ?? null,
      lastStatus: status,
    });
  }

  async function tick(at: Date = now()): Promise<TickResult> {
    const result: TickResult = { due: 0, created: 0, skippedBusy: 0, errored: 0 };
    if (running) return result;
    running = true;
    try {
      const due = deps.schedules.listDue(at.toISOString());
      result.due = due.length;
      for (const schedule of due) {
        let nextRunAt: string;
        try {
          nextRunAt = nextCronTimeInZone(parseCron(schedule.cron), at, schedule.timezone).toISOString();
        } catch {
          // 配置永久无效（cron/时区）：记录错误并停用，避免每 30 秒重复失败
          record(schedule.id, at, 'error');
          deps.schedules.update(schedule.id, { enabled: false });
          result.errored += 1;
          continue;
        }
        // 原子认领：推进失败说明已被其他 tick 处理
        if (!deps.schedules.claimDue(schedule.id, schedule.nextRunAt, nextRunAt)) continue;

        const workflow = deps.workflows.getWorkflow(schedule.workflowId);
        if (!workflow || workflow.status !== 'published' || workflow.publishedVersion === null) {
          record(schedule.id, at, 'error');
          result.errored += 1;
          continue;
        }
        if (deps.runs.hasActiveRun(schedule.workflowId)) {
          record(schedule.id, at, 'skipped_busy');
          result.skippedBusy += 1;
          continue;
        }
        try {
          const runId = deps.flowRunner.createRun({
            workflowId: schedule.workflowId,
            trigger: 'schedule',
            input: {
              ...(schedule.input ?? {}),
              scheduledAt: at.toISOString(),
              scheduleId: schedule.id,
            },
          });
          record(schedule.id, at, 'created', runId);
          result.created += 1;
        } catch {
          record(schedule.id, at, 'error');
          result.errored += 1;
        }
      }
    } finally {
      running = false;
    }
    return result;
  }

  return {
    start() {
      if (timer) return;
      if (deps.catchUpOnStart !== false) {
        void tick().catch((error) => console.warn('[flow-schedule] 启动补跑失败：', error));
      }
      timer = setInterval(() => {
        void tick().catch((error) => console.warn('[flow-schedule] 调度 tick 失败：', error));
      }, intervalMs);
      timer.unref?.();
    },
    tick,
    dispose() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
