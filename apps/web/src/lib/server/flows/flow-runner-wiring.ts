import {
  createWorkflowRunRepository,
  type DatabaseInstance,
  type WorkflowEndpointRepository,
  type WorkflowRepository,
} from '@wbfm/database';
import {
  createFlowRunService,
  type FlowRunServiceDeps,
  type FlowRunService,
} from '@wbfm/core/flow';
import type { AgentRunService, ServiceDeps, ToolRuntime } from '@wbfm/core';

/** v5.0：FlowRunner 装配（从 container 拆出以控行数） */
export function createFlowRunnerWiring(params: {
  db: DatabaseInstance;
  deps: ServiceDeps;
  runtime: ToolRuntime;
  workflows: WorkflowRepository;
  endpoints: WorkflowEndpointRepository;
  agentRuns?: AgentRunService;
  onEvent: NonNullable<FlowRunServiceDeps['onEvent']>;
}): { runs: ReturnType<typeof createWorkflowRunRepository>; flowRunner: FlowRunService } {
  const runs = createWorkflowRunRepository(params.db);
  const flowRunner = createFlowRunService({
    deps: params.deps,
    runtime: params.runtime,
    workflows: params.workflows,
    runs,
    endpoints: params.endpoints,
    ...(params.agentRuns ? { agentRuns: params.agentRuns } : {}),
    onEvent: params.onEvent,
  });
  return { runs, flowRunner };
}
