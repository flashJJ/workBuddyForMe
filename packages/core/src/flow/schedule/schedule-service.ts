import { ApiError } from '@wbfm/shared/errors';
import {
  DEFAULT_FLOW_SCHEDULE_TIMEZONE,
  FLOW_SCHEDULE_LIMIT,
  isValidTimeZone,
  nextCronTimeInZone,
  parseCron,
  validateCron,
  type FlowScheduleCreateInput,
  type FlowScheduleUpdateInput,
} from '@wbfm/shared/schemas';
import type { WorkflowScheduleRepository, WorkflowRepository, WorkflowRunRepository } from '@wbfm/database';
import type { FlowScheduleView, WorkflowView } from '@wbfm/shared/types';
import type { CreateRunParams } from '../run/run-service-types';

/**
 * v4.26 流程定时服务：一流程多定时的读写与「立即运行」。
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
  list(workflowId: string): FlowScheduleView[];
  create(workflowId: string, input: FlowScheduleCreateInput): FlowScheduleView;
  update(workflowId: string, scheduleId: string, patch: FlowScheduleUpdateInput): FlowScheduleView;
  remove(workflowId: string, scheduleId: string): boolean;
  runNow(workflowId: string, scheduleId?: string): RunNowResult;
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

function validateCronOrThrow(expression: string): string {
  try {
    return validateCron(expression);
  } catch (error) {
    throw ApiError.validation(error instanceof Error ? error.message : 'cron 表达式不合法');
  }
}

function ensureTimeZone(timezone: string): string {
  if (!isValidTimeZone(timezone)) throw ApiError.validation(`未知时区：${timezone}`);
  return timezone;
}

export function createFlowScheduleService(deps: FlowScheduleServiceDeps): FlowScheduleService {
  const now = deps.now ?? (() => new Date());

  function nextRunOf(cron: string, timezone: string): string {
    try {
      return nextCronTimeInZone(parseCron(cron), now(), timezone).toISOString();
    } catch (error) {
      throw ApiError.validation(error instanceof Error ? error.message : 'cron 表达式不合法');
    }
  }

  function scheduleOf(workflowId: string, scheduleId: string): FlowScheduleView {
    const schedule = deps.schedules.getById(scheduleId);
    if (!schedule || schedule.workflowId !== workflowId) {
      throw ApiError.notFound('定时', scheduleId);
    }
    return schedule;
  }

  function runNow(workflowId: string, scheduleId?: string): RunNowResult {
    const workflow = requireWorkflow(deps.workflows, workflowId);
    if (workflow.status !== 'published' || workflow.publishedVersion === null) {
      return { runId: null, reason: 'not_published' };
    }
    const schedule = scheduleId ? scheduleOf(workflowId, scheduleId) : null;
    if (deps.runs.hasActiveRun(workflowId)) return { runId: null, reason: 'busy' };

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
    list(workflowId) {
      requireWorkflow(deps.workflows, workflowId);
      return deps.schedules.listByWorkflow(workflowId);
    },

    create(workflowId, input) {
      const workflow = requireWorkflow(deps.workflows, workflowId);
      ensurePublished(workflow);
      if (deps.schedules.countByWorkflow(workflowId) >= FLOW_SCHEDULE_LIMIT) {
        throw ApiError.conflict(`每个流程最多 ${FLOW_SCHEDULE_LIMIT} 条定时`);
      }
      const cron = validateCronOrThrow(input.cron);
      const timezone = ensureTimeZone(input.timezone ?? DEFAULT_FLOW_SCHEDULE_TIMEZONE);
      return deps.schedules.create({
        workflowId,
        name: input.name?.trim() ?? '',
        cron,
        timezone,
        enabled: input.enabled ?? true,
        input: input.input ?? null,
        nextRunAt: nextRunOf(cron, timezone),
      });
    },

    update(workflowId, scheduleId, patch) {
      const current = scheduleOf(workflowId, scheduleId);
      const cron = patch.cron === undefined ? current.cron : validateCronOrThrow(patch.cron);
      const timezone = patch.timezone === undefined ? current.timezone : ensureTimeZone(patch.timezone);
      const enabling = patch.enabled === true && !current.enabled;
      if (patch.enabled === true) {
        ensurePublished(requireWorkflow(deps.workflows, workflowId));
      }
      const needsNext = patch.cron !== undefined || patch.timezone !== undefined || enabling;
      const updated = deps.schedules.update(scheduleId, {
        ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
        ...(patch.cron === undefined ? {} : { cron }),
        ...(patch.timezone === undefined ? {} : { timezone }),
        ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
        ...(patch.input === undefined ? {} : { input: patch.input }),
        ...(needsNext ? { nextRunAt: nextRunOf(cron, timezone) } : {}),
      });
      if (!updated) throw ApiError.notFound('定时', scheduleId);
      return updated;
    },

    remove(workflowId, scheduleId) {
      scheduleOf(workflowId, scheduleId);
      return deps.schedules.remove(scheduleId);
    },

    runNow,
  };
}
