import {
  createFlowRunCompensationRepository,
  createSettingsRepository,
  createWorkflowRunRepository,
  type DatabaseInstance,
  type WorkflowEndpointRepository,
  type WorkflowRepository,
  type WorkflowScheduleRepository,
  type WorkflowTriggerRepository,
} from '@wbfm/database';
import {
  createFlowCompensationService,
  createFlowRetentionService,
  createFlowRunReplayService,
  createFlowRuntimeHealthService,
  type FlowCompensationService,
  type FlowFileWatcher,
  type FlowRetentionService,
  type FlowRunReplayRunner,
  type FlowRunReplayService,
  type FlowRuntimeHealthService,
  type FlowScheduleScheduler,
} from '@wbfm/core/flow';
import type { AuditService } from '@wbfm/core';

/**
 * v5.0 运行兜底装配：补偿 + 单条/批量重放 + 保留清理 + 健康。
 * - 补偿 60s、清理启动后 5 分钟 + 24h；测试环境不启动定时器；
 * - 与 runs 仓储共用同一实例。
 */
export function createFlowReliabilityWiring(params: {
  db: DatabaseInstance;
  workflows: WorkflowRepository;
  runs: ReturnType<typeof createWorkflowRunRepository>;
  flowRunner: FlowRunReplayRunner;
  schedules: WorkflowScheduleRepository;
  triggers: WorkflowTriggerRepository;
  scheduler?: FlowScheduleScheduler;
  fileWatcher?: FlowFileWatcher;
  endpoints?: WorkflowEndpointRepository;
  audit?: AuditService;
  start?: boolean;
}) {
  const settings = createSettingsRepository(params.db);
  const compensations = createFlowRunCompensationRepository(params.db);
  const replay: FlowRunReplayService = createFlowRunReplayService({
    runs: params.runs,
    workflows: params.workflows,
    flowRunner: params.flowRunner,
  });
  const service: FlowCompensationService = createFlowCompensationService({
    runs: params.runs,
    compensations,
    workflows: params.workflows,
    replay,
    ...(params.audit ? { audit: params.audit } : {}),
  });
  const retention: FlowRetentionService = createFlowRetentionService({
    runs: params.runs,
    workflows: params.workflows,
    compensations,
    settings,
    ...(params.audit ? { audit: params.audit } : {}),
  });
  const health: FlowRuntimeHealthService = createFlowRuntimeHealthService({
    workflows: params.workflows,
    ...(params.endpoints ? { endpoints: params.endpoints } : {}),
    schedules: params.schedules,
    triggers: params.triggers,
    compensations,
    compensation: service,
    settings,
    ...(params.scheduler ? { scheduler: params.scheduler } : {}),
    ...(params.fileWatcher ? { fileWatcher: params.fileWatcher } : {}),
  });

  let sweepTimer: ReturnType<typeof setInterval> | null = null;
  let cleanupStart: ReturnType<typeof setTimeout> | null = null;
  let cleanupTimer: ReturnType<typeof setInterval> | null = null;
  if (params.start ?? process.env.NODE_ENV !== 'test') {
    try {
      // 先收敛上次进程遗留的 retrying（claim 后崩溃/重放被中断），再扫到期补偿
      const recovered = service.recover();
      if (
        recovered.recovered > 0 ||
        recovered.requeued > 0 ||
        recovered.exhausted > 0 ||
        recovered.cancelled > 0
      ) {
        console.info(
          `[flow] 补偿队列恢复：恢复 ${recovered.recovered}，续跑 ${recovered.requeued}，耗尽 ${recovered.exhausted}，取消 ${recovered.cancelled}`,
        );
      }
    } catch (error) {
      console.warn('[flow] 补偿队列恢复失败', error);
    }
    try {
      service.sweep();
    } catch (error) {
      console.warn('[flow] 补偿队列首次扫描失败', error);
    }
    sweepTimer = setInterval(() => {
      try {
        service.sweep();
      } catch (error) {
        console.warn('[flow] 补偿队列扫描失败', error);
      }
    }, 60_000);
    sweepTimer.unref?.();

    const runCleanup = () => {
      try {
        retention.cleanup();
      } catch (error) {
        console.warn('[flow] 运行保留清理失败', error);
      }
    };
    cleanupStart = setTimeout(runCleanup, 5 * 60_000);
    cleanupStart.unref?.();
    cleanupTimer = setInterval(runCleanup, 24 * 3600_000);
    cleanupTimer.unref?.();
  }

  return {
    service,
    replay,
    compensations,
    retention,
    health,
    dispose() {
      if (sweepTimer) clearInterval(sweepTimer);
      if (cleanupTimer) clearInterval(cleanupTimer);
      if (cleanupStart) clearTimeout(cleanupStart);
      sweepTimer = null;
      cleanupTimer = null;
      cleanupStart = null;
    },
  };
}

export type FlowReliabilityWiring = ReturnType<typeof createFlowReliabilityWiring>;
