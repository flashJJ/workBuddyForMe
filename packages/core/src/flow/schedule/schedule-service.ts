import { ApiError } from '@wbfm/shared/errors';
import { nextCronTime, parseCron, validateCron, type FlowScheduleUpsertInput } from '@wbfm/shared/schemas';
import type { WorkflowScheduleRepository, WorkflowRepository, WorkflowRunRepository } from '@wbfm/database';
import type { FlowScheduleView, WorkflowView } from '@wbfm/shared/types';
import type { CreateRunParams } from '../run/run-service-types';

/**
 * v4.24 流程定时服务：配置读写与「立即运行」。
 * 定时调度本身由 scheduler 负责；这里只做校验、下次时间计算与单飞判断。
 */

export interface FlowScheduleRunner {
  createRun(params: CreateRunParams): string;
}

export interface FlowScheduleServiceDeps {
  schedules: WorkflowScheduleRepository;
  workflows: WorkflowRepository;
  runs: WorkflowRunRepository;
  flowRunner: FlowScheduleRunner;
  now?: () => Date;
}

export interface RunNowResult {
  runId: string | null;
  reason?: 'busy' | 'not_published';
}

export interface FlowScheduleService {
  get(workflowId: string): FlowScheduleView | null;
  upsert(workflowId: string, input: FlowScheduleUpsertInput): FlowScheduleView;
  remove(workflowId: string): boolean;
  runNow(workflowId: string): RunNowResult;
}

function requireWorkflow(workflows: WorkflowRepository, workflowId: string): WorkflowView {
  const workflow = workflows.getWorkflow(workflowId);
  if (!workflow) throw ApiError.notFound('工作流', workflowId);
  return workflow;
}

function ensurePublished(workflow: WorkflowView): void {
  if (workflow.status !== 'published' || workflow.publishedVersion === null) {
    throw ApiError.conflict('工作流尚未发布，请先发布后再配置定时');
  }
}

export function createFlowScheduleService(deps: FlowScheduleServiceDeps): FlowScheduleService {
  const now = deps.now ?? (() => new Date());

  function runNow(workflowId: string): RunNowResult {
    const workflow = requireWorkflow(deps.workflows, workflowId);
    if (workflow.status !== 'published' || workflow.publishedVersion === null) {
      return { runId: null, reason: 'not_published' };
    }
    if (deps.runs.hasActiveRun(workflowId)) return { runId: null, reason: 'busy' };

    const schedule = deps.schedules.getByWorkflow(workflowId);
    const at = now();
    const runId = deps.flowRunner.createRun({
      workflowId,
      trigger: 'schedule',
      input: {
        ...(schedule?.input ?? {}),
        scheduledAt: at.toISOString(),
        ...(schedule ? { scheduleId: schedule.id } : {}),
      },
    });
    if (schedule) {
      deps.schedules.recordOutcome(schedule.id, {
        lastRunAt: at.toISOString(),
        lastRunId: runId,
        lastStatus: 'created',
      });
    }
    return { runId };
  }

  return {
    get(workflowId) {
      requireWorkflow(deps.workflows, workflowId);
      return deps.schedules.getByWorkflow(workflowId);
    },

    upsert(workflowId, input) {
      const workflow = requireWorkflow(deps.workflows, workflowId);
      ensurePublished(workflow);
      let cron: string;
      let nextRunAt: string;
      try {
        cron = validateCron(input.cron);
        nextRunAt = nextCronTime(parseCron(cron), now()).toISOString();
      } catch (error) {
        throw ApiError.validation(error instanceof Error ? error.message : 'cron 表达式不合法');
      }
      return deps.schedules.upsert({
        workflowId,
        cron,
        enabled: input.enabled ?? true,
        input: input.input ?? null,
        nextRunAt,
      });
    },

    remove(workflowId) {
      requireWorkflow(deps.workflows, workflowId);
      return deps.schedules.removeByWorkflow(workflowId);
    },

    runNow,
  };
}
