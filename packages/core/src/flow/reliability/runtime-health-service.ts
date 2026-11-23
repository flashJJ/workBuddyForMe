import type { FlowRuntimeHealthView } from '@wbfm/shared/types';
import type {
  WorkflowEndpointRepository,
  WorkflowRepository,
  WorkflowRunRepository,
  WorkflowScheduleRepository,
  WorkflowTriggerRepository,
  FlowRunCompensationRepository,
  SettingsRepository,
} from '@wbfm/database';
import type { FlowScheduleSchedulerStats } from '../schedule/scheduler';
import type { FlowCompensationService } from './compensation-service';

/**
 * v5.0 运行健康：只读聚合调度心跳、文件监听、补偿、端点、定时与事件触发。
 * 不做自动停用，也不推断 Webhook 上游节奏。
 */

export interface FlowRuntimeHealthDeps {
  workflows: WorkflowRepository;
  endpoints?: WorkflowEndpointRepository;
  schedules: WorkflowScheduleRepository;
  triggers: WorkflowTriggerRepository;
  compensations: FlowRunCompensationRepository;
  compensation?: FlowCompensationService;
  settings: SettingsRepository;
  scheduler?: { stats(): FlowScheduleSchedulerStats };
  fileWatcher?: {
    stats(): {
      active: boolean;
      watchingCount: number;
      lastEventAt: string | null;
      lastError: string | null;
    };
  };
  now?: () => Date;
}

export interface FlowRuntimeHealthService {
  snapshot(): FlowRuntimeHealthView;
}

const TICK_MS = 30_000;

export function createFlowRuntimeHealthService(
  deps: FlowRuntimeHealthDeps,
): FlowRuntimeHealthService {
  const now = deps.now ?? (() => new Date());

  return {
    snapshot(): FlowRuntimeHealthView {
      const at = now();
      const scheduler = deps.scheduler?.stats() ?? {
        running: false,
        startedAt: null,
        lastTickAt: null,
        tickCount: 0,
        lastError: null,
      };
      const fileWatcher = deps.fileWatcher?.stats() ?? {
        active: false,
        watchingCount: 0,
        lastEventAt: null,
        lastError: null,
      };
      const stalled =
        !scheduler.startedAt ||
        !scheduler.lastTickAt ||
        at.getTime() - Date.parse(scheduler.lastTickAt) > TICK_MS * 3;
      const workflows = deps.workflows.listWorkflows(200);
      const names = new Map(workflows.map((workflow) => [workflow.id, workflow.name]));
      const counts = deps.compensations.countsByState();
      return {
        generatedAt: at.toISOString(),
        scheduler: {
          running: scheduler.running,
          startedAt: scheduler.startedAt,
          lastTickAt: scheduler.lastTickAt,
          tickCount: scheduler.tickCount,
          stalled,
          lastError: scheduler.lastError,
        },
        fileWatcher,
        compensation: {
          pending: counts.pending,
          exhausted: counts.exhausted,
          lastSweepAt: deps.compensation?.lastSweepAt() ?? null,
        },
        endpoints: workflows.flatMap((workflow) => {
          const endpoint = deps.endpoints?.getByWorkflowId(workflow.id);
          if (!endpoint) return [];
          return [
            {
              endpointId: endpoint.id,
              workflowId: workflow.id,
              workflowName: workflow.name,
              httpEnabled: endpoint.httpEnabled,
              mcpEnabled: endpoint.mcpEnabled,
              status: endpoint.status,
              lastUsedAt: endpoint.lastUsedAt,
              policyRevalidationRequired: endpoint.policyRevalidationRequired,
            },
          ];
        }),
        schedules: deps.schedules.listAll(200).map((schedule) => ({
          scheduleId: schedule.id,
          workflowId: schedule.workflowId,
          workflowName: names.get(schedule.workflowId) ?? '(已删除流程)',
          name: schedule.name,
          cron: schedule.cron,
          timezone: schedule.timezone,
          enabled: schedule.enabled,
          nextRunAt: schedule.nextRunAt,
          lastRunAt: schedule.lastRunAt,
          lastStatus: schedule.lastStatus,
          missedCount: schedule.missedCount,
          lastMissedAt: schedule.lastMissedAt,
        })),
        triggers: deps.triggers.listAll(200).map((trigger) => ({
          triggerId: trigger.id,
          workflowId: trigger.workflowId,
          workflowName: names.get(trigger.workflowId) ?? '(已删除流程)',
          kind: trigger.kind,
          name: trigger.name,
          enabled: trigger.enabled,
          lastFiredAt: trigger.lastFiredAt,
          lastRunId: trigger.lastRunId,
          lastStatus: trigger.lastStatus,
        })),
        retention: {
          lastCleanupAt: deps.settings.getJson('flows.runRetention.lastCleanupAt', null) as
            | string
            | null,
          removedTotal: deps.settings.getJson('flows.runRetention.removedTotal', 0) as number,
        },
      };
    },
  };
}
