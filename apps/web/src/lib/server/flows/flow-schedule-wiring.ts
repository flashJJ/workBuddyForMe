import {
  createWorkflowScheduleRepository,
  type DatabaseInstance,
  type WorkflowRepository,
  type WorkflowRunRepository,
} from '@wbfm/database';
import {
  createFlowScheduleScheduler,
  createFlowScheduleService,
  type FlowScheduleRunner,
} from '@wbfm/core/flow';

/**
 * v4.24：流程定时触发的容器装配。
 * 拆出 container 以控制单文件行数；调度器默认随容器启动（unref 定时器）。
 */
export function createFlowScheduleWiring(params: {
  db: DatabaseInstance;
  workflows: WorkflowRepository;
  runs: WorkflowRunRepository;
  flowRunner: FlowScheduleRunner;
  start?: boolean;
}) {
  const schedules = createWorkflowScheduleRepository(params.db);
  const service = createFlowScheduleService({
    schedules,
    workflows: params.workflows,
    runs: params.runs,
    flowRunner: params.flowRunner,
  });
  const scheduler = createFlowScheduleScheduler({
    schedules,
    workflows: params.workflows,
    runs: params.runs,
    flowRunner: params.flowRunner,
  });
  if (params.start ?? process.env.NODE_ENV !== 'test') scheduler.start();
  return { service, scheduler, schedules };
}

export type FlowScheduleWiring = ReturnType<typeof createFlowScheduleWiring>;
