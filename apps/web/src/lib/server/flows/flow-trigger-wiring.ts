import {
  createWorkflowTriggerRepository,
  type DatabaseInstance,
  type WorkflowRepository,
  type WorkflowRunRepository,
} from '@wbfm/database';
import {
  createFlowFileWatcher,
  createFlowTriggerService,
  type FlowFileWatcher,
  type FlowTriggerRunner,
} from '@wbfm/core/flow';
import type { SecretCipher } from '@wbfm/core/secrets';

/**
 * v4.25：事件触发装配。
 * - service 负责配置、鉴权、单飞与状态；
 * - file watcher 默认随容器启动（测试环境不启动）；
 * - 触发器增删改后立即 reconcile。
 */
export function createFlowTriggerWiring(params: {
  db: DatabaseInstance;
  workflows: WorkflowRepository;
  runs: WorkflowRunRepository;
  flowRunner: FlowTriggerRunner;
  cipher?: SecretCipher;
  start?: boolean;
}) {
  const triggers = createWorkflowTriggerRepository(params.db);
  let watcher: FlowFileWatcher | null = null;
  const service = createFlowTriggerService({
    triggers,
    workflows: params.workflows,
    runs: params.runs,
    flowRunner: params.flowRunner,
    onChange: () => watcher?.reconcile(),
    ...(params.cipher ? { cipher: params.cipher } : {}),
  });
  watcher = createFlowFileWatcher({
    triggers,
    fire: (trigger, file) => service.fireFile(trigger, file),
    onError: (triggerId) => service.markError(triggerId),
  });
  if (params.start ?? process.env.NODE_ENV !== 'test') watcher.start();
  return { service, watcher, triggers };
}

export type FlowTriggerWiring = ReturnType<typeof createFlowTriggerWiring>;
