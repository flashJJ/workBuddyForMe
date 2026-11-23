import type { AuditService, FlowRunReplayRunner } from '@wbfm/core';
import type { FlowScheduleRunner } from '@wbfm/core/flow';
import type {
  DatabaseInstance,
  WorkflowEndpointRepository,
  WorkflowRepository,
  WorkflowRunRepository,
} from '@wbfm/database';
import { createFlowScheduleWiring } from './flow-schedule-wiring';
import { createFlowTriggerWiring } from './flow-trigger-wiring';
import { createFlowReliabilityWiring } from './flow-reliability-wiring';
import type { SecretCipher } from '@wbfm/core/secrets';

/** v5.0：Flow 运行时装配（定时/事件触发/兜底），从 container 拆出以控行数 */
export function createFlowRuntimeWiring(params: {
  db: DatabaseInstance;
  workflows: WorkflowRepository;
  runs: WorkflowRunRepository;
  flowRunner: FlowScheduleRunner & FlowRunReplayRunner;
  endpoints: WorkflowEndpointRepository;
  cipher: SecretCipher;
  audit?: AuditService;
}) {
  const schedules = createFlowScheduleWiring({
    db: params.db,
    workflows: params.workflows,
    runs: params.runs,
    flowRunner: params.flowRunner,
  });
  const triggers = createFlowTriggerWiring({
    db: params.db,
    workflows: params.workflows,
    runs: params.runs,
    flowRunner: params.flowRunner,
    cipher: params.cipher,
  });
  const reliability = createFlowReliabilityWiring({
    db: params.db,
    workflows: params.workflows,
    runs: params.runs,
    flowRunner: params.flowRunner,
    schedules: schedules.schedules,
    triggers: triggers.triggers,
    scheduler: schedules.scheduler,
    fileWatcher: triggers.watcher,
    endpoints: params.endpoints,
    ...(params.audit ? { audit: params.audit } : {}),
  });
  return { schedules, triggers, reliability };
}
